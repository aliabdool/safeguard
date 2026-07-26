import { beforeEach, describe, expect, it } from "vitest";

import { AuthError, type AuthContext } from "../pure/permissions";
import {
  closeCapa,
  createCapa,
  updateCapaProgress,
  verifyCapa,
  type AuditEntry,
  type AuditLogger,
  type CapaProgressNoteRecord,
  type CapaRecord,
  type CapaRepo,
  type CapaVerificationRecord,
} from "./capa-service";

const PROPERTY_A = "prop-la-pirogue";
const PROPERTY_B = "prop-sugar-beach";
const DEPT_HOUSEKEEPING = "dept-housekeeping";
const DEPT_FRONT_OFFICE = "dept-front-office";

class FakeCapaRepo implements CapaRepo {
  private capas = new Map<string, CapaRecord>();
  private progressNotes: CapaProgressNoteRecord[] = [];
  private verifications: CapaVerificationRecord[] = [];
  private counter = 0;
  private nextId(prefix: string) {
    this.counter += 1;
    return `${prefix}-${this.counter}`;
  }

  async insertCapa(row: Omit<CapaRecord, "id">) {
    const rec: CapaRecord = { ...row, id: this.nextId("capa") };
    this.capas.set(rec.id, rec);
    return rec;
  }
  async getCapa(id: string) {
    return this.capas.get(id);
  }
  async updateCapaStatus(id: string, status: CapaRecord["status"]) {
    const capa = this.capas.get(id);
    if (capa) capa.status = status;
  }
  async insertProgressNote(row: Omit<CapaProgressNoteRecord, "id">) {
    const rec: CapaProgressNoteRecord = { ...row, id: this.nextId("note") };
    this.progressNotes.push(rec);
    return rec;
  }
  async insertVerification(row: Omit<CapaVerificationRecord, "id">) {
    const rec: CapaVerificationRecord = { ...row, id: this.nextId("verification") };
    this.verifications.push(rec);
    return rec;
  }
}

class FakeAuditLogger implements AuditLogger {
  entries: AuditEntry[] = [];
  async log(entry: AuditEntry) {
    this.entries.push(entry);
  }
}

function makeCtx(overrides: Partial<AuthContext> = {}): AuthContext {
  return {
    userId: "user-1",
    status: "active",
    roleCodes: [],
    propertyIds: [],
    departmentAccess: new Map(),
    medicalPermissions: new Set(),
    ...overrides,
  };
}

let repo: FakeCapaRepo;
let audit: FakeAuditLogger;

beforeEach(() => {
  repo = new FakeCapaRepo();
  audit = new FakeAuditLogger();
});

async function makeCapa(overrides: Partial<Parameters<typeof createCapa>[3]> = {}) {
  const hsOfficer = makeCtx({
    userId: "hs-officer-1",
    roleCodes: ["PROPERTY_HS_OFFICER"],
    propertyIds: [PROPERTY_A],
  });
  return createCapa(repo, audit, hsOfficer, {
    capaNumber: "CAPA-2026-0001",
    propertyId: PROPERTY_A,
    departmentId: DEPT_HOUSEKEEPING,
    title: "Repair loose stair handrail",
    description: null,
    sourceType: "incident",
    sourceId: "incident-1",
    ownerId: "owner-1",
    verifierId: "verifier-1",
    dueDate: "2026-08-15",
    ...overrides,
  });
}

describe("CAPA owner and verifier must always be different people", () => {
  it("creates a CAPA with distinct owner and verifier", async () => {
    const capa = await makeCapa();
    expect(capa.ownerId).toBe("owner-1");
    expect(capa.verifierId).toBe("verifier-1");
    expect(capa.status).toBe("open");
  });

  it("rejects creating a CAPA where owner and verifier are the same person", async () => {
    await expect(makeCapa({ ownerId: "same-person", verifierId: "same-person" })).rejects.toThrow(
      /owner and verifier must be different people/,
    );
  });

  it("does not write a CAPA row at all when the owner/verifier rule is violated", async () => {
    await expect(makeCapa({ ownerId: "same-person", verifierId: "same-person" })).rejects.toThrow();
    // FakeCapaRepo has no getCapa match since insertCapa never ran — proven indirectly via a
    // fresh CAPA number lookup failing downstream operations, so assert via a second, valid
    // create succeeding with id capa-1 (the counter wasn't advanced by the rejected attempt).
    const capa = await makeCapa();
    expect(capa.id).toBe("capa-1");
  });
});

describe("property and department scoping on CAPA", () => {
  it("cannot create a CAPA for a property the user has no access to", async () => {
    const hsOfficer = makeCtx({ roleCodes: ["PROPERTY_HS_OFFICER"], propertyIds: [PROPERTY_A] });
    await expect(
      createCapa(repo, audit, hsOfficer, {
        capaNumber: "CAPA-2026-0002",
        propertyId: PROPERTY_B,
        departmentId: null,
        title: "Cross-hotel attempt",
        description: null,
        sourceType: "audit_finding",
        sourceId: null,
        ownerId: "owner-1",
        verifierId: "verifier-1",
        dueDate: "2026-08-15",
      }),
    ).rejects.toThrow(AuthError);
  });

  it("a Department Manager can only update CAPA in their granted department", async () => {
    const capa = await makeCapa();
    const deptManagerWrongDept = makeCtx({
      roleCodes: ["DEPARTMENT_MANAGER"],
      propertyIds: [PROPERTY_A],
      departmentAccess: new Map([[PROPERTY_A, new Set([DEPT_FRONT_OFFICE])]]),
    });
    await expect(
      updateCapaProgress(repo, audit, deptManagerWrongDept, capa.id, { note: "Not my department" }),
    ).rejects.toThrow(AuthError);

    const deptManagerRightDept = makeCtx({
      roleCodes: ["DEPARTMENT_MANAGER"],
      propertyIds: [PROPERTY_A],
      departmentAccess: new Map([[PROPERTY_A, new Set([DEPT_HOUSEKEEPING])]]),
    });
    const updated = await updateCapaProgress(repo, audit, deptManagerRightDept, capa.id, {
      note: "New handrail bracket ordered.",
    });
    expect(updated.status).toBe("open");
  });
});

describe("CAPA status workflow", () => {
  it("an owner can progress a CAPA from open to in_progress to pending_verification", async () => {
    const capa = await makeCapa();
    const owner = makeCtx({ userId: "owner-1", roleCodes: ["PROPERTY_HS_OFFICER"], propertyIds: [PROPERTY_A] });

    const step1 = await updateCapaProgress(repo, audit, owner, capa.id, {
      note: "Started work",
      newStatus: "in_progress",
    });
    expect(step1.status).toBe("in_progress");

    const step2 = await updateCapaProgress(repo, audit, owner, capa.id, {
      note: "Handrail replaced, ready for verification",
      newStatus: "pending_verification",
    });
    expect(step2.status).toBe("pending_verification");
  });

  it("cannot skip straight from open to pending_verification", async () => {
    const capa = await makeCapa();
    const owner = makeCtx({ userId: "owner-1", propertyIds: [PROPERTY_A] });
    await expect(
      updateCapaProgress(repo, audit, owner, capa.id, {
        note: "Trying to skip ahead",
        newStatus: "pending_verification",
      }),
    ).rejects.toThrow(/Cannot move CAPA/);
  });

  it("an owner cannot move their own CAPA straight to verified — only verifyCapa() can do that", async () => {
    const capa = await makeCapa();
    const owner = makeCtx({ userId: "owner-1", propertyIds: [PROPERTY_A] });
    await expect(
      updateCapaProgress(repo, audit, owner, capa.id, { note: "Marking myself verified", newStatus: "verified" }),
    ).rejects.toThrow(/Only a verifier can move a CAPA to verified/);
  });
});

describe("verification — only the designated verifier, never the owner", () => {
  async function toPendingVerification() {
    const capa = await makeCapa();
    const owner = makeCtx({ userId: "owner-1", propertyIds: [PROPERTY_A] });
    await updateCapaProgress(repo, audit, owner, capa.id, { note: "in progress", newStatus: "in_progress" });
    await updateCapaProgress(repo, audit, owner, capa.id, { note: "ready", newStatus: "pending_verification" });
    return capa.id;
  }

  it("the designated verifier can verify a CAPA, moving it to verified", async () => {
    const capaId = await toPendingVerification();
    const verifier = makeCtx({ userId: "verifier-1", roleCodes: ["PROPERTY_HS_OFFICER"], propertyIds: [PROPERTY_A] });
    const result = await verifyCapa(repo, audit, verifier, capaId, "verified", "Handrail confirmed secure.");
    expect(result.status).toBe("verified");
  });

  it("the CAPA owner cannot verify their own CAPA even if they try", async () => {
    const capaId = await toPendingVerification();
    const owner = makeCtx({ userId: "owner-1", propertyIds: [PROPERTY_A] });
    await expect(verifyCapa(repo, audit, owner, capaId, "verified", null)).rejects.toThrow(AuthError);
  });

  it("a third party who is neither owner nor the designated verifier cannot verify", async () => {
    const capaId = await toPendingVerification();
    const bystander = makeCtx({ userId: "someone-else", roleCodes: ["PROPERTY_HS_OFFICER"], propertyIds: [PROPERTY_A] });
    await expect(verifyCapa(repo, audit, bystander, capaId, "verified", null)).rejects.toThrow(
      /Only the designated verifier/,
    );
  });

  it("a rejected verification sends the CAPA back to in_progress, not closed", async () => {
    const capaId = await toPendingVerification();
    const verifier = makeCtx({ userId: "verifier-1", propertyIds: [PROPERTY_A] });
    const result = await verifyCapa(repo, audit, verifier, capaId, "rejected", "Handrail still loose at the base.");
    expect(result.status).toBe("in_progress");
  });

  it("verification is audit logged distinctly for verified vs rejected outcomes", async () => {
    const capaId = await toPendingVerification();
    audit.entries = [];
    const verifier = makeCtx({ userId: "verifier-1", propertyIds: [PROPERTY_A] });
    await verifyCapa(repo, audit, verifier, capaId, "verified", "Confirmed.");
    expect(audit.entries).toHaveLength(1);
    expect(audit.entries[0]).toMatchObject({ eventType: "capa_verified", entityType: "CAPA" });
  });

  it("verified -> closed is a separate, later step", async () => {
    const capaId = await toPendingVerification();
    const verifier = makeCtx({ userId: "verifier-1", propertyIds: [PROPERTY_A] });
    await verifyCapa(repo, audit, verifier, capaId, "verified", null);

    const closer = makeCtx({ userId: "hs-admin-1", roleCodes: ["GROUP_HS_ADMIN"] });
    const closed = await closeCapa(repo, audit, closer, capaId);
    expect(closed.status).toBe("closed");
  });

  it("cannot close a CAPA that hasn't been verified yet", async () => {
    const capaId = await toPendingVerification();
    const closer = makeCtx({ userId: "hs-admin-1", roleCodes: ["GROUP_HS_ADMIN"] });
    await expect(closeCapa(repo, audit, closer, capaId)).rejects.toThrow(/Cannot move CAPA/);
  });
});

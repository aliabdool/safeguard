import { beforeEach, describe, expect, it } from "vitest";

import { AuthError, type AuthContext } from "../pure/permissions";
import {
  addMedicalNote,
  createIncident,
  exportMedicalNotes,
  recordOshReportabilityDetermination,
  startInvestigation,
  viewMedicalNotes,
  type AuditEntry,
  type AuditLogger,
  type IncidentRecord,
  type IncidentRepo,
  type InvestigationRecord,
  type MedicalNoteRecord,
  type OshReportabilityRecord,
} from "./incident-service";

const PROPERTY_A = "prop-la-pirogue";
const PROPERTY_B = "prop-sugar-beach";
const DEPT_HOUSEKEEPING = "dept-housekeeping";

class FakeIncidentRepo implements IncidentRepo {
  private incidents = new Map<string, IncidentRecord>();
  private investigations = new Map<string, InvestigationRecord>();
  private oshRows = new Map<string, OshReportabilityRecord[]>();
  private medicalNotes = new Map<string, MedicalNoteRecord[]>();
  private counter = 0;
  private nextId(prefix: string) {
    this.counter += 1;
    return `${prefix}-${this.counter}`;
  }

  async insertIncident(row: Omit<IncidentRecord, "id">): Promise<IncidentRecord> {
    const rec: IncidentRecord = { ...row, id: this.nextId("incident") };
    this.incidents.set(rec.id, rec);
    return rec;
  }
  async getIncident(id: string) {
    return this.incidents.get(id);
  }
  async updateIncidentStatus(id: string, status: IncidentRecord["status"]) {
    const inc = this.incidents.get(id);
    if (inc) inc.status = status;
  }
  async insertInvestigation(row: Omit<InvestigationRecord, "id">) {
    const rec: InvestigationRecord = { ...row, id: this.nextId("investigation") };
    this.investigations.set(rec.id, rec);
    return rec;
  }
  async getInvestigationByIncident(incidentId: string) {
    return [...this.investigations.values()].find((i) => i.incidentId === incidentId);
  }
  async insertOshReportability(row: Omit<OshReportabilityRecord, "id">) {
    const rec: OshReportabilityRecord = { ...row, id: this.nextId("osh") };
    const list = this.oshRows.get(row.incidentId) ?? [];
    list.push(rec);
    this.oshRows.set(row.incidentId, list);
    return rec;
  }
  async getOshReportability(incidentId: string) {
    const list = this.oshRows.get(incidentId) ?? [];
    return list[list.length - 1];
  }
  async insertMedicalNote(row: Omit<MedicalNoteRecord, "id">) {
    const rec: MedicalNoteRecord = { ...row, id: this.nextId("medical") };
    const list = this.medicalNotes.get(row.incidentId) ?? [];
    list.push(rec);
    this.medicalNotes.set(row.incidentId, list);
    return rec;
  }
  async listMedicalNotes(incidentId: string) {
    return this.medicalNotes.get(incidentId) ?? [];
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

let repo: FakeIncidentRepo;
let audit: FakeAuditLogger;

beforeEach(() => {
  repo = new FakeIncidentRepo();
  audit = new FakeAuditLogger();
});

describe("H&S manager can create and investigate an incident", () => {
  it("creates an incident and starts an investigation for a property the user has access to", async () => {
    const hsManager = makeCtx({
      userId: "hs-manager-1",
      roleCodes: ["PROPERTY_HS_OFFICER"],
      propertyIds: [PROPERTY_A],
    });

    const incident = await createIncident(repo, audit, hsManager, {
      incidentNumber: "DEMO-2026-000201",
      propertyId: PROPERTY_A,
      departmentId: DEPT_HOUSEKEEPING,
      occurredAt: "2026-07-15T09:00:00Z",
      personEventType: "employee",
      incidentType: "Injury",
      outcome: "first_aid",
      hospitalReferral: false,
    });
    expect(incident.status).toBe("reported");

    const investigation = await startInvestigation(repo, audit, hsManager, incident.id);
    expect(investigation.investigatorId).toBe("hs-manager-1");

    const reloaded = await repo.getIncident(incident.id);
    expect(reloaded?.status).toBe("investigating");
  });

  it("cannot create an incident for a property the user has no access to", async () => {
    const hsManager = makeCtx({
      roleCodes: ["PROPERTY_HS_OFFICER"],
      propertyIds: [PROPERTY_A],
    });
    await expect(
      createIncident(repo, audit, hsManager, {
        incidentNumber: "DEMO-2026-000202",
        propertyId: PROPERTY_B,
        departmentId: DEPT_HOUSEKEEPING,
        occurredAt: "2026-07-15T09:00:00Z",
        personEventType: "employee",
        incidentType: "Injury",
        outcome: "first_aid",
        hospitalReferral: false,
      }),
    ).rejects.toThrow(AuthError);
  });

  it("rejects a person/event type outside the approved six", async () => {
    const hsManager = makeCtx({ roleCodes: ["PROPERTY_HS_OFFICER"], propertyIds: [PROPERTY_A] });
    await expect(
      createIncident(repo, audit, hsManager, {
        incidentNumber: "DEMO-2026-000203",
        propertyId: PROPERTY_A,
        departmentId: DEPT_HOUSEKEEPING,
        occurredAt: "2026-07-15T09:00:00Z",
        personEventType: "visitor",
        incidentType: "Injury",
        outcome: "first_aid",
        hospitalReferral: false,
      }),
    ).rejects.toThrow(/Invalid person\/event type/);
  });
});

describe("Hospital referral and statutory OSH reportability remain separate fields", () => {
  it("a hospital-referral incident starts reportability as pending, never auto-set to yes", async () => {
    const hsManager = makeCtx({ roleCodes: ["PROPERTY_HS_OFFICER"], propertyIds: [PROPERTY_A] });
    const incident = await createIncident(repo, audit, hsManager, {
      incidentNumber: "DEMO-2026-000204",
      propertyId: PROPERTY_A,
      departmentId: DEPT_HOUSEKEEPING,
      occurredAt: "2026-06-30T16:05:00Z",
      personEventType: "guest",
      incidentType: "Injury",
      outcome: "hospitalisation",
      hospitalReferral: true,
    });

    expect(incident.hospitalReferral).toBe(true);
    const reportability = await repo.getOshReportability(incident.id);
    expect(reportability?.reportableStatus).toBe("pending_determination");
  });

  it("a non-hospital-referral incident can still be determined statutorily reportable", async () => {
    const hsManager = makeCtx({ roleCodes: ["PROPERTY_HS_OFFICER"], propertyIds: [PROPERTY_A] });
    const incident = await createIncident(repo, audit, hsManager, {
      incidentNumber: "DEMO-2026-000205",
      propertyId: PROPERTY_A,
      departmentId: DEPT_HOUSEKEEPING,
      occurredAt: "2026-06-20T15:40:00Z",
      personEventType: "near_miss",
      incidentType: "High-potential near miss",
      outcome: "no_injury",
      hospitalReferral: false,
    });

    const determined = await recordOshReportabilityDetermination(
      repo,
      audit,
      hsManager,
      incident.id,
      "yes",
    );
    expect(incident.hospitalReferral).toBe(false);
    expect(determined.reportableStatus).toBe("yes");
    expect(determined.determinedBy).toBe(hsManager.userId);
  });
});

describe("medical-note isolation", () => {
  const incidentId = "incident-fixed-1";

  async function seedMedicalNote() {
    const nurse = makeCtx({
      userId: "nurse-1",
      roleCodes: ["NURSE_MEDICAL"],
      medicalPermissions: new Set(["edit"]),
    });
    await addMedicalNote(repo, audit, nurse, incidentId, "Guest assessed, ambulance called.");
    audit.entries = []; // reset so each test only asserts on its own actions
  }

  it("H&S manager cannot view medical notes without explicit permission", async () => {
    await seedMedicalNote();
    const hsManager = makeCtx({
      userId: "hs-manager-1",
      roleCodes: ["PROPERTY_HS_OFFICER"],
      propertyIds: [PROPERTY_A],
      medicalPermissions: new Set(),
    });
    await expect(viewMedicalNotes(repo, audit, hsManager, incidentId)).rejects.toThrow(AuthError);
  });

  it("Nurse account with explicit permission can view medical notes", async () => {
    await seedMedicalNote();
    const nurse = makeCtx({
      userId: "nurse-1",
      roleCodes: ["NURSE_MEDICAL"],
      medicalPermissions: new Set(["view"]),
    });
    const notes = await viewMedicalNotes(repo, audit, nurse, incidentId);
    expect(notes).toHaveLength(1);
    expect(notes[0]?.clinicalNotes).toContain("ambulance");
  });

  it("Admin without explicit medical permission cannot view medical notes", async () => {
    await seedMedicalNote();
    const superAdmin = makeCtx({
      userId: "admin-1",
      roleCodes: ["SUPER_ADMIN"],
      medicalPermissions: new Set(),
    });
    await expect(viewMedicalNotes(repo, audit, superAdmin, incidentId)).rejects.toThrow(
      AuthError,
    );
  });

  it("Admin WITH explicit medical permission can view medical notes — the grant is what matters, not the role", async () => {
    await seedMedicalNote();
    const superAdminWithGrant = makeCtx({
      userId: "admin-2",
      roleCodes: ["SUPER_ADMIN"],
      medicalPermissions: new Set(["view"]),
    });
    const notes = await viewMedicalNotes(repo, audit, superAdminWithGrant, incidentId);
    expect(notes).toHaveLength(1);
  });

  it("export requires its own explicit permission — holding view does not imply export", async () => {
    await seedMedicalNote();
    const nurseViewOnly = makeCtx({
      userId: "nurse-2",
      roleCodes: ["NURSE_MEDICAL"],
      medicalPermissions: new Set(["view"]),
    });
    await expect(exportMedicalNotes(repo, audit, nurseViewOnly, incidentId)).rejects.toThrow(
      AuthError,
    );
  });

  it("all medical-note access is audit logged — both granted and denied attempts", async () => {
    await seedMedicalNote();

    const denied = makeCtx({ userId: "hs-manager-2", medicalPermissions: new Set() });
    await expect(viewMedicalNotes(repo, audit, denied, incidentId)).rejects.toThrow(AuthError);

    const granted = makeCtx({ userId: "nurse-3", medicalPermissions: new Set(["view"]) });
    await viewMedicalNotes(repo, audit, granted, incidentId);

    expect(audit.entries).toHaveLength(2);
    expect(audit.entries[0]).toMatchObject({
      actorUserId: "hs-manager-2",
      eventType: "medical_notes_access_denied",
      entityType: "MedicalNotes",
      entityId: incidentId,
      reason: "view_medical_notes",
    });
    expect(audit.entries[1]).toMatchObject({
      actorUserId: "nurse-3",
      eventType: "medical_notes_access",
      entityType: "MedicalNotes",
      entityId: incidentId,
      reason: "view_medical_notes",
    });
  });

  it("adding a medical note is itself audit logged, distinctly from viewing", async () => {
    const nurse = makeCtx({ userId: "nurse-4", medicalPermissions: new Set(["edit"]) });
    await addMedicalNote(repo, audit, nurse, incidentId, "Follow-up note.");
    expect(audit.entries).toHaveLength(1);
    expect(audit.entries[0]).toMatchObject({
      eventType: "medical_notes_access",
      reason: "edit_medical_notes",
    });
  });
});

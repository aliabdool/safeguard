import { beforeEach, describe, expect, it } from "vitest";

import type { AuthContext } from "../pure/permissions";
import {
  decideDocumentApproval,
  getDocumentEvidenceDetail,
  linkEvidence,
  submitForApproval,
  uploadDocument,
  type AuditEntry,
  type AuditLogger,
  type DocumentApprovalRecord,
  type DocumentEvidenceLinkRecord,
  type DocumentRecord,
  type DocumentRepo,
  type DocumentVersionRecord,
} from "./document-service";

const PROPERTY_A = "prop-la-pirogue";

class FakeDocumentRepo implements DocumentRepo {
  documents = new Map<string, DocumentRecord>();
  versions = new Map<string, DocumentVersionRecord>();
  approvals: DocumentApprovalRecord[] = [];
  links = new Map<string, DocumentEvidenceLinkRecord[]>();
  private counter = 0;
  private nextId(prefix: string) {
    this.counter += 1;
    return `${prefix}-${this.counter}`;
  }
  async insertDocument(row: Omit<DocumentRecord, "id">) {
    const rec = { ...row, id: this.nextId("doc") };
    this.documents.set(rec.id, rec);
    return rec;
  }
  async getDocument(id: string) {
    return this.documents.get(id);
  }
  async insertDocumentVersion(row: Omit<DocumentVersionRecord, "id">) {
    const rec = { ...row, id: this.nextId("ver") };
    this.versions.set(rec.id, rec);
    return rec;
  }
  async getDocumentVersion(id: string) {
    return this.versions.get(id);
  }
  async updateDocumentVersionStatus(id: string, status: DocumentVersionRecord["status"]) {
    const v = this.versions.get(id);
    if (v) v.status = status;
  }
  async listVersionsForDocument(documentId: string) {
    return [...this.versions.values()].filter((v) => v.documentId === documentId);
  }
  async insertApproval(row: Omit<DocumentApprovalRecord, "id">) {
    const rec = { ...row, id: this.nextId("appr") };
    this.approvals.push(rec);
    return rec;
  }
  async insertEvidenceLink(row: Omit<DocumentEvidenceLinkRecord, "id">) {
    const rec = { ...row, id: this.nextId("link") };
    const list = this.links.get(row.documentVersionId) ?? [];
    list.push(rec);
    this.links.set(row.documentVersionId, list);
    return rec;
  }
  async listLinksForVersion(documentVersionId: string) {
    return this.links.get(documentVersionId) ?? [];
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

let repo: FakeDocumentRepo;
let audit: FakeAuditLogger;
beforeEach(() => {
  repo = new FakeDocumentRepo();
  audit = new FakeAuditLogger();
});

describe("document approval workflow", () => {
  it("uploads a document as a draft, then moves through approval", async () => {
    const officer = makeCtx({ userId: "officer-1", propertyIds: [PROPERTY_A] });
    const { document, version } = await uploadDocument(repo, audit, officer, {
      title: "Fire Safety Certificate",
      category: "statutory_certificate",
      propertyId: PROPERTY_A,
      fileId: "file-1",
      expiryDate: "2027-01-01",
      reviewDate: "2026-12-01",
    });
    expect(version.status).toBe("draft");

    await submitForApproval(repo, audit, officer, version.id);
    const approved = await decideDocumentApproval(repo, audit, officer, version.id, "approved", "Looks valid.");
    expect(approved.status).toBe("approved");
    expect(document.title).toBe("Fire Safety Certificate");
  });

  it("cannot approve a document still in draft (must be submitted first)", async () => {
    const officer = makeCtx({ propertyIds: [PROPERTY_A] });
    const { version } = await uploadDocument(repo, audit, officer, {
      title: "Draft policy",
      category: "policy",
      propertyId: null,
      fileId: "file-2",
      expiryDate: null,
      reviewDate: null,
    });
    await expect(decideDocumentApproval(repo, audit, officer, version.id, "approved", null)).rejects.toThrow(
      /Cannot move document version/,
    );
  });
});

describe("expired evidence must not silently count as valid", () => {
  it("an expired but approved certificate is not currently valid evidence", async () => {
    const officer = makeCtx({ propertyIds: [PROPERTY_A] });
    const { version } = await uploadDocument(repo, audit, officer, {
      title: "Expired Fire Certificate",
      category: "statutory_certificate",
      propertyId: PROPERTY_A,
      fileId: "file-3",
      expiryDate: "2026-01-01",
      reviewDate: null,
    });
    await submitForApproval(repo, audit, officer, version.id);
    await decideDocumentApproval(repo, audit, officer, version.id, "approved", null);

    const detail = await getDocumentEvidenceDetail(
      repo,
      version.id,
      new Date("2026-07-21T00:00:00Z"),
      new Map(),
      new Map(),
    );
    expect(detail.isCurrentlyValidEvidence).toBe(false);
  });
});

describe("one document supports multiple records across multiple frameworks", () => {
  it("computes 'Supports N records across M frameworks' from evidence links", async () => {
    const officer = makeCtx({ propertyIds: [PROPERTY_A] });
    const { version } = await uploadDocument(repo, audit, officer, {
      title: "Fire Safety Certificate",
      category: "statutory_certificate",
      propertyId: PROPERTY_A,
      fileId: "file-4",
      expiryDate: "2027-01-01",
      reviewDate: null,
    });
    await submitForApproval(repo, audit, officer, version.id);
    await decideDocumentApproval(repo, audit, officer, version.id, "approved", null);

    await linkEvidence(repo, audit, officer, version.id, "control_assessment", "assessment-1");
    await linkEvidence(repo, audit, officer, version.id, "control_assessment", "assessment-2");

    const controlAssessmentControlIds = new Map([
      ["assessment-1", "control-fire-1"],
      ["assessment-2", "control-fire-2"],
    ]);
    const controlFrameworkIds = new Map([
      ["control-fire-1", ["fw-iso45001", "fw-mu-legal"]],
      ["control-fire-2", ["fw-mu-legal"]],
    ]);

    const detail = await getDocumentEvidenceDetail(
      repo,
      version.id,
      new Date("2026-07-21T00:00:00Z"),
      controlAssessmentControlIds,
      controlFrameworkIds,
    );
    expect(detail.reuse.totalLinks).toBe(2);
    expect(detail.reuse.distinctControls).toBe(2);
    expect(detail.reuse.distinctFrameworks).toBe(2);
    expect(detail.isCurrentlyValidEvidence).toBe(true);
  });
});

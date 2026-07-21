/**
 * Document/evidence service functions — same storage-abstracted pattern as incident-service.ts
 * and capa-service.ts. Phase 7.
 */
import { AuthError, hasPropertyAccess, type AuthContext } from "../pure/permissions";
import {
  isValidDocumentStatusTransition,
  isValidEvidence,
  type DocumentApprovalStatus,
} from "../pure/document-rules";
import { computeEvidenceReuseSummary, type EvidenceReuseSummary } from "../pure/evidence-reuse";

export interface DocumentRecord {
  id: string;
  title: string;
  category: string;
  propertyId: string | null;
  ownerId: string;
}

export interface DocumentVersionRecord {
  id: string;
  documentId: string;
  versionNumber: number;
  fileId: string;
  status: DocumentApprovalStatus;
  expiryDate: string | null;
  reviewDate: string | null;
  uploadedBy: string;
}

export interface DocumentApprovalRecord {
  id: string;
  documentVersionId: string;
  approverId: string;
  outcome: "approved" | "rejected";
  notes: string | null;
}

export interface DocumentEvidenceLinkRecord {
  id: string;
  documentVersionId: string;
  linkedEntityType: string;
  linkedEntityId: string;
  linkedBy: string;
}

export interface DocumentRepo {
  insertDocument(row: Omit<DocumentRecord, "id">): Promise<DocumentRecord>;
  getDocument(id: string): Promise<DocumentRecord | undefined>;

  insertDocumentVersion(row: Omit<DocumentVersionRecord, "id">): Promise<DocumentVersionRecord>;
  getDocumentVersion(id: string): Promise<DocumentVersionRecord | undefined>;
  updateDocumentVersionStatus(id: string, status: DocumentApprovalStatus): Promise<void>;
  listVersionsForDocument(documentId: string): Promise<DocumentVersionRecord[]>;

  insertApproval(row: Omit<DocumentApprovalRecord, "id">): Promise<DocumentApprovalRecord>;

  insertEvidenceLink(row: Omit<DocumentEvidenceLinkRecord, "id">): Promise<DocumentEvidenceLinkRecord>;
  listLinksForVersion(documentVersionId: string): Promise<DocumentEvidenceLinkRecord[]>;
}

export interface AuditEntry {
  actorUserId: string;
  eventType: string;
  entityType: string;
  entityId?: string | null;
  propertyId?: string | null;
  reason?: string | null;
}
export interface AuditLogger {
  log(entry: AuditEntry): Promise<void>;
}

export interface UploadDocumentInput {
  title: string;
  category: string;
  propertyId: string | null;
  fileId: string;
  expiryDate: string | null;
  reviewDate: string | null;
}

export async function uploadDocument(
  repo: DocumentRepo,
  audit: AuditLogger,
  ctx: AuthContext,
  input: UploadDocumentInput,
): Promise<{ document: DocumentRecord; version: DocumentVersionRecord }> {
  if (input.propertyId && !hasPropertyAccess(ctx, input.propertyId)) {
    throw new AuthError("FORBIDDEN", "No access to this property.");
  }

  const document = await repo.insertDocument({
    title: input.title,
    category: input.category,
    propertyId: input.propertyId,
    ownerId: ctx.userId,
  });
  const version = await repo.insertDocumentVersion({
    documentId: document.id,
    versionNumber: 1,
    fileId: input.fileId,
    status: "draft",
    expiryDate: input.expiryDate,
    reviewDate: input.reviewDate,
    uploadedBy: ctx.userId,
  });

  await audit.log({
    actorUserId: ctx.userId,
    eventType: "document_uploaded",
    entityType: "Documents",
    entityId: document.id,
    propertyId: document.propertyId,
  });

  return { document, version };
}

/** Owner submits the current draft version for approval — the one status move an owner may make
 * without being an approver. */
export async function submitForApproval(
  repo: DocumentRepo,
  audit: AuditLogger,
  ctx: AuthContext,
  documentVersionId: string,
): Promise<DocumentVersionRecord> {
  const version = await repo.getDocumentVersion(documentVersionId);
  if (!version) throw new Error("Document version not found.");
  if (!isValidDocumentStatusTransition(version.status, "pending_approval")) {
    throw new Error(`Cannot move document version from ${version.status} to pending_approval.`);
  }
  await repo.updateDocumentVersionStatus(documentVersionId, "pending_approval");
  await audit.log({
    actorUserId: ctx.userId,
    eventType: "document_submitted_for_approval",
    entityType: "DocumentVersions",
    entityId: documentVersionId,
  });
  return { ...version, status: "pending_approval" };
}

/** Records the approval decision as its own record (mirrors CAPAVerification), then updates the
 * status column to match. */
export async function decideDocumentApproval(
  repo: DocumentRepo,
  audit: AuditLogger,
  ctx: AuthContext,
  documentVersionId: string,
  outcome: "approved" | "rejected",
  notes: string | null,
): Promise<DocumentVersionRecord> {
  const version = await repo.getDocumentVersion(documentVersionId);
  if (!version) throw new Error("Document version not found.");
  const nextStatus: DocumentApprovalStatus = outcome === "approved" ? "approved" : "rejected";
  if (!isValidDocumentStatusTransition(version.status, nextStatus)) {
    throw new Error(`Cannot move document version from ${version.status} to ${nextStatus}.`);
  }

  await repo.insertApproval({
    documentVersionId,
    approverId: ctx.userId,
    outcome,
    notes,
  });
  await repo.updateDocumentVersionStatus(documentVersionId, nextStatus);

  await audit.log({
    actorUserId: ctx.userId,
    eventType: outcome === "approved" ? "document_approved" : "document_rejected",
    entityType: "DocumentVersions",
    entityId: documentVersionId,
    reason: notes,
  });

  return { ...version, status: nextStatus };
}

export async function linkEvidence(
  repo: DocumentRepo,
  audit: AuditLogger,
  ctx: AuthContext,
  documentVersionId: string,
  linkedEntityType: string,
  linkedEntityId: string,
): Promise<DocumentEvidenceLinkRecord> {
  const version = await repo.getDocumentVersion(documentVersionId);
  if (!version) throw new Error("Document version not found.");

  const link = await repo.insertEvidenceLink({
    documentVersionId,
    linkedEntityType,
    linkedEntityId,
    linkedBy: ctx.userId,
  });

  await audit.log({
    actorUserId: ctx.userId,
    eventType: "evidence_linked",
    entityType: "DocumentEvidenceLinks",
    entityId: link.id,
    reason: `${linkedEntityType}:${linkedEntityId}`,
  });

  return link;
}

/** Detail view: version + whether it's CURRENTLY valid evidence (never cached — see
 * isValidEvidence()) + the reuse summary ("Supports N records across M frameworks"). Framework
 * counting needs the control->framework map, supplied by the caller (the Function assembles it
 * from Controls/ControlFrameworkMappings, same as evidence-reuse.ts always expected). */
export async function getDocumentEvidenceDetail(
  repo: DocumentRepo,
  documentVersionId: string,
  asOf: Date,
  controlAssessmentControlIds: Map<string, string>,
  controlFrameworkIds: Map<string, string[]>,
): Promise<{
  version: DocumentVersionRecord;
  isCurrentlyValidEvidence: boolean;
  reuse: EvidenceReuseSummary;
}> {
  const version = await repo.getDocumentVersion(documentVersionId);
  if (!version) throw new Error("Document version not found.");

  const links = await repo.listLinksForVersion(documentVersionId);
  const reuse = computeEvidenceReuseSummary({
    links: links.map((l) => ({ linkedEntityType: l.linkedEntityType, linkedEntityId: l.linkedEntityId })),
    controlAssessmentControlIds,
    controlFrameworkIds,
  });

  return {
    version,
    isCurrentlyValidEvidence: isValidEvidence(
      { expiryDate: version.expiryDate, status: version.status },
      asOf,
    ),
    reuse,
  };
}

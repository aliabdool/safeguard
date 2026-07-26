/**
 * CAPA service functions — the actual business logic, shared verbatim between the deployed
 * Catalyst Function (functions/api-capa) and this module's own tests, same pattern as
 * incident-service.ts. Both go through CapaRepo/AuditLogger rather than talking to Data Store
 * directly.
 */
import {
  AuthError,
  hasDepartmentAccess,
  hasPropertyAccess,
  type AuthContext,
} from "../pure/permissions";
import {
  isValidCapaStatusTransition,
  isValidOwnerVerifierPair,
  type CapaStatus,
  type CapaVerificationOutcome,
} from "../pure/capa-workflow";

export interface CapaRecord {
  id: string;
  capaNumber: string;
  propertyId: string;
  departmentId: string | null;
  title: string;
  description: string | null;
  sourceType: "incident" | "audit_finding" | "control_gap";
  sourceId: string | null;
  ownerId: string;
  verifierId: string;
  dueDate: string;
  status: CapaStatus;
}

export interface CapaProgressNoteRecord {
  id: string;
  capaId: string;
  authorId: string;
  note: string;
  evidenceFileId: string | null;
  createdAt: string;
}

export interface CapaVerificationRecord {
  id: string;
  capaId: string;
  verifierId: string;
  outcome: CapaVerificationOutcome;
  notes: string | null;
  verifiedAt: string;
}

export interface CapaRepo {
  insertCapa(row: Omit<CapaRecord, "id">): Promise<CapaRecord>;
  getCapa(id: string): Promise<CapaRecord | undefined>;
  updateCapaStatus(id: string, status: CapaStatus): Promise<void>;

  insertProgressNote(row: Omit<CapaProgressNoteRecord, "id">): Promise<CapaProgressNoteRecord>;

  insertVerification(row: Omit<CapaVerificationRecord, "id">): Promise<CapaVerificationRecord>;
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

// -------------------------------------------------------------------------------------------
// Create
// -------------------------------------------------------------------------------------------

export interface CreateCapaInput {
  capaNumber: string;
  propertyId: string;
  departmentId: string | null;
  title: string;
  description: string | null;
  sourceType: CapaRecord["sourceType"];
  sourceId: string | null;
  ownerId: string;
  verifierId: string;
  dueDate: string;
}

/** Test case: "CAPA owner and verifier must always be different people" is enforced here, before
 * anything is written — not just documented as a rule and hoped for. */
export async function createCapa(
  repo: CapaRepo,
  audit: AuditLogger,
  ctx: AuthContext,
  input: CreateCapaInput,
): Promise<CapaRecord> {
  // Property-scoped only at creation, same as createIncident() in incident-service.ts — a
  // Property H&S Officer assigns CAPA across every department at their own hotel without needing
  // a per-department grant. Department scoping is enforced on READ/UPDATE (updateCapaProgress
  // below), which is where a Department Manager's narrower access actually matters.
  if (!hasPropertyAccess(ctx, input.propertyId)) {
    throw new AuthError("FORBIDDEN", "No access to this property.");
  }
  if (!isValidOwnerVerifierPair(input.ownerId, input.verifierId)) {
    throw new Error("CAPA owner and verifier must be different people.");
  }

  const capa = await repo.insertCapa({
    capaNumber: input.capaNumber,
    propertyId: input.propertyId,
    departmentId: input.departmentId,
    title: input.title,
    description: input.description,
    sourceType: input.sourceType,
    sourceId: input.sourceId,
    ownerId: input.ownerId,
    verifierId: input.verifierId,
    dueDate: input.dueDate,
    status: "open",
  });

  await audit.log({
    actorUserId: ctx.userId,
    eventType: "capa_created",
    entityType: "CAPA",
    entityId: capa.id,
    propertyId: capa.propertyId,
  });

  return capa;
}

// -------------------------------------------------------------------------------------------
// Owner progress
// -------------------------------------------------------------------------------------------

/** Moves a CAPA forward (open -> in_progress -> pending_verification) and/or logs a progress
 * note with optional evidence. Any status change goes through isValidCapaStatusTransition() —
 * an owner cannot skip straight to "verified", only a verifier can move a CAPA there. */
export async function updateCapaProgress(
  repo: CapaRepo,
  audit: AuditLogger,
  ctx: AuthContext,
  capaId: string,
  input: { note: string; evidenceFileId?: string | null; newStatus?: CapaStatus },
): Promise<CapaRecord> {
  const capa = await repo.getCapa(capaId);
  if (!capa) throw new Error("CAPA not found.");
  if (!hasPropertyAccess(ctx, capa.propertyId)) {
    throw new AuthError("FORBIDDEN", "No access to this property.");
  }
  // Being the named owner is itself the explicit assignment — a Department Manager updating
  // someone else's CAPA (or a CAPA outside their own) still needs the department grant, but an
  // owner updating their own assigned CAPA is never blocked by department scope.
  if (ctx.userId !== capa.ownerId && !hasDepartmentAccess(ctx, capa.propertyId, capa.departmentId)) {
    throw new AuthError("FORBIDDEN", "No access to this department.");
  }

  await repo.insertProgressNote({
    capaId,
    authorId: ctx.userId,
    note: input.note,
    evidenceFileId: input.evidenceFileId ?? null,
    createdAt: new Date().toISOString(),
  });

  let updated = capa;
  if (input.newStatus && input.newStatus !== capa.status) {
    if (input.newStatus === "verified") {
      throw new Error("Only a verifier can move a CAPA to verified — see verifyCapa().");
    }
    if (!isValidCapaStatusTransition(capa.status, input.newStatus)) {
      throw new Error(`Cannot move CAPA from ${capa.status} to ${input.newStatus}.`);
    }
    await repo.updateCapaStatus(capaId, input.newStatus);
    updated = { ...capa, status: input.newStatus };
  }

  await audit.log({
    actorUserId: ctx.userId,
    eventType: "capa_progress_updated",
    entityType: "CAPA",
    entityId: capaId,
    propertyId: capa.propertyId,
    reason: input.newStatus ?? null,
  });

  return updated;
}

// -------------------------------------------------------------------------------------------
// Verification — only the designated verifier, who by construction can never be the owner.
// -------------------------------------------------------------------------------------------

/** Test case: verification re-checks owner != verifier defensively, and rejects anyone who isn't
 * the CAPA's designated verifier — a colleague with property access but not the verifier
 * assignment cannot self-serve a verification. */
export async function verifyCapa(
  repo: CapaRepo,
  audit: AuditLogger,
  ctx: AuthContext,
  capaId: string,
  outcome: CapaVerificationOutcome,
  notes: string | null,
): Promise<CapaRecord> {
  const capa = await repo.getCapa(capaId);
  if (!capa) throw new Error("CAPA not found.");
  if (!hasPropertyAccess(ctx, capa.propertyId)) {
    throw new AuthError("FORBIDDEN", "No access to this property.");
  }
  if (!isValidOwnerVerifierPair(capa.ownerId, capa.verifierId)) {
    // Should be unreachable given createCapa()'s check — kept as a defensive re-check per
    // management's explicit "must always be different people" instruction, not just at creation.
    throw new Error("Invalid CAPA: owner and verifier must be different people.");
  }
  if (ctx.userId !== capa.verifierId) {
    throw new AuthError("FORBIDDEN", "Only the designated verifier may verify this CAPA.");
  }

  const nextStatus: CapaStatus = outcome === "verified" ? "verified" : "in_progress";
  if (!isValidCapaStatusTransition(capa.status, nextStatus)) {
    throw new Error(`Cannot move CAPA from ${capa.status} to ${nextStatus}.`);
  }

  await repo.insertVerification({
    capaId,
    verifierId: ctx.userId,
    outcome,
    notes,
    verifiedAt: new Date().toISOString(),
  });
  await repo.updateCapaStatus(capaId, nextStatus);

  await audit.log({
    actorUserId: ctx.userId,
    eventType: outcome === "verified" ? "capa_verified" : "capa_verification_rejected",
    entityType: "CAPA",
    entityId: capaId,
    propertyId: capa.propertyId,
    reason: notes,
  });

  return { ...capa, status: nextStatus };
}

/** Verified -> closed. Kept separate from verifyCapa() since closing is a distinct, later act
 * (e.g. after a follow-up confirms the fix held), not automatic on verification. */
export async function closeCapa(
  repo: CapaRepo,
  audit: AuditLogger,
  ctx: AuthContext,
  capaId: string,
): Promise<CapaRecord> {
  const capa = await repo.getCapa(capaId);
  if (!capa) throw new Error("CAPA not found.");
  if (!hasPropertyAccess(ctx, capa.propertyId)) {
    throw new AuthError("FORBIDDEN", "No access to this property.");
  }
  if (!isValidCapaStatusTransition(capa.status, "closed")) {
    throw new Error(`Cannot move CAPA from ${capa.status} to closed.`);
  }

  await repo.updateCapaStatus(capaId, "closed");

  await audit.log({
    actorUserId: ctx.userId,
    eventType: "capa_closed",
    entityType: "CAPA",
    entityId: capaId,
    propertyId: capa.propertyId,
  });

  return { ...capa, status: "closed" };
}

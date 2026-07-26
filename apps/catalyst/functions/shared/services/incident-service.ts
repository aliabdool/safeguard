/**
 * Incident + investigation + medical-note service functions — the actual business logic, shared
 * verbatim between the deployed Catalyst Function (functions/api-incidents) and this module's own
 * tests. Both go through IncidentRepo/AuditLogger rather than talking to Data Store directly, so
 * the exact code that runs in production is what's under test — not a parallel reimplementation
 * that could drift from it.
 */
import {
  AuthError,
  hasMedicalPermission,
  hasPropertyAccess,
  type AuthContext,
  type MedicalPermissionAction,
} from "../pure/permissions";
import {
  defaultOshReportableStatus,
  isValidPersonEventType,
  isValidStatusTransition,
  type IncidentStatus,
} from "../pure/incident-workflow";

export interface IncidentRecord {
  id: string;
  incidentNumber: string;
  propertyId: string;
  departmentId: string;
  occurredAt: string;
  reportedBy: string;
  personEventType: string;
  incidentType: string;
  outcome: string;
  hospitalReferral: boolean;
  status: IncidentStatus;
}

export interface InvestigationRecord {
  id: string;
  incidentId: string;
  investigatorId: string;
  status: string;
}

export interface MedicalNoteRecord {
  id: string;
  incidentId: string;
  clinicalNotes: string;
  createdBy: string;
  createdAt: string;
}

export interface OshReportabilityRecord {
  id: string;
  incidentId: string;
  reportableStatus: "yes" | "no" | "pending_determination";
  determinedBy: string | null;
  determinedAt: string | null;
}

/** Storage abstraction — the real implementation wraps catalystApp.datastore(); tests use an
 * in-memory fake. Kept narrow: only what this service actually needs, not the full Data Store
 * SDK surface. */
export interface IncidentRepo {
  insertIncident(row: Omit<IncidentRecord, "id">): Promise<IncidentRecord>;
  getIncident(id: string): Promise<IncidentRecord | undefined>;
  updateIncidentStatus(id: string, status: IncidentStatus): Promise<void>;

  insertInvestigation(row: Omit<InvestigationRecord, "id">): Promise<InvestigationRecord>;
  getInvestigationByIncident(incidentId: string): Promise<InvestigationRecord | undefined>;

  insertOshReportability(row: Omit<OshReportabilityRecord, "id">): Promise<OshReportabilityRecord>;
  getOshReportability(incidentId: string): Promise<OshReportabilityRecord | undefined>;

  insertMedicalNote(row: Omit<MedicalNoteRecord, "id">): Promise<MedicalNoteRecord>;
  listMedicalNotes(incidentId: string): Promise<MedicalNoteRecord[]>;
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
// Incidents
// -------------------------------------------------------------------------------------------

export interface CreateIncidentInput {
  incidentNumber: string;
  propertyId: string;
  departmentId: string;
  occurredAt: string;
  personEventType: string;
  incidentType: string;
  outcome: string;
  hospitalReferral: boolean;
}

/** Test case: "H&S manager can create and investigate an incident" starts here. */
export async function createIncident(
  repo: IncidentRepo,
  audit: AuditLogger,
  ctx: AuthContext,
  input: CreateIncidentInput,
): Promise<IncidentRecord> {
  if (!hasPropertyAccess(ctx, input.propertyId)) {
    throw new AuthError("FORBIDDEN", "No access to this property.");
  }
  if (!isValidPersonEventType(input.personEventType)) {
    throw new Error(`Invalid person/event type: ${input.personEventType}`);
  }

  const incident = await repo.insertIncident({
    incidentNumber: input.incidentNumber,
    propertyId: input.propertyId,
    departmentId: input.departmentId,
    occurredAt: input.occurredAt,
    reportedBy: ctx.userId,
    personEventType: input.personEventType,
    incidentType: input.incidentType,
    outcome: input.outcome,
    // Independent of reportability by construction — this field is never read anywhere in this
    // module's OSH-reportability logic below.
    hospitalReferral: input.hospitalReferral,
    status: "reported",
  });

  // Statutory reportability is always created as its own pending record — never auto-set from
  // hospitalReferral, never omitted.
  await repo.insertOshReportability({
    incidentId: incident.id,
    reportableStatus: defaultOshReportableStatus(),
    determinedBy: null,
    determinedAt: null,
  });

  await audit.log({
    actorUserId: ctx.userId,
    eventType: "incident_created",
    entityType: "Incidents",
    entityId: incident.id,
    propertyId: incident.propertyId,
  });

  return incident;
}

/** Test case: "...and investigate an incident" — the second half. */
export async function startInvestigation(
  repo: IncidentRepo,
  audit: AuditLogger,
  ctx: AuthContext,
  incidentId: string,
): Promise<InvestigationRecord> {
  const incident = await repo.getIncident(incidentId);
  if (!incident) throw new Error("Incident not found.");
  if (!hasPropertyAccess(ctx, incident.propertyId)) {
    throw new AuthError("FORBIDDEN", "No access to this property.");
  }
  if (!isValidStatusTransition(incident.status, "investigating")) {
    throw new Error(`Cannot move incident from ${incident.status} to investigating.`);
  }

  const investigation = await repo.insertInvestigation({
    incidentId,
    investigatorId: ctx.userId,
    status: "in_progress",
  });
  await repo.updateIncidentStatus(incidentId, "investigating");

  await audit.log({
    actorUserId: ctx.userId,
    eventType: "investigation_started",
    entityType: "IncidentInvestigation",
    entityId: investigation.id,
    propertyId: incident.propertyId,
  });

  return investigation;
}

export async function recordOshReportabilityDetermination(
  repo: IncidentRepo,
  audit: AuditLogger,
  ctx: AuthContext,
  incidentId: string,
  reportableStatus: "yes" | "no" | "pending_determination",
): Promise<OshReportabilityRecord> {
  const incident = await repo.getIncident(incidentId);
  if (!incident) throw new Error("Incident not found.");
  if (!hasPropertyAccess(ctx, incident.propertyId)) {
    throw new AuthError("FORBIDDEN", "No access to this property.");
  }

  const updated = await repo.insertOshReportability({
    incidentId,
    reportableStatus,
    determinedBy: ctx.userId,
    determinedAt: new Date().toISOString(),
  });

  await audit.log({
    actorUserId: ctx.userId,
    eventType: "osh_reportability_determined",
    entityType: "IncidentOSHReportability",
    entityId: updated.id,
    propertyId: incident.propertyId,
    reason: reportableStatus,
  });

  return updated;
}

// -------------------------------------------------------------------------------------------
// Medical notes — the isolated module. Every function here audit-logs BOTH the granted and the
// denied case, per brief requirement #7 ("Every medical-note access must be audit logged" — not
// "every successful access").
// -------------------------------------------------------------------------------------------

async function auditMedicalAccess(
  audit: AuditLogger,
  ctx: AuthContext,
  incidentId: string,
  action: MedicalPermissionAction,
  granted: boolean,
): Promise<void> {
  await audit.log({
    actorUserId: ctx.userId,
    eventType: granted ? "medical_notes_access" : "medical_notes_access_denied",
    entityType: "MedicalNotes",
    entityId: incidentId,
    reason: `${action}_medical_notes`,
  });
}

/** Test cases: "H&S manager cannot view medical notes without explicit permission", "Nurse
 * account with explicit permission can view medical notes", "Admin without explicit medical
 * permission cannot view medical notes". Role is never consulted here — only
 * ctx.medicalPermissions, per brief requirement #6. */
export async function viewMedicalNotes(
  repo: IncidentRepo,
  audit: AuditLogger,
  ctx: AuthContext,
  incidentId: string,
): Promise<MedicalNoteRecord[]> {
  const granted = hasMedicalPermission(ctx, "view");
  await auditMedicalAccess(audit, ctx, incidentId, "view", granted);
  if (!granted) {
    throw new AuthError("FORBIDDEN", "Missing view_medical_notes permission.");
  }
  return repo.listMedicalNotes(incidentId);
}

export async function addMedicalNote(
  repo: IncidentRepo,
  audit: AuditLogger,
  ctx: AuthContext,
  incidentId: string,
  clinicalNotes: string,
): Promise<MedicalNoteRecord> {
  const granted = hasMedicalPermission(ctx, "edit");
  await auditMedicalAccess(audit, ctx, incidentId, "edit", granted);
  if (!granted) {
    throw new AuthError("FORBIDDEN", "Missing edit_medical_notes permission.");
  }
  return repo.insertMedicalNote({
    incidentId,
    clinicalNotes,
    createdBy: ctx.userId,
    createdAt: new Date().toISOString(),
  });
}

export async function exportMedicalNotes(
  repo: IncidentRepo,
  audit: AuditLogger,
  ctx: AuthContext,
  incidentId: string,
): Promise<MedicalNoteRecord[]> {
  const granted = hasMedicalPermission(ctx, "export");
  await auditMedicalAccess(audit, ctx, incidentId, "export", granted);
  if (!granted) {
    throw new AuthError("FORBIDDEN", "Missing export_medical_notes permission.");
  }
  return repo.listMedicalNotes(incidentId);
}

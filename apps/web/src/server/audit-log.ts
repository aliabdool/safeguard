import "server-only";

import { getDb } from "@/db";
import { auditLog } from "@/db/schema";

export type AuditLogEventType =
  | "login"
  | "logout"
  | "failed_login"
  | "password_reset_requested"
  | "registration"
  | "registration_approved"
  | "registration_rejected"
  | "role_changed"
  | "property_assigned"
  | "department_assigned"
  | "medical_permission_granted"
  | "medical_permission_revoked"
  | "record_created"
  | "record_updated"
  | "status_changed"
  | "approval"
  | "rejection"
  | "medical_record_accessed"
  | "document_uploaded"
  | "document_downloaded"
  | "evidence_verified"
  | "kpi_calculated"
  | "score_changed"
  | "finding_closed"
  | "finding_reopened"
  | "data_exported"
  | "user_suspended"
  | "user_reactivated"
  | "session_revoked";

export interface WriteAuditLogInput {
  actorId: string | null;
  eventType: AuditLogEventType;
  entityType: string;
  entityId?: string | null;
  propertyId?: string | null;
  departmentId?: string | null;
  previousValue?: unknown;
  newValue?: unknown;
  reason?: string | null;
  requestId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}

/**
 * The only code path that writes to `audit_log`. Never pass passwords, secrets, or medical
 * clinical notes in `previousValue`/`newValue` — see docs/security-model.md §3.4. The table has
 * no UPDATE/DELETE grant at all, so this function only ever inserts.
 */
export async function writeAuditLog(input: WriteAuditLogInput) {
  const db = getDb();
  await db.insert(auditLog).values({
    actorId: input.actorId,
    eventType: input.eventType,
    entityType: input.entityType,
    entityId: input.entityId ?? null,
    propertyId: input.propertyId ?? null,
    departmentId: input.departmentId ?? null,
    previousValue: input.previousValue ?? null,
    newValue: input.newValue ?? null,
    reason: input.reason ?? null,
    requestId: input.requestId ?? null,
    ipAddress: input.ipAddress ?? null,
    userAgent: input.userAgent ?? null,
  });
}

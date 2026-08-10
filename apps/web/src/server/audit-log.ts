import "server-only";

import { catalystAdminApp } from "@/lib/catalyst/app";
import { toZcqlDateTime } from "@/lib/catalyst/zcql-datetime";

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
 * The only code path that writes to Catalyst's AuditTrail table. Never pass passwords, secrets, or
 * medical clinical notes in `previousValue`/`newValue` — see docs/security-model.md §3.4.
 *
 * Uses the admin-scoped app rather than the caller's own request-scoped session because this is
 * called from contexts with no session at all (failed_login, registration, before a user has an
 * active account) as well as from authenticated actions — always attributable via `actorId`
 * itself, never via which session performed the write.
 */
export async function writeAuditLog(input: WriteAuditLogInput) {
  const catalystApp = catalystAdminApp();
  await catalystApp.datastore().table("AuditTrail").insertRow({
    actor_user_id: input.actorId,
    event_type: input.eventType,
    entity_type: input.entityType,
    entity_id: input.entityId ?? null,
    property_id: input.propertyId ?? null,
    department_id: input.departmentId ?? null,
    previous_value: input.previousValue != null ? JSON.stringify(input.previousValue) : null,
    new_value: input.newValue != null ? JSON.stringify(input.newValue) : null,
    reason: input.reason ?? null,
    request_id: input.requestId ?? null,
    ip_address: input.ipAddress ?? null,
    user_agent: input.userAgent ?? null,
    occurred_at: toZcqlDateTime(new Date()),
  });
}

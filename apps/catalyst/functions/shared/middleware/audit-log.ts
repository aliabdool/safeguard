import type { CatalystApp } from "./auth-context";

export interface AuditLogEntry {
  actorUserId: string | null;
  eventType: string;
  entityType: string;
  entityId?: string | null;
  propertyId?: string | null;
  reason?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}

/**
 * Every sensitive action and every export writes here (brief §11 and §14) — this is the single
 * write path so there's exactly one place that can get the shape wrong, not one per call site.
 * Fire-and-forget is deliberately NOT used: an audit write that silently fails is worse than a
 * slightly slower request, unlike the KPI snapshot writes in the dashboard endpoint (see
 * api-dashboard-summary), which are non-critical history and can be deferred.
 */
export async function writeAuditLog(catalystApp: CatalystApp, entry: AuditLogEntry): Promise<void> {
  const table = catalystApp.datastore().table("AuditTrail");
  await table.insertRow({
    actor_user_id: entry.actorUserId,
    event_type: entry.eventType,
    entity_type: entry.entityType,
    entity_id: entry.entityId ?? null,
    property_id: entry.propertyId ?? null,
    reason: entry.reason ?? null,
    ip_address: entry.ipAddress ?? null,
    user_agent: entry.userAgent ?? null,
  });
}

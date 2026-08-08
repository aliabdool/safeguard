import "server-only";

import { catalystAdminApp } from "@/lib/catalyst/app";

/**
 * Application-layer rate limiting keyed on IP address, backed by Catalyst's AuditTrail table
 * (audit_log doesn't store email for failed logins — avoids persisting attempted-but-unverified
 * email addresses). This is defense-in-depth on top of whatever edge-level rate limiting the
 * Catalyst AppSail deployment provides in production — it is what's actually testable/verifiable
 * from this codebase, not a replacement for an edge layer.
 *
 * Known trade-off: keying on IP means a shared IP (hotel/office NAT, corporate proxy) can trip the
 * limit for multiple genuine users. Accepted for v1 — see docs/security-model.md §8.
 */
export async function isRateLimited(params: {
  ipAddress: string | null;
  eventType: string;
  maxAttempts: number;
  windowMinutes: number;
}): Promise<boolean> {
  if (!params.ipAddress) {
    // No IP available (e.g. local dev without a proxy) — cannot rate-limit meaningfully, so
    // fail open rather than lock out every request.
    return false;
  }

  const catalystApp = catalystAdminApp();
  const windowStart = new Date(Date.now() - params.windowMinutes * 60 * 1000).toISOString();
  const now = new Date().toISOString();

  const recent = (await catalystApp.zcql().executeZCQLQuery(
    `select AuditTrail.ROWID from AuditTrail where AuditTrail.event_type = '${params.eventType}' and AuditTrail.ip_address = '${params.ipAddress}' and AuditTrail.occurred_at >= '${windowStart}' and AuditTrail.occurred_at <= '${now}' limit ${params.maxAttempts + 1}`,
  )) as unknown[];

  return recent.length >= params.maxAttempts;
}

import "server-only";

import { and, eq, gte } from "drizzle-orm";

import { getDb } from "@/db";
import { auditLog } from "@/db/schema";

/**
 * Application-layer, DB-backed rate limiting keyed on IP address (audit_log doesn't store email
 * for failed logins — avoids persisting attempted-but-unverified email addresses). This is
 * defense-in-depth on top of the edge-level rate limiting Cloudflare Workers provides in
 * production (docs/security-model.md §5) — it is what's actually testable/verifiable from this
 * codebase without a live Cloudflare account, not a replacement for the edge layer.
 *
 * Known trade-off: keying on IP means a shared IP (hotel/office NAT, corporate proxy) can trip
 * the limit for multiple genuine users. Accepted for v1 — see docs/security-model.md §8.
 */
export async function isRateLimited(params: {
  ipAddress: string | null;
  eventType: string;
  maxAttempts: number;
  windowMinutes: number;
}): Promise<boolean> {
  if (!params.ipAddress) {
    // No IP available (e.g. local dev without a proxy) — cannot rate-limit meaningfully, so
    // fail open rather than lock out every request. Production always runs behind Cloudflare,
    // which sets cf-connecting-ip.
    return false;
  }

  const db = getDb();
  const windowStart = new Date(Date.now() - params.windowMinutes * 60 * 1000);

  const recent = await db
    .select({ id: auditLog.id })
    .from(auditLog)
    .where(
      and(
        eq(auditLog.eventType, params.eventType),
        eq(auditLog.ipAddress, params.ipAddress),
        gte(auditLog.occurredAt, windowStart),
      ),
    )
    .limit(params.maxAttempts + 1);

  return recent.length >= params.maxAttempts;
}

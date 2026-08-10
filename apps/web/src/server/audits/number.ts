import "server-only";

import type { CatalystApp } from "@/lib/catalyst/app";
import { toZcqlDateTime } from "@/lib/catalyst/zcql-datetime";

/**
 * `AUD-{year}-{seq}`. Computed from a same-year count rather than a DB sequence — acceptable for
 * v1 volume; the `unique` constraint on Audits.audit_number (07-audits.json) is the actual
 * integrity backstop. Mirrors nextIncidentNumber() in server/incidents/number.ts.
 */
export async function nextAuditReference(catalystApp: CatalystApp): Promise<string> {
  const year = new Date().getFullYear();
  const yearStart = toZcqlDateTime(new Date(Date.UTC(year, 0, 1)));
  const yearEnd = toZcqlDateTime(new Date(Date.UTC(year + 1, 0, 1)));

  // No "as n" alias: confirmed live (see chat) that ZCQL aggregate results are keyed by the
  // column name INSIDE the function, not the SQL alias — reading `.Audits.n` silently returned
  // undefined -> 0 every time, so this always allocated sequence 1.
  const rows = (await catalystApp
    .zcql()
    .executeZCQLQuery(
      `select count(Audits.ROWID) from Audits where Audits.created_at >= '${yearStart}' and Audits.created_at <= '${yearEnd}'`,
    )) as Array<{ Audits: { ROWID: string } }>;

  const seq = Number(rows[0]?.Audits.ROWID ?? "0") + 1;
  return `AUD-${year}-${String(seq).padStart(4, "0")}`;
}

/** `FND-{year}-{seq}`. Same approach as nextAuditReference(), keyed off AuditFindings.raised_at. */
export async function nextFindingNumber(catalystApp: CatalystApp): Promise<string> {
  const year = new Date().getFullYear();
  const yearStart = toZcqlDateTime(new Date(Date.UTC(year, 0, 1)));
  const yearEnd = toZcqlDateTime(new Date(Date.UTC(year + 1, 0, 1)));

  // No "as n" alias — same reasoning as nextAuditReference() above.
  const rows = (await catalystApp
    .zcql()
    .executeZCQLQuery(
      `select count(AuditFindings.ROWID) from AuditFindings where AuditFindings.raised_at >= '${yearStart}' and AuditFindings.raised_at <= '${yearEnd}'`,
    )) as Array<{ AuditFindings: { ROWID: string } }>;

  const seq = Number(rows[0]?.AuditFindings.ROWID ?? "0") + 1;
  return `FND-${year}-${String(seq).padStart(4, "0")}`;
}

import "server-only";

import type { CatalystApp } from "@/lib/catalyst/app";

/**
 * `AUD-{year}-{seq}`. Computed from a same-year count rather than a DB sequence — acceptable for
 * v1 volume; the `unique` constraint on Audits.audit_number (07-audits.json) is the actual
 * integrity backstop. Mirrors nextIncidentNumber() in server/incidents/number.ts.
 */
export async function nextAuditReference(catalystApp: CatalystApp): Promise<string> {
  const year = new Date().getFullYear();
  const yearStart = new Date(Date.UTC(year, 0, 1)).toISOString();
  const yearEnd = new Date(Date.UTC(year + 1, 0, 1)).toISOString();

  const rows = (await catalystApp
    .zcql()
    .executeZCQLQuery(
      `select count(Audits.ROWID) as n from Audits where Audits.created_at between '${yearStart}' and '${yearEnd}'`,
    )) as Array<{ Audits: { n: string } }>;

  const seq = Number(rows[0]?.Audits.n ?? "0") + 1;
  return `AUD-${year}-${String(seq).padStart(4, "0")}`;
}

/** `FND-{year}-{seq}`. Same approach as nextAuditReference(), keyed off AuditFindings.raised_at. */
export async function nextFindingNumber(catalystApp: CatalystApp): Promise<string> {
  const year = new Date().getFullYear();
  const yearStart = new Date(Date.UTC(year, 0, 1)).toISOString();
  const yearEnd = new Date(Date.UTC(year + 1, 0, 1)).toISOString();

  const rows = (await catalystApp
    .zcql()
    .executeZCQLQuery(
      `select count(AuditFindings.ROWID) as n from AuditFindings where AuditFindings.raised_at between '${yearStart}' and '${yearEnd}'`,
    )) as Array<{ AuditFindings: { n: string } }>;

  const seq = Number(rows[0]?.AuditFindings.n ?? "0") + 1;
  return `FND-${year}-${String(seq).padStart(4, "0")}`;
}

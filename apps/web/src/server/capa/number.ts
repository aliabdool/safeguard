import "server-only";

import type { CatalystApp } from "@/lib/catalyst/app";
import { toZcqlDateTime } from "@/lib/catalyst/zcql-datetime";

/**
 * `CAPA-{YEAR}-{seq}` — global sequence, not per-property (see docs/database-model.md §4).
 * Computed from a same-year count rather than a DB sequence — acceptable for v1 volume; the
 * `unique` constraint on CAPA.capa_number (04-capa.json) is the actual integrity backstop, and
 * callers retry once on a unique-violation race (see createCapaAction), same pattern as
 * nextIncidentNumber() in server/incidents/number.ts.
 */
export async function nextCapaActionNumber(catalystApp: CatalystApp): Promise<string> {
  const year = new Date().getFullYear();
  const yearStart = toZcqlDateTime(new Date(Date.UTC(year, 0, 1)));
  const yearEnd = toZcqlDateTime(new Date(Date.UTC(year + 1, 0, 1)));

  const rows = (await catalystApp
    .zcql()
    .executeZCQLQuery(
      `select count(CAPA.ROWID) as n from CAPA where CAPA.created_at >= '${yearStart}' and CAPA.created_at <= '${yearEnd}'`,
    )) as Array<{ CAPA: { n: string } }>;

  const seq = Number(rows[0]?.CAPA.n ?? "0") + 1;
  return `CAPA-${year}-${String(seq).padStart(4, "0")}`;
}

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

  // No "as n" alias: confirmed live against the deployed project (see chat) that ZCQL aggregate
  // results are keyed by the column name INSIDE the function, not the SQL alias —
  // `count(CAPA.ROWID) as n` actually returns `{ CAPA: { ROWID: <count> } }`, not `{ n: <count> }`.
  // Reading `.CAPA.n` silently returned undefined -> 0 every time, so this always allocated
  // sequence 1 regardless of how many CAPA actions already existed that year.
  const rows = (await catalystApp
    .zcql()
    .executeZCQLQuery(
      `select count(CAPA.ROWID) from CAPA where CAPA.created_at >= '${yearStart}' and CAPA.created_at <= '${yearEnd}'`,
    )) as Array<{ CAPA: { ROWID: string } }>;

  const seq = Number(rows[0]?.CAPA.ROWID ?? "0") + 1;
  return `CAPA-${year}-${String(seq).padStart(4, "0")}`;
}

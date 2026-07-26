import "server-only";

import type { CatalystApp } from "@/lib/catalyst/app";

/**
 * `INC-{PROPERTY_CODE}-{YEAR}-{seq}`. Computed from a same-year count rather than a DB sequence —
 * acceptable for v1 volume (a handful of incidents per property per day at most); the `unique`
 * constraint on Incidents.incident_number (03-incidents.json) is the actual integrity backstop,
 * and callers retry once on a unique-violation race (see createIncidentAction).
 */
export async function nextIncidentNumber(
  catalystApp: CatalystApp,
  propertyCode: string,
  propertyId: string,
): Promise<string> {
  const year = new Date().getFullYear();
  const yearStart = new Date(Date.UTC(year, 0, 1)).toISOString();
  const yearEnd = new Date(Date.UTC(year + 1, 0, 1)).toISOString();

  const rows = (await catalystApp
    .zcql()
    .executeZCQLQuery(
      `select count(Incidents.ROWID) as n from Incidents where Incidents.property_id = '${propertyId}' and Incidents.created_at between '${yearStart}' and '${yearEnd}'`,
    )) as Array<{ Incidents: { n: string } }>;

  const seq = Number(rows[0]?.Incidents.n ?? "0") + 1;
  return `INC-${propertyCode}-${year}-${String(seq).padStart(4, "0")}`;
}

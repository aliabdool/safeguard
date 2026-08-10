import "server-only";

import type { CatalystApp } from "@/lib/catalyst/app";
import { toZcqlDateTime } from "@/lib/catalyst/zcql-datetime";
import { propertyScopeClause } from "@/server/kpi/scope";
import type { AuthContext } from "@/server/permissions";

export interface DataQualityRow {
  label: string;
  count: number;
}

/**
 * Real checks against this period/property's own records — the same reconciliation a board pack
 * should pass before publication. Shared by the dashboard tile and the board-narrative/assurance
 * exports so the two never drift out of sync with each other.
 */
export async function computeDataQuality(params: {
  catalystApp: CatalystApp;
  ctx: AuthContext;
  propertyId: string | null;
  periodStart: Date;
  periodEnd: Date;
}): Promise<DataQualityRow[]> {
  const { catalystApp, ctx, propertyId, periodStart, periodEnd } = params;
  const zcql = catalystApp.zcql();
  const datastore = catalystApp.datastore();

  const incidentScope = propertyId
    ? `Incidents.property_id = '${propertyId}'`
    : propertyScopeClause("Incidents.property_id", ctx);
  const periodClause = `Incidents.occurred_at >= '${toZcqlDateTime(periodStart)}' and Incidents.occurred_at <= '${toZcqlDateTime(periodEnd)}'`;

  const inScopeIncidents = (await datastore.table("Incidents").getRows({
    criteria: `${incidentScope} and ${periodClause}`,
  })) as Array<{ ROWID: string; status: string }>;
  const needingInvestigation = inScopeIncidents.filter((i) => i.status !== "reported");

  let missingRootCause = 0;
  if (needingInvestigation.length > 0) {
    const rootCauseRows = (await zcql.executeZCQLQuery(
      `select IncidentInvestigation.incident_id from IncidentRootCauses
       left join IncidentInvestigation on IncidentRootCauses.investigation_id = IncidentInvestigation.ROWID
       where IncidentRootCauses.cause_type = 'root'`,
    )) as Array<{ IncidentInvestigation: { incident_id: string } }>;
    const rootCauseIncidentIds = new Set(
      rootCauseRows.map((r) => r.IncidentInvestigation.incident_id),
    );
    missingRootCause = needingInvestigation.filter((i) => !rootCauseIncidentIds.has(i.ROWID)).length;
  }

  // No "as n" alias: confirmed live (see chat) that ZCQL aggregate results are keyed by the
  // column name INSIDE the function, not the SQL alias.
  const missingInjuryMechanismRows = (await zcql.executeZCQLQuery(
    `select count(Incidents.ROWID) from Incidents
     where ${incidentScope} and ${periodClause} and Incidents.injury_mechanism_id is null and Incidents.outcome != 'no_injury'`,
  )) as Array<{ Incidents: { ROWID: string } }>;

  // IncidentOSHReportability.incident_id is a plain Text column, not a real Lookup/FK to
  // Incidents (same class of bug as the UserRoles/Roles join fixed in
  // server/permissions/index.ts), so in-scope incident ROWIDs are resolved first and
  // IncidentOSHReportability is filtered by incident_id in application code rather than joined.
  const pendingReportableIncidentIds = new Set(inScopeIncidents.map((i) => i.ROWID));
  let pendingReportableCount = 0;
  if (pendingReportableIncidentIds.size > 0) {
    const pendingReportableRows = (await datastore.table("IncidentOSHReportability").getRows({
      criteria: `IncidentOSHReportability.incident_id in (${[...pendingReportableIncidentIds].map((id) => `'${id}'`).join(",")}) and IncidentOSHReportability.reportable_status = 'pending_determination'`,
    })) as unknown as Array<{ incident_id: string }>;
    pendingReportableCount = pendingReportableRows.length;
  }

  const capaScope = propertyId
    ? `CAPA.property_id = '${propertyId}'`
    : propertyScopeClause("CAPA.property_id", ctx);
  const today = new Date().toISOString().slice(0, 10);
  const overdueCapaRows = (await zcql.executeZCQLQuery(
    `select count(CAPA.ROWID) from CAPA
     where ${capaScope} and CAPA.due_date < '${today}' and CAPA.status != 'closed' and CAPA.status != 'verified'`,
  )) as Array<{ CAPA: { ROWID: string } }>;

  return [
    { label: "Missing root cause (investigated incidents)", count: missingRootCause },
    {
      label: "Missing injury mechanism (injury outcomes)",
      count: Number(missingInjuryMechanismRows[0]?.Incidents.ROWID ?? 0),
    },
    {
      label: "OSH-reportable status not yet determined",
      count: pendingReportableCount,
    },
    { label: "Corrective actions overdue", count: Number(overdueCapaRows[0]?.CAPA.ROWID ?? 0) },
  ];
}

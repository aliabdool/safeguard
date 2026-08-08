import "server-only";

import type { CatalystApp } from "@/lib/catalyst/app";
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
  const periodClause = `Incidents.occurred_at >= '${periodStart.toISOString()}' and Incidents.occurred_at <= '${periodEnd.toISOString()}'`;

  const inScopeIncidents = (await datastore.table("Incidents").getRows({
    criteria: `${incidentScope} && ${periodClause}`,
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

  const missingInjuryMechanismRows = (await zcql.executeZCQLQuery(
    `select count(Incidents.ROWID) as n from Incidents
     where ${incidentScope} && ${periodClause} && Incidents.injury_mechanism_id is null && Incidents.outcome != 'no_injury'`,
  )) as Array<{ Incidents: { n: string } }>;

  const pendingReportableRows = (await zcql.executeZCQLQuery(
    `select count(Incidents.ROWID) as n from Incidents
     left join IncidentOSHReportability on Incidents.ROWID = IncidentOSHReportability.incident_id
     where ${incidentScope} && ${periodClause} && IncidentOSHReportability.reportable_status = 'pending_determination'`,
  )) as Array<{ Incidents: { n: string } }>;

  const capaScope = propertyId
    ? `CAPA.property_id = '${propertyId}'`
    : propertyScopeClause("CAPA.property_id", ctx);
  const today = new Date().toISOString().slice(0, 10);
  const overdueCapaRows = (await zcql.executeZCQLQuery(
    `select count(CAPA.ROWID) as n from CAPA
     where ${capaScope} && CAPA.due_date < '${today}' && CAPA.status != 'closed' && CAPA.status != 'verified'`,
  )) as Array<{ CAPA: { n: string } }>;

  return [
    { label: "Missing root cause (investigated incidents)", count: missingRootCause },
    {
      label: "Missing injury mechanism (injury outcomes)",
      count: Number(missingInjuryMechanismRows[0]?.Incidents.n ?? 0),
    },
    {
      label: "OSH-reportable status not yet determined",
      count: Number(pendingReportableRows[0]?.Incidents.n ?? 0),
    },
    { label: "Corrective actions overdue", count: Number(overdueCapaRows[0]?.CAPA.n ?? 0) },
  ];
}

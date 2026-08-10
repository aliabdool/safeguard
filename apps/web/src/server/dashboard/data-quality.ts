import "server-only";

import type { CatalystApp } from "@/lib/catalyst/app";
import { toZcqlDateTime } from "@/lib/catalyst/zcql-datetime";
import { propertyScopeClause } from "@/server/kpi/scope";
import type { AuthContext } from "@/server/permissions";

export interface DataQualityRow {
  label: string;
  count: number;
  /** Up to a handful of affected record ROWIDs, for direct drill-through links — deliberately not
   * every affected record for a large count (a "1,000 links" list isn't drillable, it's noise). */
  sampleIncidentIds: string[];
}

/**
 * Real checks against this period/property's own records — the same reconciliation a board pack
 * should pass before publication. Shared by the dashboard tile and the board-narrative/assurance
 * exports so the two never drift out of sync with each other. Expanded (see chat, CEO dashboard
 * §13) from the original 4 conditions to cover the fields the incident wizard's Part B/C rework
 * (see chat) now captures, plus CAPA governance gaps. Two conditions the brief also names —
 * "evidence missing/expired" — are NOT included: there is no expiry-date field anywhere in the
 * live Documents/DocumentVersions schema to check against, and fabricating one would violate the
 * same "never invent a value" rule this whole dashboard follows. Documented as a known gap in the
 * final report rather than faked.
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
  })) as Array<{
    ROWID: string;
    status: string;
    outcome: string;
    injury_mechanism_id: string | null;
    injury_type: string | null;
    body_part: string | null;
    person_event_type: string;
    actual_severity: string;
    potential_severity: string;
  }>;
  const needingInvestigation = inScopeIncidents.filter((i) => i.status !== "reported");
  const injuryOutcomeIncidents = inScopeIncidents.filter((i) => i.outcome !== "no_injury");
  const sample = (ids: string[]) => ids.slice(0, 5);

  let missingRootCauseIds: string[] = [];
  if (needingInvestigation.length > 0) {
    const rootCauseRows = (await zcql.executeZCQLQuery(
      `select IncidentInvestigation.incident_id from IncidentRootCauses
       left join IncidentInvestigation on IncidentRootCauses.investigation_id = IncidentInvestigation.ROWID
       where IncidentRootCauses.cause_type = 'root'`,
    )) as Array<{ IncidentInvestigation: { incident_id: string } }>;
    const rootCauseIncidentIds = new Set(
      rootCauseRows.map((r) => r.IncidentInvestigation.incident_id),
    );
    missingRootCauseIds = needingInvestigation
      .filter((i) => !rootCauseIncidentIds.has(i.ROWID))
      .map((i) => i.ROWID);
  }

  const missingInjuryMechanismIds = injuryOutcomeIncidents
    .filter((i) => i.injury_mechanism_id == null)
    .map((i) => i.ROWID);
  const missingNatureOfInjuryIds = injuryOutcomeIncidents
    .filter((i) => !i.injury_type)
    .map((i) => i.ROWID);
  const missingBodyPartIds = injuryOutcomeIncidents.filter((i) => !i.body_part).map((i) => i.ROWID);
  const missingSeverityIds = inScopeIncidents
    .filter((i) => Number(i.actual_severity) < 1 || Number(i.potential_severity) < 1)
    .map((i) => i.ROWID);

  // Missing affected-person information: an injury-outcome incident with no linked IncidentPersons
  // row (legacy data predating the Part B/C wizard rework, or a direct API write that bypassed the
  // wizard's own validatePersonInjuryConsistency() gate — see chat).
  let missingAffectedPersonIds: string[] = [];
  if (injuryOutcomeIncidents.length > 0) {
    const personRows = (await datastore.table("IncidentPersons").getRows({
      criteria: `IncidentPersons.incident_id in (${injuryOutcomeIncidents.map((i) => `'${i.ROWID}'`).join(",")})`,
    })) as unknown as Array<{ incident_id: string }>;
    const incidentIdsWithPersons = new Set(personRows.map((r) => r.incident_id));
    missingAffectedPersonIds = injuryOutcomeIncidents
      .filter((i) => !incidentIdsWithPersons.has(i.ROWID))
      .map((i) => i.ROWID);
  }

  // IncidentOSHReportability.incident_id is a plain Text column, not a real Lookup/FK to
  // Incidents (same class of bug as the UserRoles/Roles join fixed in
  // server/permissions/index.ts), so in-scope incident ROWIDs are resolved first and
  // IncidentOSHReportability is filtered by incident_id in application code rather than joined.
  const pendingReportableIncidentIds = new Set(inScopeIncidents.map((i) => i.ROWID));
  let pendingReportableIds: string[] = [];
  if (pendingReportableIncidentIds.size > 0) {
    const pendingReportableRows = (await datastore.table("IncidentOSHReportability").getRows({
      criteria: `IncidentOSHReportability.incident_id in (${[...pendingReportableIncidentIds].map((id) => `'${id}'`).join(",")}) and IncidentOSHReportability.reportable_status = 'pending_determination'`,
    })) as unknown as Array<{ incident_id: string }>;
    pendingReportableIds = pendingReportableRows.map((r) => r.incident_id);
  }

  // Investigations open longer than 14 days without completion.
  let overdueInvestigationIds: string[] = [];
  if (needingInvestigation.length > 0) {
    const investigationRows = (await datastore.table("IncidentInvestigation").getRows({
      criteria: `IncidentInvestigation.incident_id in (${needingInvestigation.map((i) => `'${i.ROWID}'`).join(",")}) and IncidentInvestigation.status not in ('completed','approved')`,
    })) as unknown as Array<{ incident_id: string; assigned_at: string }>;
    const fourteenDaysAgo = toZcqlDateTime(new Date(Date.now() - 14 * 24 * 60 * 60 * 1000));
    overdueInvestigationIds = investigationRows
      .filter((r) => r.assigned_at < fourteenDaysAgo)
      .map((r) => r.incident_id);
  }

  const capaScope = propertyId
    ? `CAPA.property_id = '${propertyId}'`
    : propertyScopeClause("CAPA.property_id", ctx);
  const today = toZcqlDateTime(new Date()).slice(0, 10);
  const allCapaRows = (await datastore.table("CAPA").getRows({
    criteria: capaScope,
  })) as unknown as Array<{
    ROWID: string;
    status: string;
    due_date: string;
    owner_id: string | null;
    final_approved_by: string | null;
  }>;
  const overdueCapaIds = allCapaRows
    .filter((c) => c.due_date < today && c.status !== "closed" && c.status !== "verified")
    .map((c) => c.ROWID);
  const missingCapaOwnerIds = allCapaRows.filter((c) => !c.owner_id).map((c) => c.ROWID);
  const closedWithoutApprovalIds = allCapaRows
    .filter((c) => c.status === "closed" && !c.final_approved_by)
    .map((c) => c.ROWID);

  const closedOrVerifiedCapaIds = allCapaRows
    .filter((c) => c.status === "closed" || c.status === "verified")
    .map((c) => c.ROWID);
  let missingEffectivenessReviewIds: string[] = [];
  if (closedOrVerifiedCapaIds.length > 0) {
    const verificationRows = (await datastore.table("CAPAVerification").getRows({
      criteria: `CAPAVerification.capa_id in (${closedOrVerifiedCapaIds.map((id) => `'${id}'`).join(",")})`,
    })) as unknown as Array<{ capa_id: string }>;
    const verifiedCapaIds = new Set(verificationRows.map((r) => r.capa_id));
    missingEffectivenessReviewIds = closedOrVerifiedCapaIds.filter((id) => !verifiedCapaIds.has(id));
  }

  return [
    {
      label: "Missing root cause (investigated incidents)",
      count: missingRootCauseIds.length,
      sampleIncidentIds: sample(missingRootCauseIds),
    },
    {
      label: "Missing injury mechanism (injury outcomes)",
      count: missingInjuryMechanismIds.length,
      sampleIncidentIds: sample(missingInjuryMechanismIds),
    },
    {
      label: "Missing nature of injury (injury outcomes)",
      count: missingNatureOfInjuryIds.length,
      sampleIncidentIds: sample(missingNatureOfInjuryIds),
    },
    {
      label: "Missing body part (injury outcomes)",
      count: missingBodyPartIds.length,
      sampleIncidentIds: sample(missingBodyPartIds),
    },
    {
      label: "Missing affected-person information (injury outcomes)",
      count: missingAffectedPersonIds.length,
      sampleIncidentIds: sample(missingAffectedPersonIds),
    },
    {
      label: "Missing/invalid severity rating",
      count: missingSeverityIds.length,
      sampleIncidentIds: sample(missingSeverityIds),
    },
    {
      label: "OSH-reportable status not yet determined",
      count: pendingReportableIds.length,
      sampleIncidentIds: sample(pendingReportableIds),
    },
    {
      label: "Investigation overdue (open more than 14 days)",
      count: overdueInvestigationIds.length,
      sampleIncidentIds: sample(overdueInvestigationIds),
    },
    {
      label: "Corrective actions overdue",
      count: overdueCapaIds.length,
      sampleIncidentIds: sample(overdueCapaIds),
    },
    {
      label: "Corrective action owner missing",
      count: missingCapaOwnerIds.length,
      sampleIncidentIds: sample(missingCapaOwnerIds),
    },
    {
      label: "Effectiveness review missing (closed/verified actions)",
      count: missingEffectivenessReviewIds.length,
      sampleIncidentIds: sample(missingEffectivenessReviewIds),
    },
    {
      label: "Closed without required approval",
      count: closedWithoutApprovalIds.length,
      sampleIncidentIds: sample(closedWithoutApprovalIds),
    },
  ];
}

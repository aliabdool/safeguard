import "server-only";

import { propertyScopeClause } from "../scope";
import type { KpiCalculationParams, KpiCalculationResult } from "../types";

/**
 * "Recordable" per GRI 403-9/OSHA-style convention: any outcome more serious than first aid.
 * Matches the canonical `outcome` values incidents are written with (see
 * src/app/(app)/incidents/actions.ts) — first_aid and no_injury are excluded.
 */
export const RECORDABLE_OUTCOMES = [
  "medical_treatment",
  "lost_time_injury",
  "hospitalisation",
  "fatality",
] as const;

/** Not `extends CatalystRow` — indexed dynamically by field name below, which
 * `Record<string, string>`'s index signature can't express alongside optional properties. */
interface IncidentSumRow {
  ROWID: string;
  [key: string]: string | undefined;
}

/** Builds the shared property/department criteria fragment for an Incidents query. */
function incidentScopeClause(params: KpiCalculationParams): { propClause: string; deptClause: string } {
  const propClause = params.propertyId
    ? `Incidents.property_id = '${params.propertyId}'`
    : propertyScopeClause("Incidents.property_id", params.ctx);
  const deptClause = params.departmentId
    ? ` and Incidents.department_id = '${params.departmentId}'`
    : "";
  return { propClause, deptClause };
}

/**
 * Shared "count incidents matching an extra predicate, for the current and comparison period"
 * shape used by most lagging/leading incident KPIs (TOTAL_INCIDENTS, EMPLOYEE_INCIDENTS,
 * CONTRACTOR_INCIDENTS, GUEST_INCIDENTS, LTI, NEAR_MISSES, UNSAFE_CONDITIONS, HIGH_POTENTIAL).
 * Returns the actual matched incident ROWIDs as `includedRecordIds` so "View calculation" can
 * link straight through to the records that produced the number — never a black-box count.
 *
 * `extraClause` is a raw Data Store criteria fragment (rather than a Drizzle SQL predicate,
 * since Catalyst Data Store has no query builder — see apps/web/src/app/(app)/incidents/
 * actions.ts for the established `getRows({ criteria })` convention this mirrors).
 */
export async function countIncidentsInPeriod(
  params: KpiCalculationParams,
  extraClause?: string,
): Promise<KpiCalculationResult> {
  const datastore = params.catalystApp.datastore();
  const { propClause, deptClause } = incidentScopeClause(params);
  const extra = extraClause ? ` and ${extraClause}` : "";

  const currentRows = await datastore.table("Incidents").getRows({
    criteria: `${propClause}${deptClause}${extra} and Incidents.occurred_at >= '${params.periodStart.toISOString()}' and Incidents.occurred_at <= '${params.periodEnd.toISOString()}'`,
  });
  const comparisonRows = await datastore.table("Incidents").getRows({
    criteria: `${propClause}${deptClause}${extra} and Incidents.occurred_at >= '${params.comparisonPeriodStart.toISOString()}' and Incidents.occurred_at < '${params.comparisonPeriodEnd.toISOString()}'`,
  });

  return {
    currentValue: currentRows.length,
    comparisonValue: comparisonRows.length,
    includedRecordIds: currentRows.map((r) => r.ROWID),
    excludedRecordIds: [],
    dataQualityStatus: "ok",
  };
}

/**
 * REPORTABLE_OSH_CASES needs a join: unlike the Postgres build (where reportable_status was a
 * column on incidents itself), Catalyst keeps the statutory-notification determination on its own
 * IncidentOSHReportability table (see 03-incidents.json) — the same split the incidents module's
 * own Catalyst port already made. Mirrors countReportableOshCases() in
 * apps/catalyst/functions/shared/adapters/kpi-datastore-repo.ts, with both current AND comparison
 * periods computed (that standalone client's version only computes one; the "vs last year" tile
 * comparison is a feature of this module that must not regress).
 */
export async function countReportableOshCasesInPeriod(
  params: KpiCalculationParams,
): Promise<KpiCalculationResult> {
  const datastore = params.catalystApp.datastore();
  const { propClause, deptClause } = incidentScopeClause(params);

  // IncidentOSHReportability.incident_id is a plain Text column, not a real Lookup/FK to
  // Incidents — confirmed live for the same class of column (see UserRoles/Roles fix in
  // server/permissions/index.ts) — so incidents in-range/in-scope are resolved to a ROWID list
  // first and IncidentOSHReportability is filtered by incident_id in application code rather than
  // joined in ZCQL.
  async function countInRange(op: "between" | "half-open", start: string, end: string) {
    const rangeClause =
      op === "between"
        ? `Incidents.occurred_at >= '${start}' and Incidents.occurred_at <= '${end}'`
        : `Incidents.occurred_at >= '${start}' and Incidents.occurred_at < '${end}'`;
    const incidentRows = (await datastore.table("Incidents").getRows({
      criteria: `${propClause}${deptClause} and ${rangeClause}`,
    })) as unknown as Array<{ ROWID: string }>;
    const incidentIds = incidentRows.map((r) => r.ROWID);
    if (incidentIds.length === 0) return [];
    const reportableRows = (await datastore.table("IncidentOSHReportability").getRows({
      criteria: `IncidentOSHReportability.incident_id in (${incidentIds.map((id) => `'${id}'`).join(",")}) and IncidentOSHReportability.reportable_status = 'yes'`,
    })) as unknown as Array<{ incident_id: string }>;
    return reportableRows.map((r) => r.incident_id);
  }

  const currentIds = await countInRange(
    "between",
    params.periodStart.toISOString(),
    params.periodEnd.toISOString(),
  );
  const comparisonIds = await countInRange(
    "half-open",
    params.comparisonPeriodStart.toISOString(),
    params.comparisonPeriodEnd.toISOString(),
  );

  return {
    currentValue: currentIds.length,
    comparisonValue: comparisonIds.length,
    includedRecordIds: currentIds,
    excludedRecordIds: [],
    dataQualityStatus: "ok",
  };
}

async function sumIncidentField(
  params: KpiCalculationParams,
  field: "lost_workdays" | "restricted_duty_days" | "incident_cost",
): Promise<KpiCalculationResult> {
  const datastore = params.catalystApp.datastore();
  const { propClause, deptClause } = incidentScopeClause(params);

  const currentRows = (await datastore.table("Incidents").getRows({
    criteria: `${propClause}${deptClause} and Incidents.occurred_at >= '${params.periodStart.toISOString()}' and Incidents.occurred_at <= '${params.periodEnd.toISOString()}'`,
  })) as IncidentSumRow[];
  const comparisonRows = (await datastore.table("Incidents").getRows({
    criteria: `${propClause}${deptClause} and Incidents.occurred_at >= '${params.comparisonPeriodStart.toISOString()}' and Incidents.occurred_at < '${params.comparisonPeriodEnd.toISOString()}'`,
  })) as IncidentSumRow[];

  return {
    currentValue: currentRows.reduce((sum, r) => sum + Number(r[field] ?? 0), 0),
    comparisonValue: comparisonRows.reduce((sum, r) => sum + Number(r[field] ?? 0), 0),
    includedRecordIds: currentRows.map((r) => r.ROWID),
    excludedRecordIds: [],
    dataQualityStatus: "ok",
  };
}

export async function sumIncidentCostInPeriod(
  params: KpiCalculationParams,
): Promise<KpiCalculationResult> {
  return sumIncidentField(params, "incident_cost");
}

/**
 * Sum of an integer incident column (lost_workdays, restricted_duty_days) over the period — same
 * shape as sumIncidentCostInPeriod, generalised to any integer column so LOST_WORKDAYS and
 * RESTRICTED_DUTY_DAYS don't each need a bespoke copy.
 */
export async function sumIncidentIntegerFieldInPeriod(
  params: KpiCalculationParams,
  field: "lost_workdays" | "restricted_duty_days",
): Promise<KpiCalculationResult> {
  return sumIncidentField(params, field);
}

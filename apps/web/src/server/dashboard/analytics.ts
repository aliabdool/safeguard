import "server-only";

import type { CatalystApp } from "@/lib/catalyst/app";
import { zcqlString } from "@/lib/catalyst/zcql-escape";
import { toZcqlDateTime } from "@/lib/catalyst/zcql-datetime";
import { RECORDABLE_OUTCOMES } from "@/server/kpi/calculations/incidents";
import { financialYearFor, previousFinancialYear, type Period } from "@/server/kpi/period";
import { propertyScopeClause } from "@/server/kpi/scope";
import type { AuthContext } from "@/server/permissions";

import {
  computeCategoricalBreakdowns,
  computeDepartmentAnalysis,
  computeDepartmentFyHeatmap,
  computeFyHistory,
  computeMonthlyTrend,
  type CategoricalBreakdowns,
  type DepartmentAnalysisRow,
  type DepartmentFyHeatmapRow,
  type FyHistoryPoint,
  type IncidentAnalyticsRecord,
  type MonthlyTrendPoint,
} from "./analytics-pure";

/** Not `extends CatalystRow` — `body_part` is genuinely nullable, which conflicts with
 * CatalystRow's `Record<string, string>` index signature (same reasoning as ControlRow in
 * assurance-heatmap.ts). */
interface IncidentAnalyticsRawRow {
  ROWID: string;
  occurred_at: string;
  incident_type: string;
  outcome: string;
  person_event_type: string;
  body_part: string | null;
  department_id: string;
  lost_workdays: string;
  hospital_referral: string;
}

const RECORDABLE_OUTCOME_SET: ReadonlySet<string> = new Set(RECORDABLE_OUTCOMES);

/** Analytics filters mirror the Safety Performance Analytics page's own filter row (see chat §K):
 * Business Unit narrows propertyId itself (handled by the caller passing a concrete propertyId),
 * everything else here is additional criteria on top of the scoped Incidents query. */
export interface AnalyticsFilters {
  propertyId?: string | null;
  departmentId?: string | null;
  incidentType?: string | null;
  personEventType?: string | null;
}

function extraFilterClause(filters: AnalyticsFilters): string {
  const parts: string[] = [];
  if (filters.departmentId) {
    parts.push(`Incidents.department_id = ${zcqlString(filters.departmentId)}`);
  }
  if (filters.incidentType) parts.push(`Incidents.incident_type = ${zcqlString(filters.incidentType)}`);
  if (filters.personEventType) {
    parts.push(`Incidents.person_event_type = ${zcqlString(filters.personEventType)}`);
  }
  return parts.length > 0 ? ` and ${parts.join(" and ")}` : "";
}

/**
 * Resolves the incident ROWIDs within `incidentIds` that have a live "yes" OSH-reportable
 * determination — same "list scoped incident ids, then filter IncidentOSHReportability
 * application-side" pattern as countReportableOshCasesInPeriod() (IncidentOSHReportability.
 * incident_id is a plain Text column, not a real Lookup/FK — see that function's own comment).
 */
async function resolveOshReportableIds(
  catalystApp: CatalystApp,
  incidentIds: string[],
): Promise<Set<string>> {
  if (incidentIds.length === 0) return new Set();
  const rows = (await catalystApp
    .datastore()
    .table("IncidentOSHReportability")
    .getRows({
      criteria: `IncidentOSHReportability.incident_id in (${incidentIds.map((id) => zcqlString(id)).join(",")}) and IncidentOSHReportability.reportable_status = 'yes'`,
    })) as unknown as Array<{ incident_id: string }>;
  return new Set(rows.map((r) => r.incident_id));
}

/**
 * Fetches and classifies every Incidents row in `period` matching `ctx`'s scope + `filters` (see
 * chat: the Safety Performance Analytics rebuild). Classification (isMajor/isOshReportable) is
 * resolved here, once, so every pure aggregation downstream (analytics-pure.ts) works from the
 * same facts instead of re-deriving them.
 */
export async function fetchIncidentAnalyticsRecords(
  catalystApp: CatalystApp,
  ctx: AuthContext,
  filters: AnalyticsFilters,
  period: Period,
): Promise<IncidentAnalyticsRecord[]> {
  const datastore = catalystApp.datastore();
  const propClause = filters.propertyId
    ? `Incidents.property_id = ${zcqlString(filters.propertyId)}`
    : propertyScopeClause("Incidents.property_id", ctx);
  const extra = extraFilterClause(filters);

  const rows = (await datastore.table("Incidents").getRows({
    criteria: `${propClause}${extra} and Incidents.occurred_at >= '${toZcqlDateTime(period.start)}' and Incidents.occurred_at < '${toZcqlDateTime(period.end)}'`,
  })) as unknown as IncidentAnalyticsRawRow[];

  const oshReportableIds = await resolveOshReportableIds(
    catalystApp,
    rows.map((r) => r.ROWID),
  );

  return rows.map((r) => ({
    id: r.ROWID,
    occurredAt: new Date(r.occurred_at),
    incidentType: r.incident_type,
    outcome: r.outcome,
    personEventType: r.person_event_type,
    bodyPart: r.body_part,
    departmentId: r.department_id,
    lostWorkdays: Number(r.lost_workdays ?? 0),
    isMajor: RECORDABLE_OUTCOME_SET.has(r.outcome),
    isHospitalReferral: r.hospital_referral === "true",
    isOshReportable: oshReportableIds.has(r.ROWID),
  }));
}

export interface SafetyAnalyticsData {
  currentFyLabel: string;
  comparisonFyLabel: string;
  currentRecords: IncidentAnalyticsRecord[];
  comparisonRecords: IncidentAnalyticsRecord[];
  monthlyTrend: MonthlyTrendPoint[];
  fyHistory: FyHistoryPoint[];
  departmentAnalysis: DepartmentAnalysisRow[];
  departmentFyHeatmap: DepartmentFyHeatmapRow[];
  breakdowns: CategoricalBreakdowns;
  comparisonBreakdowns: CategoricalBreakdowns;
}

/**
 * Full data set for the Safety Performance Analytics page (see chat §K-P) — every figure is a real
 * Incidents query result, never hard-coded from the reference Excel dashboard. `historyDepth`
 * controls how many financial years the FY-history chart and department x FY heatmap cover
 * (defaults to 4, matching recentFinancialYears()'s own convention elsewhere in this app).
 */
export async function computeSafetyAnalytics(
  catalystApp: CatalystApp,
  ctx: AuthContext,
  filters: AnalyticsFilters,
  asOf: Date,
  departments: Array<{ id: string; name: string }>,
  historyDepth = 4,
  breakdownLabels?: {
    incidentType?: (v: string) => string;
    outcome?: (v: string) => string;
    personType?: (v: string) => string;
  },
): Promise<SafetyAnalyticsData> {
  const { fyLabel: currentFyLabel, period: currentPeriod } = financialYearFor(asOf);
  const comparisonPeriod = previousFinancialYear(currentPeriod);
  const { fyLabel: comparisonFyLabel } = financialYearFor(
    new Date(comparisonPeriod.end.getTime() - 1),
  );

  const historyPeriods: Array<{ fyLabel: string; period: Period }> = [];
  let period = currentPeriod;
  let label = currentFyLabel;
  for (let i = 0; i < historyDepth; i++) {
    historyPeriods.push({ fyLabel: label, period });
    const prev = previousFinancialYear(period);
    const relabelled = financialYearFor(new Date(prev.end.getTime() - 1));
    label = relabelled.fyLabel;
    period = prev;
  }
  historyPeriods.reverse(); // oldest first, so charts read left-to-right chronologically

  const recordsByFy = new Map<string, IncidentAnalyticsRecord[]>();
  for (const { fyLabel: hLabel, period: hPeriod } of historyPeriods) {
    const records = await fetchIncidentAnalyticsRecords(catalystApp, ctx, filters, hPeriod);
    recordsByFy.set(hLabel, records);
  }

  const currentRecords = recordsByFy.get(currentFyLabel) ?? [];
  const comparisonRecords =
    recordsByFy.get(comparisonFyLabel) ??
    (await fetchIncidentAnalyticsRecords(catalystApp, ctx, filters, comparisonPeriod));

  const historyBuckets = historyPeriods.map(({ fyLabel: hLabel }) => ({
    fyLabel: hLabel,
    records: recordsByFy.get(hLabel) ?? [],
  }));

  return {
    currentFyLabel,
    comparisonFyLabel,
    currentRecords,
    comparisonRecords,
    monthlyTrend: computeMonthlyTrend(
      currentPeriod.start,
      comparisonPeriod.start,
      currentRecords,
      comparisonRecords,
    ),
    fyHistory: computeFyHistory(historyBuckets),
    departmentAnalysis: computeDepartmentAnalysis(
      currentRecords,
      comparisonRecords,
      departments,
    ),
    departmentFyHeatmap: computeDepartmentFyHeatmap(historyBuckets, departments),
    breakdowns: computeCategoricalBreakdowns(currentRecords, breakdownLabels),
    comparisonBreakdowns: computeCategoricalBreakdowns(comparisonRecords, breakdownLabels),
  };
}

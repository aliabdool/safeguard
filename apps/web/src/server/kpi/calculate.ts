import "server-only";

import { after } from "next/server";

import type { CatalystApp } from "@/lib/catalyst/app";
import type { AuthContext } from "@/server/permissions";

import { capaClosedOnTimeRate, capaEffectivenessRate } from "./calculations/capa";
import { countOpenCriticalMajorFindings } from "./calculations/findings";
import { frameworkReadinessKpi } from "./calculations/framework";
import {
  RECORDABLE_OUTCOMES,
  countIncidentsInPeriod,
  countReportableOshCasesInPeriod,
  sumIncidentCostInPeriod,
  sumIncidentIntegerFieldInPeriod,
} from "./calculations/incidents";
import { financialYearFor, previousFinancialYear, sameperiodYtdComparison } from "./period";
import { computeRagStatus, computeVariance, type KpiDirection, type RagStatus } from "./rag";
import type { KpiCalculationParams, KpiCalculationResult } from "./types";

type CalculationFn = (params: KpiCalculationParams) => Promise<KpiCalculationResult>;

/**
 * Registry mapping KPI code -> calculation function. Every entry here has a matching row in
 * Catalyst's `KPIDefinitions` table (apps/catalyst/data-store-schema/02-master-data.json) — the
 * registry is intentionally a subset of the full 38-KPI catalogue for v1: these are the
 * representative, fully-wired examples across lagging/leading/assurance classifications and
 * count/sum/rollup calculation shapes. Extending to the remaining KPIs means adding a function
 * here in the same shape, not changing the engine.
 */
const REGISTRY: Record<string, CalculationFn> = {
  TOTAL_INCIDENTS: (p) => countIncidentsInPeriod(p),
  EMPLOYEE_INCIDENTS: (p) => countIncidentsInPeriod(p, "Incidents.person_event_type == 'employee'"),
  CONTRACTOR_INCIDENTS: (p) =>
    countIncidentsInPeriod(p, "Incidents.person_event_type == 'contractor'"),
  GUEST_INCIDENTS: (p) => countIncidentsInPeriod(p, "Incidents.person_event_type == 'guest'"),
  NEAR_MISSES: (p) => countIncidentsInPeriod(p, "Incidents.person_event_type == 'near_miss'"),
  UNSAFE_CONDITIONS: (p) =>
    countIncidentsInPeriod(p, "Incidents.person_event_type == 'unsafe_condition'"),
  HIGH_POTENTIAL: (p) => countIncidentsInPeriod(p, "Incidents.is_high_potential == true"),
  HOSPITAL_REFERRALS: (p) => countIncidentsInPeriod(p, "Incidents.hospital_referral == true"),
  TRAINEE_INCIDENTS: (p) => countIncidentsInPeriod(p, "Incidents.person_event_type == 'trainee'"),
  REPORTABLE_OSH_CASES: (p) => countReportableOshCasesInPeriod(p),
  FATALITIES: (p) => countIncidentsInPeriod(p, "Incidents.outcome == 'fatality'"),
  LTI: (p) => countIncidentsInPeriod(p, "Incidents.lost_workdays > 0"),
  MTC: (p) => countIncidentsInPeriod(p, "Incidents.outcome == 'medical_treatment'"),
  RECORDABLE_INJURIES: (p) =>
    countIncidentsInPeriod(
      p,
      `Incidents.outcome in (${RECORDABLE_OUTCOMES.map((o) => `'${o}'`).join(",")})`,
    ),
  LOST_WORKDAYS: (p) => sumIncidentIntegerFieldInPeriod(p, "lost_workdays"),
  RESTRICTED_DUTY_DAYS: (p) => sumIncidentIntegerFieldInPeriod(p, "restricted_duty_days"),
  CAPA_EFFECTIVENESS: (p) => capaEffectivenessRate(p),
  INCIDENT_COST: (p) => sumIncidentCostInPeriod(p),
  OPEN_CRIT_MAJOR_FINDINGS: (p) => countOpenCriticalMajorFindings(p),
  CAPA_ON_TIME: (p) => capaClosedOnTimeRate(p),
  ISO45001_READINESS: (p) => frameworkReadinessKpi("ISO45001", p),
  LEGAL_COMPLIANCE: (p) => frameworkReadinessKpi("MU_LEGAL", p),
};

export interface KpiTileResult {
  kpiCode: string;
  name: string;
  unit: string;
  classification: string;
  direction: KpiDirection;
  currentValue: number | null;
  comparisonValue: number | null;
  varianceAbs: number | null;
  variancePct: number | null;
  target: number | null;
  ragStatus: RagStatus;
  dataThroughDate: Date;
  dataQualityStatus: string;
  isYtdClipped: boolean;
  includedRecordIds: string[];
  fyLabel: string;
  isImplemented: boolean;
}

/** Not `extends CatalystRow` — target/warning_threshold/critical_threshold are genuinely
 * nullable, which conflicts with CatalystRow's `Record<string, string>` index signature. */
interface KpiDefinitionRow {
  ROWID: string;
  kpi_code: string;
  name: string;
  unit: string;
  classification: string;
  direction: string;
  target: string | null;
  warning_threshold: string | null;
  critical_threshold: string | null;
}

/**
 * @param catalystApp Request-scoped Catalyst app (catalystAppFromHeaders) — passed in rather than
 * resolved internally so a caller computing many KPI tiles at once (the dashboard's ~18 headline
 * tiles) resolves the session and auth context exactly once, not once per tile.
 * @param ctx The caller's auth context — Catalyst has no RLS, so when filters.propertyId is null
 * ("all accessible properties") the calculation functions themselves must scope to
 * ctx.propertyIds (see server/kpi/scope.ts) rather than silently reading every property in the org.
 */
export async function calculateKpi(
  catalystApp: CatalystApp,
  ctx: AuthContext,
  kpiCode: string,
  filters: { propertyId?: string | null; departmentId?: string | null; asOf?: Date },
): Promise<KpiTileResult | null> {
  const datastore = catalystApp.datastore();

  const definitionRows = (await datastore.table("KPIDefinitions").getRows({
    criteria: `KPIDefinitions.kpi_code == '${kpiCode}'`,
    maxRows: 1,
  })) as unknown as KpiDefinitionRow[];
  const definition = definitionRows[0];
  if (!definition) {
    return null;
  }

  const asOf = filters.asOf ?? new Date();
  const { fyLabel, period: currentPeriod } = financialYearFor(asOf);
  const comparisonPeriodFull = previousFinancialYear(currentPeriod);
  const { comparisonEnd, isClipped } = sameperiodYtdComparison(
    currentPeriod,
    comparisonPeriodFull,
    asOf,
  );

  const target = definition.target != null ? Number(definition.target) : null;
  const direction = definition.direction as KpiDirection;

  const calcFn = REGISTRY[kpiCode];
  if (!calcFn) {
    return {
      kpiCode,
      name: definition.name,
      unit: definition.unit,
      classification: definition.classification,
      direction,
      currentValue: null,
      comparisonValue: null,
      varianceAbs: null,
      variancePct: null,
      target,
      ragStatus: "unknown",
      dataThroughDate: asOf,
      dataQualityStatus: "incomplete",
      isYtdClipped: false,
      includedRecordIds: [],
      fyLabel,
      isImplemented: false,
    };
  }

  const result = await calcFn({
    catalystApp,
    ctx,
    propertyId: filters.propertyId ?? null,
    departmentId: filters.departmentId ?? null,
    periodStart: currentPeriod.start,
    periodEnd: asOf < currentPeriod.end ? asOf : currentPeriod.end,
    comparisonPeriodStart: comparisonPeriodFull.start,
    comparisonPeriodEnd: comparisonEnd,
  });

  const warningThreshold =
    definition.warning_threshold != null ? Number(definition.warning_threshold) : null;
  const criticalThreshold =
    definition.critical_threshold != null ? Number(definition.critical_threshold) : null;

  const ragStatus = computeRagStatus({
    value: result.currentValue,
    target,
    warningThreshold,
    criticalThreshold,
    direction,
  });
  const variance = computeVariance(result.currentValue, result.comparisonValue);

  // Snapshot for reconciliation (docs/kpi-catalogue.md §5) — append-only by convention (each
  // calculation inserts a new row rather than updating a previous snapshot), so a historical
  // dashboard figure can always be reconstructed exactly as it was calculated at the time.
  // Deferred via `after()` so the dashboard's response isn't held up waiting on ~18 of these
  // writes in sequence — it still reliably runs (Next.js guarantees `after()` callbacks complete
  // even though the response has already been sent), just off the page-load critical path.
  after(() =>
    datastore.table("KPISnapshots").insertRow({
      kpi_code: kpiCode,
      property_id: filters.propertyId ?? null,
      department_id: filters.departmentId ?? null,
      financial_year: fyLabel,
      current_value: result.currentValue,
      comparison_value: result.comparisonValue,
      target,
      direction,
      unit: definition.unit,
      name: definition.name,
      data_quality_status: result.dataQualityStatus,
      included_record_ids: JSON.stringify(result.includedRecordIds),
      excluded_record_ids: JSON.stringify(result.excludedRecordIds),
      period_start: currentPeriod.start.toISOString().slice(0, 10),
      period_end: currentPeriod.end.toISOString().slice(0, 10),
      comparison_period_start: comparisonPeriodFull.start.toISOString().slice(0, 10),
      comparison_period_end: comparisonEnd.toISOString().slice(0, 10),
      data_through_date: asOf.toISOString().slice(0, 10),
      variance_abs: variance.absolute,
      variance_pct: variance.percent,
      calculated_by: ctx.userId,
      calculated_at: new Date().toISOString(),
    }),
  );

  return {
    kpiCode,
    name: definition.name,
    unit: definition.unit,
    classification: definition.classification,
    direction,
    currentValue: result.currentValue,
    comparisonValue: result.comparisonValue,
    varianceAbs: variance.absolute,
    variancePct: variance.percent,
    target,
    ragStatus,
    dataThroughDate: asOf,
    dataQualityStatus: result.dataQualityStatus,
    isYtdClipped: isClipped,
    includedRecordIds: result.includedRecordIds,
    fyLabel,
    isImplemented: true,
  };
}

export function isKpiImplemented(kpiCode: string): boolean {
  return kpiCode in REGISTRY;
}

export const REGISTERED_KPI_CODES: readonly string[] = Object.keys(REGISTRY);

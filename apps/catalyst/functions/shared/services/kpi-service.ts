/**
 * KPI calculation engine — ports the 22-KPI REGISTRY from the Supabase build's
 * src/server/kpi/calculate.ts + calculations/*.ts verbatim in intent (same 22 codes, same
 * formulas), translated from Drizzle/SQL to a repo interface the Function implements over ZCQL.
 * Every KPI not in REGISTRY returns "not yet calculable" (isImplemented: false, currentValue:
 * null) — never a fabricated zero. A genuinely-zero count (0 incidents this period) is a real,
 * calculated value and IS shown as 0; only an undefined rate (0/0) or an unimplemented KPI
 * returns null.
 */
import { computeRagStatus, computeVariance, type KpiDirection } from "../pure/rag";
import type { KpiTileResult } from "../pure/kpi-types";

export interface KpiPeriodParams {
  propertyId: string | null;
  departmentId: string | null;
  periodStart: string;
  periodEnd: string;
  comparisonPeriodStart: string;
  comparisonPeriodEnd: string;
}

export interface KpiRawResult {
  currentValue: number | null;
  comparisonValue: number | null;
  includedRecordIds: string[];
  dataQualityStatus: "ok" | "unverified" | "incomplete";
}

export interface KpiDefinitionRow {
  kpiCode: string;
  name: string;
  unit: string;
  classification: string;
  direction: KpiDirection;
  target: number | null;
  warningThreshold: number | null;
  criticalThreshold: number | null;
}

export interface KpiRepo {
  getKpiDefinition(kpiCode: string): Promise<KpiDefinitionRow | undefined>;

  /** personType: null means "no person_type filter" (TOTAL_INCIDENTS). */
  countIncidentsByPersonType(params: KpiPeriodParams, personType: string | null): Promise<KpiRawResult>;
  countIncidentsByOutcome(params: KpiPeriodParams, outcomes: string[]): Promise<KpiRawResult>;
  countIncidentsByFlag(params: KpiPeriodParams, column: "is_high_potential" | "hospital_referral"): Promise<KpiRawResult>;
  countLtiIncidents(params: KpiPeriodParams): Promise<KpiRawResult>;
  /** Joins Incidents -> IncidentOSHReportability (kept as a separate table since Phase 5 — see
   * incident-workflow.ts). */
  countReportableOshCases(params: KpiPeriodParams): Promise<KpiRawResult>;
  sumIncidentField(params: KpiPeriodParams, field: "lost_workdays" | "restricted_duty_days" | "incident_cost"): Promise<KpiRawResult>;

  /** Point-in-time, not period-bounded — comparisonValue is always null, matching
   * countOpenCriticalMajorFindings() in the original build. */
  countOpenCriticalMajorFindings(params: KpiPeriodParams): Promise<KpiRawResult>;

  /** outcome='verified' rows in period, checked against the CAPA's due_date — "on time" means the
   * verification (the closest thing our workflow has to a closing event) landed on or before the
   * due date. */
  capaOnTimeRate(params: KpiPeriodParams): Promise<KpiRawResult>;
  /** Proportion of verification DECISIONS in period whose outcome was 'verified' rather than
   * 'rejected' — our workflow's outcome enum is verified|rejected (no separate 'effective'
   * grade), so this is honestly the rate at which corrective actions passed verification, not a
   * separately-graded effectiveness score the data doesn't carry. */
  capaEffectivenessRate(params: KpiPeriodParams): Promise<KpiRawResult>;

  /** Reads the latest FrameworkReadinessSnapshots row (Phase 8) — never recomputes live, same
   * "read snapshots" discipline as the dashboard endpoint. */
  getFrameworkReadinessSnapshot(
    frameworkCode: "ISO45001" | "MU_LEGAL",
    propertyId: string | null,
  ): Promise<{ rollupScore: number | null; isCapped: boolean; controlIds: string[] } | undefined>;

  insertSnapshot(row: {
    kpiCode: string;
    propertyId: string | null;
    departmentId: string | null;
    currentValue: number | null;
    comparisonValue: number | null;
    dataQualityStatus: string;
    includedRecordIds: string[];
  }): Promise<void>;
}

type CalcFn = (repo: KpiRepo, params: KpiPeriodParams) => Promise<KpiRawResult>;

/** The 22 live-calculated KPIs — exactly the set wired in the Supabase build's REGISTRY. Every
 * other code in KPIDefinitions is a defined-but-not-yet-implemented KPI (calculator_function is
 * null in the schema) and always returns "not yet calculable". */
const REGISTRY: Record<string, CalcFn> = {
  TOTAL_INCIDENTS: (r, p) => r.countIncidentsByPersonType(p, null),
  EMPLOYEE_INCIDENTS: (r, p) => r.countIncidentsByPersonType(p, "employee"),
  CONTRACTOR_INCIDENTS: (r, p) => r.countIncidentsByPersonType(p, "contractor"),
  GUEST_INCIDENTS: (r, p) => r.countIncidentsByPersonType(p, "guest"),
  NEAR_MISSES: (r, p) => r.countIncidentsByPersonType(p, "near_miss"),
  UNSAFE_CONDITIONS: (r, p) => r.countIncidentsByPersonType(p, "unsafe_condition"),
  TRAINEE_INCIDENTS: (r, p) => r.countIncidentsByPersonType(p, "trainee"),
  HIGH_POTENTIAL: (r, p) => r.countIncidentsByFlag(p, "is_high_potential"),
  HOSPITAL_REFERRALS: (r, p) => r.countIncidentsByFlag(p, "hospital_referral"),
  REPORTABLE_OSH_CASES: (r, p) => r.countReportableOshCases(p),
  FATALITIES: (r, p) => r.countIncidentsByOutcome(p, ["fatality"]),
  LTI: (r, p) => r.countLtiIncidents(p),
  MTC: (r, p) => r.countIncidentsByOutcome(p, ["medical_treatment"]),
  RECORDABLE_INJURIES: (r, p) =>
    r.countIncidentsByOutcome(p, ["medical_treatment", "lost_time_injury", "hospitalisation", "fatality"]),
  LOST_WORKDAYS: (r, p) => r.sumIncidentField(p, "lost_workdays"),
  RESTRICTED_DUTY_DAYS: (r, p) => r.sumIncidentField(p, "restricted_duty_days"),
  INCIDENT_COST: (r, p) => r.sumIncidentField(p, "incident_cost"),
  CAPA_ON_TIME: (r, p) => r.capaOnTimeRate(p),
  CAPA_EFFECTIVENESS: (r, p) => r.capaEffectivenessRate(p),
  OPEN_CRIT_MAJOR_FINDINGS: (r, p) => r.countOpenCriticalMajorFindings(p),
  ISO45001_READINESS: async (r, p) => frameworkReadinessAsKpi(r, "ISO45001", p),
  LEGAL_COMPLIANCE: async (r, p) => frameworkReadinessAsKpi(r, "MU_LEGAL", p),
};

async function frameworkReadinessAsKpi(
  repo: KpiRepo,
  frameworkCode: "ISO45001" | "MU_LEGAL",
  params: KpiPeriodParams,
): Promise<KpiRawResult> {
  const snapshot = await repo.getFrameworkReadinessSnapshot(frameworkCode, params.propertyId);
  if (!snapshot) {
    return { currentValue: null, comparisonValue: null, includedRecordIds: [], dataQualityStatus: "incomplete" };
  }
  return {
    currentValue: snapshot.rollupScore != null ? snapshot.rollupScore * 25 : null,
    comparisonValue: null,
    includedRecordIds: snapshot.controlIds,
    dataQualityStatus: snapshot.isCapped ? "unverified" : "ok",
  };
}

export const REGISTERED_KPI_CODES: readonly string[] = Object.keys(REGISTRY);

export function isKpiImplemented(kpiCode: string): boolean {
  return kpiCode in REGISTRY;
}

/** Test cases: "KPI with missing data shows 'not yet calculable'" and "Fatalities must always be
 * prominent" (currentValue is a real, calculated number — never suppressed or zeroed out — so the
 * caller can always render it, including as a Board Mode headline figure). */
export async function calculateKpi(
  repo: KpiRepo,
  kpiCode: string,
  params: KpiPeriodParams,
): Promise<KpiTileResult | null> {
  const definition = await repo.getKpiDefinition(kpiCode);
  if (!definition) return null;

  const calc = REGISTRY[kpiCode];
  if (!calc) {
    return notYetCalculableTile(definition, params);
  }

  const raw = await calc(repo, params);
  const variance = computeVariance(raw.currentValue, raw.comparisonValue);
  const ragStatus = computeRagStatus({
    value: raw.currentValue,
    target: definition.target,
    warningThreshold: definition.warningThreshold,
    criticalThreshold: definition.criticalThreshold,
    direction: definition.direction,
  });

  await repo.insertSnapshot({
    kpiCode,
    propertyId: params.propertyId,
    departmentId: params.departmentId,
    currentValue: raw.currentValue,
    comparisonValue: raw.comparisonValue,
    dataQualityStatus: raw.dataQualityStatus,
    includedRecordIds: raw.includedRecordIds,
  });

  return {
    kpiCode,
    name: definition.name,
    unit: definition.unit,
    classification: definition.classification,
    direction: definition.direction,
    currentValue: raw.currentValue,
    comparisonValue: raw.comparisonValue,
    varianceAbs: variance.absolute,
    variancePct: variance.percent,
    target: definition.target,
    ragStatus: raw.currentValue == null ? "unknown" : ragStatus,
    dataThroughDate: new Date(params.periodEnd),
    dataQualityStatus: raw.dataQualityStatus,
    isYtdClipped: false,
    includedRecordIds: raw.includedRecordIds,
    fyLabel: fyLabelFromPeriodEnd(params.periodEnd),
    isImplemented: true,
  };
}

function notYetCalculableTile(definition: KpiDefinitionRow, params: KpiPeriodParams): KpiTileResult {
  return {
    kpiCode: definition.kpiCode,
    name: definition.name,
    unit: definition.unit,
    classification: definition.classification,
    direction: definition.direction,
    currentValue: null,
    comparisonValue: null,
    varianceAbs: null,
    variancePct: null,
    target: definition.target,
    ragStatus: "unknown",
    dataThroughDate: new Date(params.periodEnd),
    dataQualityStatus: "incomplete",
    isYtdClipped: false,
    includedRecordIds: [],
    fyLabel: fyLabelFromPeriodEnd(params.periodEnd),
    isImplemented: false,
  };
}

function fyLabelFromPeriodEnd(periodEnd: string): string {
  const year = new Date(periodEnd).getUTCFullYear();
  return `FY${year}`;
}

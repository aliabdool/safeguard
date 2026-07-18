import "server-only";

import { eq } from "drizzle-orm";

import { getDb } from "@/db";
import { incidents, kpiCalculations, kpiDefinitions } from "@/db/schema";

import { capaClosedOnTimeRate } from "./calculations/capa";
import { countOpenCriticalMajorFindings } from "./calculations/findings";
import { frameworkReadinessKpi } from "./calculations/framework";
import { countIncidentsInPeriod, sumIncidentCostInPeriod } from "./calculations/incidents";
import { financialYearFor, previousFinancialYear, sameperiodYtdComparison } from "./period";
import { computeRagStatus, computeVariance, type KpiDirection, type RagStatus } from "./rag";
import type { KpiCalculationParams, KpiCalculationResult } from "./types";

type CalculationFn = (params: KpiCalculationParams) => Promise<KpiCalculationResult>;

/**
 * Registry mapping KPI code -> calculation function. Every entry here has a matching row in
 * `kpi_definitions` (seeded by src/db/seed.ts from docs/kpi-catalogue.md §2) — the registry is
 * intentionally a subset of the full 38-KPI catalogue for v1: these are the representative,
 * fully-wired examples across lagging/leading/assurance classifications and count/sum/rollup
 * calculation shapes. Extending to the remaining KPIs means adding a function here in the same
 * shape, not changing the engine.
 */
const REGISTRY: Record<string, CalculationFn> = {
  TOTAL_INCIDENTS: (p) => countIncidentsInPeriod(p),
  EMPLOYEE_INCIDENTS: (p) => countIncidentsInPeriod(p, eq(incidents.personType, "employee")),
  CONTRACTOR_INCIDENTS: (p) =>
    countIncidentsInPeriod(p, eq(incidents.personType, "contractor")),
  GUEST_INCIDENTS: (p) => countIncidentsInPeriod(p, eq(incidents.personType, "guest")),
  NEAR_MISSES: (p) => countIncidentsInPeriod(p, eq(incidents.personType, "near_miss")),
  UNSAFE_CONDITIONS: (p) =>
    countIncidentsInPeriod(p, eq(incidents.personType, "unsafe_condition")),
  HIGH_POTENTIAL: (p) => countIncidentsInPeriod(p, eq(incidents.isHighPotential, true)),
  HOSPITAL_REFERRALS: (p) => countIncidentsInPeriod(p, eq(incidents.hospitalReferral, true)),
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

export async function calculateKpi(
  kpiCode: string,
  filters: { propertyId?: string | null; departmentId?: string | null; asOf?: Date },
): Promise<KpiTileResult | null> {
  const db = getDb();
  const [definition] = await db
    .select()
    .from(kpiDefinitions)
    .where(eq(kpiDefinitions.kpiCode, kpiCode))
    .limit(1);
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

  const calcFn = REGISTRY[kpiCode];
  if (!calcFn) {
    return {
      kpiCode,
      name: definition.name,
      unit: definition.unit,
      classification: definition.classification,
      direction: definition.direction as KpiDirection,
      currentValue: null,
      comparisonValue: null,
      varianceAbs: null,
      variancePct: null,
      target: definition.target != null ? Number(definition.target) : null,
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
    propertyId: filters.propertyId ?? null,
    departmentId: filters.departmentId ?? null,
    periodStart: currentPeriod.start,
    periodEnd: asOf < currentPeriod.end ? asOf : currentPeriod.end,
    comparisonPeriodStart: comparisonPeriodFull.start,
    comparisonPeriodEnd: comparisonEnd,
  });

  const target = definition.target != null ? Number(definition.target) : null;
  const warningThreshold =
    definition.warningThreshold != null ? Number(definition.warningThreshold) : null;
  const criticalThreshold =
    definition.criticalThreshold != null ? Number(definition.criticalThreshold) : null;
  const direction = definition.direction as KpiDirection;

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
  await db.insert(kpiCalculations).values({
    kpiId: definition.id,
    propertyId: filters.propertyId ?? null,
    departmentId: filters.departmentId ?? null,
    periodStart: currentPeriod.start.toISOString().slice(0, 10),
    periodEnd: currentPeriod.end.toISOString().slice(0, 10),
    comparisonPeriodStart: comparisonPeriodFull.start.toISOString().slice(0, 10),
    comparisonPeriodEnd: comparisonEnd.toISOString().slice(0, 10),
    currentValue: result.currentValue != null ? String(result.currentValue) : null,
    comparisonValue: result.comparisonValue != null ? String(result.comparisonValue) : null,
    varianceAbs: variance.absolute != null ? String(variance.absolute) : null,
    variancePct: variance.percent != null ? String(variance.percent) : null,
    dataThroughDate: asOf.toISOString().slice(0, 10),
    dataQualityStatus: result.dataQualityStatus,
    includedRecordIds: result.includedRecordIds,
    excludedRecordIds: result.excludedRecordIds,
  });

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

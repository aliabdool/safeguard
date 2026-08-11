import "server-only";

import type { CatalystApp } from "@/lib/catalyst/app";
import { mapWithConcurrency } from "@/lib/concurrency";
import { calculateKpi, type KpiTileResult } from "@/server/kpi/calculate";
import { countIncidentsInPeriod } from "@/server/kpi/calculations/incidents";
import { financialYearFor, previousFinancialYear, sameperiodYtdComparison } from "@/server/kpi/period";
import type { AuthContext } from "@/server/permissions";

const SAFETY_KPI_CODES = [
  "FATALITIES",
  "LTI",
  "LTIFR",
  "SEVERITY_RATE",
  "RECORDABLE_INJURIES",
  "TRIR",
  "HIGH_POTENTIAL",
  "NEAR_MISSES",
  "UNSAFE_CONDITIONS",
  "LOST_WORKDAYS",
  "RESTRICTED_DUTY_DAYS",
  "INCIDENT_COST",
  "GUEST_INC_PER_1000_RN",
] as const;

export interface SafetyPerformanceTile {
  kpiCode: string;
  result: KpiTileResult | null;
}

export interface SafetyPerformanceData {
  tiles: SafetyPerformanceTile[];
  climateEventsCurrent: number;
  climateEventsComparison: number;
}

/**
 * Full safety-performance tile set (see chat, CEO dashboard §10) — every tile is a real
 * calculateKpi() call; a null result (no matching KPIDefinitions row, e.g. the newly-added rate
 * KPIs if the catalogue hasn't been seeded with them yet) renders as "Not assessed" by the caller,
 * never a fabricated value. Climate/weather-related events has no KPIDefinitions row or REGISTRY
 * entry at all (it's a specific incident_type value, not a named KPI) — computed directly via the
 * same countIncidentsInPeriod() helper the KPI engine itself uses, so it stays consistent with
 * every other incident count on this dashboard without needing a new catalogue row.
 */
export async function computeSafetyPerformance(
  catalystApp: CatalystApp,
  ctx: AuthContext,
  propertyId: string | null,
  asOf: Date,
): Promise<SafetyPerformanceData> {
  // mapWithConcurrency, not a raw Promise.all — Catalyst enforces a per-project concurrency limit
  // (see lib/concurrency.ts's own doc comment: the original 18-tile dashboard tripped a 429
  // "Concurrency limit reached for the feature COMPONENT" the same way; confirmed live again here
  // — see chat).
  const tiles = await mapWithConcurrency([...SAFETY_KPI_CODES], 3, async (kpiCode) => ({
    kpiCode,
    result: await calculateKpi(catalystApp, ctx, kpiCode, { propertyId, asOf }),
  }));

  const { period: currentPeriod } = financialYearFor(asOf);
  const comparisonPeriodFull = previousFinancialYear(currentPeriod);
  const { comparisonEnd } = sameperiodYtdComparison(currentPeriod, comparisonPeriodFull, asOf);

  const climateParams = {
    catalystApp,
    ctx,
    propertyId,
    periodStart: currentPeriod.start,
    periodEnd: asOf < currentPeriod.end ? asOf : currentPeriod.end,
    comparisonPeriodStart: comparisonPeriodFull.start,
    comparisonPeriodEnd: comparisonEnd,
  };
  const climateResult = await countIncidentsInPeriod(
    climateParams,
    "Incidents.incident_type = 'climate_extreme_weather'",
  );

  return {
    tiles,
    climateEventsCurrent: climateResult.currentValue ?? 0,
    climateEventsComparison: climateResult.comparisonValue ?? 0,
  };
}

import "server-only";

import { toZcqlDateTime } from "@/lib/catalyst/zcql-datetime";

import { propertyScopeClause } from "../scope";
import type { KpiCalculationParams, KpiCalculationResult } from "../types";

/**
 * Denominator-based rate KPIs (LTIFR, TRIR, Severity Rate, guest-incidents-per-1000-room-nights) —
 * catalogued since the KPI engine's first version but never implemented (see chat: ExposureData is
 * a provisioned, versioned "hours worked / occupied room nights" table with zero readers/writers
 * anywhere in the app until now). Group scope MUST sum the numerator and denominator independently
 * across every in-scope property and divide once — never average each property's own rate — per
 * the brief's explicit correction: Group LTIFR = SUM(Group LTIs) / SUM(Group hours worked) ×
 * 1,000,000, not average(LP LTIFR, SB LTIFR, ...). Both count* helpers below do exactly that by
 * construction: one scoped numerator query, one scoped denominator query, divide once.
 *
 * When the denominator is zero/missing for the requested scope+period, currentValue is null and
 * dataQualityStatus is "incomplete" — the caller must render "Cannot calculate — denominator
 * unavailable", never silently show 0 (see chat: "Sunlife Hotel Management should not receive
 * fictitious occupied-room-night denominator values").
 */

interface ExposureRow {
  total_hours_worked: string | null;
  occupied_room_nights: string | null;
}

function exposureScopeClause(params: KpiCalculationParams): string {
  return params.propertyId
    ? `ExposureData.property_id = '${params.propertyId}'`
    : propertyScopeClause("ExposureData.property_id", params.ctx);
}

/** Sums an ExposureData denominator column for every row overlapping [start, end] in scope. */
async function sumExposureDenominator(
  params: KpiCalculationParams,
  field: "total_hours_worked" | "occupied_room_nights",
  start: Date,
  end: Date,
): Promise<number | null> {
  const rows = (await params.catalystApp.datastore().table("ExposureData").getRows({
    criteria: `${exposureScopeClause(params)} and ExposureData.period_start <= '${toZcqlDateTime(end).slice(0, 10)}' and ExposureData.period_end >= '${toZcqlDateTime(start).slice(0, 10)}'`,
  })) as unknown as ExposureRow[];
  if (rows.length === 0) return null;
  const sum = rows.reduce((total, r) => total + Number(r[field] ?? 0), 0);
  return sum > 0 ? sum : null;
}

async function computeRate(
  params: KpiCalculationParams,
  numeratorClause: string,
  denominatorField: "total_hours_worked" | "occupied_room_nights",
  multiplier: number,
  sumField: "lost_workdays" | null = null,
): Promise<KpiCalculationResult> {
  const datastore = params.catalystApp.datastore();
  const propClause = params.propertyId
    ? `Incidents.property_id = '${params.propertyId}'`
    : propertyScopeClause("Incidents.property_id", params.ctx);

  async function numeratorFor(start: Date, end: Date) {
    const rows = (await datastore.table("Incidents").getRows({
      criteria: `${propClause} and ${numeratorClause} and Incidents.occurred_at >= '${toZcqlDateTime(start)}' and Incidents.occurred_at <= '${toZcqlDateTime(end)}'`,
    })) as unknown as Array<{ ROWID: string; lost_workdays?: string }>;
    const value = sumField
      ? rows.reduce((sum, r) => sum + Number(r[sumField] ?? 0), 0)
      : rows.length;
    return { value, ids: rows.map((r) => r.ROWID) };
  }

  const [currentNumerator, currentDenominator] = await Promise.all([
    numeratorFor(params.periodStart, params.periodEnd),
    sumExposureDenominator(params, denominatorField, params.periodStart, params.periodEnd),
  ]);
  const [comparisonNumerator, comparisonDenominator] = await Promise.all([
    numeratorFor(params.comparisonPeriodStart, params.comparisonPeriodEnd),
    sumExposureDenominator(
      params,
      denominatorField,
      params.comparisonPeriodStart,
      params.comparisonPeriodEnd,
    ),
  ]);

  return {
    currentValue:
      currentDenominator != null ? (currentNumerator.value * multiplier) / currentDenominator : null,
    comparisonValue:
      comparisonDenominator != null
        ? (comparisonNumerator.value * multiplier) / comparisonDenominator
        : null,
    includedRecordIds: currentNumerator.ids,
    excludedRecordIds: [],
    dataQualityStatus: currentDenominator == null ? "incomplete" : "ok",
  };
}

/** Lost-Time Injury Frequency Rate: LTI count × 1,000,000 / hours worked. */
export async function ltifr(params: KpiCalculationParams): Promise<KpiCalculationResult> {
  return computeRate(params, "Incidents.lost_workdays > 0", "total_hours_worked", 1_000_000);
}

/** Total Recordable Incident Rate: recordable-outcome count × 1,000,000 / hours worked. */
export async function trir(params: KpiCalculationParams): Promise<KpiCalculationResult> {
  return computeRate(
    params,
    "Incidents.outcome in ('medical_treatment','lost_time_injury','hospitalisation','fatality')",
    "total_hours_worked",
    1_000_000,
  );
}

/** Severity rate: sum(lost_workdays) × 1,000,000 / hours worked. */
export async function severityRate(params: KpiCalculationParams): Promise<KpiCalculationResult> {
  return computeRate(
    params,
    "Incidents.lost_workdays > 0",
    "total_hours_worked",
    1_000_000,
    "lost_workdays",
  );
}

/** Guest incidents per 1,000 occupied room nights. */
export async function guestIncidentsPerThousandRoomNights(
  params: KpiCalculationParams,
): Promise<KpiCalculationResult> {
  return computeRate(params, "Incidents.person_event_type = 'guest'", "occupied_room_nights", 1_000);
}

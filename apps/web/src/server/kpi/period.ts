/**
 * Pure financial-year / year-to-date period logic — no DB, no server-only. See
 * docs/kpi-catalogue.md §4 and ADR-0004 (docs/implementation-plan.md): default FY is
 * 1 July - 30 June, confirmed as an assumption pending product-owner sign-off.
 */

export interface Period {
  start: Date;
  end: Date;
}

const FY_START_MONTH = 6; // 0-indexed: June => FY starts 1 July

/** The financial year containing `asOf`, e.g. asOf=2026-07-18 -> FY2027 (1 Jul 2026 - 30 Jun 2027). */
export function financialYearFor(asOf: Date): { fyLabel: string; period: Period } {
  const year = asOf.getUTCFullYear();
  const month = asOf.getUTCMonth();
  const fyStartYear = month >= FY_START_MONTH ? year : year - 1;
  const start = new Date(Date.UTC(fyStartYear, FY_START_MONTH, 1));
  const end = new Date(Date.UTC(fyStartYear + 1, FY_START_MONTH, 1));
  return { fyLabel: `FY${fyStartYear + 1}`, period: { start, end } };
}

export function isPeriodComplete(period: Period, asOf: Date): boolean {
  return asOf >= period.end;
}

/**
 * For an incomplete current-year period, clips the comparison period to the same
 * day-of-year span so the two are fairly comparable (docs/kpi-catalogue.md §4) — never compares
 * a partial year against a full prior year silently.
 */
export function sameperiodYtdComparison(
  currentPeriod: Period,
  comparisonPeriod: Period,
  asOf: Date,
): { comparisonEnd: Date; isClipped: boolean } {
  const complete = isPeriodComplete(currentPeriod, asOf);
  if (complete) {
    return { comparisonEnd: comparisonPeriod.end, isClipped: false };
  }

  const elapsedMs = asOf.getTime() - currentPeriod.start.getTime();
  const clippedEnd = new Date(comparisonPeriod.start.getTime() + elapsedMs);
  const clampedEnd = clippedEnd > comparisonPeriod.end ? comparisonPeriod.end : clippedEnd;
  return { comparisonEnd: clampedEnd, isClipped: true };
}

export function previousFinancialYear(period: Period): Period {
  const start = new Date(
    Date.UTC(period.start.getUTCFullYear() - 1, period.start.getUTCMonth(), 1),
  );
  const end = new Date(Date.UTC(period.end.getUTCFullYear() - 1, period.end.getUTCMonth(), 1));
  return { start, end };
}

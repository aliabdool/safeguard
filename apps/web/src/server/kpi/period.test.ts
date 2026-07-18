import { describe, expect, it } from "vitest";

import {
  financialYearFor,
  isPeriodComplete,
  previousFinancialYear,
  sameperiodYtdComparison,
} from "./period";

describe("financialYearFor", () => {
  it("a date in July counts toward the FY that starts that July", () => {
    const { fyLabel, period } = financialYearFor(new Date(Date.UTC(2026, 6, 18)));
    expect(fyLabel).toBe("FY2027");
    expect(period.start.toISOString()).toBe(new Date(Date.UTC(2026, 6, 1)).toISOString());
    expect(period.end.toISOString()).toBe(new Date(Date.UTC(2027, 6, 1)).toISOString());
  });

  it("a date in June counts toward the FY that ends that June", () => {
    const { fyLabel, period } = financialYearFor(new Date(Date.UTC(2026, 5, 15)));
    expect(fyLabel).toBe("FY2026");
    expect(period.start.toISOString()).toBe(new Date(Date.UTC(2025, 6, 1)).toISOString());
  });
});

describe("isPeriodComplete", () => {
  it("is false while asOf falls inside the period", () => {
    const { period } = financialYearFor(new Date(Date.UTC(2026, 6, 18)));
    expect(isPeriodComplete(period, new Date(Date.UTC(2026, 6, 18)))).toBe(false);
  });
  it("is true once asOf reaches the period end", () => {
    const { period } = financialYearFor(new Date(Date.UTC(2026, 6, 18)));
    expect(isPeriodComplete(period, period.end)).toBe(true);
  });
});

describe("sameperiodYtdComparison", () => {
  it("clips the comparison period to the same elapsed span when the current year is incomplete", () => {
    // Current FY2027 started 1 Jul 2026; "today" is 18 Jul 2026 -> 17 days elapsed.
    const current = financialYearFor(new Date(Date.UTC(2026, 6, 18))).period;
    const comparison = previousFinancialYear(current); // FY2026: 1 Jul 2025 - 30 Jun 2026
    const { comparisonEnd, isClipped } = sameperiodYtdComparison(
      current,
      comparison,
      new Date(Date.UTC(2026, 6, 18)),
    );
    expect(isClipped).toBe(true);
    // Same elapsed span from the comparison period's start.
    expect(comparisonEnd.toISOString()).toBe(new Date(Date.UTC(2025, 6, 18)).toISOString());
  });

  it("does NOT clip when the current period is already complete — full year vs full year", () => {
    const current = financialYearFor(new Date(Date.UTC(2026, 6, 18))).period;
    const comparison = previousFinancialYear(current);
    const { comparisonEnd, isClipped } = sameperiodYtdComparison(
      current,
      comparison,
      current.end,
    );
    expect(isClipped).toBe(false);
    expect(comparisonEnd.toISOString()).toBe(comparison.end.toISOString());
  });
});

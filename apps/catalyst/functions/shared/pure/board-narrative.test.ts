import { describe, expect, it } from "vitest";

import { generateBoardNarrative } from "./board-narrative";
import type { KpiTileResult } from "./kpi-types";

function kpi(overrides: Partial<KpiTileResult> & { kpiCode: string }): KpiTileResult {
  return {
    name: overrides.kpiCode,
    unit: "count",
    classification: "lagging",
    direction: "lower_better",
    currentValue: 0,
    comparisonValue: 0,
    varianceAbs: 0,
    variancePct: 0,
    target: null,
    ragStatus: "unknown",
    dataThroughDate: new Date("2026-07-01"),
    dataQualityStatus: "ok",
    isYtdClipped: false,
    includedRecordIds: [],
    fyLabel: "FY2026",
    isImplemented: true,
    ...overrides,
  };
}

describe("generateBoardNarrative", () => {
  it("never invents a number for a KPI that isn't present", () => {
    const narrative = generateBoardNarrative({
      fyLabel: "FY2026",
      propertyLabel: "All accessible properties",
      generatedAt: new Date("2026-07-20"),
      kpis: [],
      dataQuality: [],
    });
    expect(narrative).toContain("FY2026");
    expect(narrative).not.toMatch(/\d+ incidents were recorded/);
  });

  it("flags fatalities prominently instead of folding them into a summary count", () => {
    const narrative = generateBoardNarrative({
      fyLabel: "FY2026",
      propertyLabel: "Sunlife Beach Resort & Spa",
      generatedAt: new Date("2026-07-20"),
      kpis: [
        kpi({
          kpiCode: "FATALITIES",
          name: "Fatalities",
          currentValue: 1,
          comparisonValue: 0,
        }),
      ],
      dataQuality: [],
    });
    expect(narrative).toContain("requires immediate board attention");
  });

  it("says 'no fatalities' when the figure is a real zero, not a fabricated one", () => {
    const narrative = generateBoardNarrative({
      fyLabel: "FY2026",
      propertyLabel: "All accessible properties",
      generatedAt: new Date("2026-07-20"),
      kpis: [
        kpi({
          kpiCode: "FATALITIES",
          name: "Fatalities",
          currentValue: 0,
          comparisonValue: 0,
        }),
      ],
      dataQuality: [],
    });
    expect(narrative).toContain("No fatalities were recorded");
  });

  it("reports a null current value as not yet calculable rather than 0", () => {
    const narrative = generateBoardNarrative({
      fyLabel: "FY2026",
      propertyLabel: "All accessible properties",
      generatedAt: new Date("2026-07-20"),
      kpis: [
        kpi({
          kpiCode: "TOTAL_INCIDENTS",
          name: "Total incidents",
          currentValue: null,
          comparisonValue: null,
        }),
      ],
      dataQuality: [],
    });
    expect(narrative).toContain("not yet calculable for this period");
  });

  it("lists only data-quality rows with a nonzero count as caveats", () => {
    const narrative = generateBoardNarrative({
      fyLabel: "FY2026",
      propertyLabel: "All accessible properties",
      generatedAt: new Date("2026-07-20"),
      kpis: [],
      dataQuality: [
        { label: "Missing root cause", count: 0 },
        { label: "Corrective actions overdue", count: 3 },
      ],
    });
    expect(narrative).not.toContain("Missing root cause: 0");
    expect(narrative).toContain("Corrective actions overdue: 3");
  });

  it("describes a lower_better KPI moving down as an improvement", () => {
    const narrative = generateBoardNarrative({
      fyLabel: "FY2026",
      propertyLabel: "All accessible properties",
      generatedAt: new Date("2026-07-20"),
      kpis: [
        kpi({
          kpiCode: "TOTAL_INCIDENTS",
          name: "Total incidents",
          currentValue: 8,
          comparisonValue: 10,
          variancePct: -20,
          direction: "lower_better",
        }),
      ],
      dataQuality: [],
    });
    expect(narrative).toContain("down 20% year-on-year (an improvement)");
  });
});

import { describe, expect, it } from "vitest";

import {
  type IncidentAnalyticsRecord,
  computeCategoricalBreakdowns,
  computeDayOfWeekBreakdown,
  computeDepartmentAnalysis,
  computeDepartmentFyHeatmap,
  computeFyHistory,
  computeMonthlyTrend,
  countByCategory,
  dayOfWeekLabel,
} from "./analytics-pure";

function record(overrides: Partial<IncidentAnalyticsRecord>): IncidentAnalyticsRecord {
  return {
    id: "r1",
    occurredAt: new Date(Date.UTC(2026, 6, 15)), // 15 Jul 2026 (a Wednesday)
    incidentType: "injury",
    outcome: "first_aid",
    personEventType: "employee",
    bodyPart: "hand",
    departmentId: "dept-housekeeping",
    lostWorkdays: 0,
    isMajor: false,
    isHospitalReferral: false,
    isOshReportable: false,
    ...overrides,
  };
}

describe("dayOfWeekLabel", () => {
  it("returns the correct weekday name for a UTC date", () => {
    // 15 Jul 2026 is a Wednesday.
    expect(dayOfWeekLabel(new Date(Date.UTC(2026, 6, 15)))).toBe("Wednesday");
    // 12 Jul 2026 is a Sunday.
    expect(dayOfWeekLabel(new Date(Date.UTC(2026, 6, 12)))).toBe("Sunday");
  });
});

describe("countByCategory", () => {
  it("counts and sorts by count desc, then label asc for ties", () => {
    const result = countByCategory(["a", "b", "a", "c", "b", "a"]);
    expect(result).toEqual([
      { value: "a", label: "a", count: 3, pct: 50 },
      { value: "b", label: "b", count: 2, pct: expect.closeTo(33.33, 1) },
      { value: "c", label: "c", count: 1, pct: expect.closeTo(16.67, 1) },
    ]);
  });

  it("buckets null/undefined/empty as 'Not recorded' rather than dropping them", () => {
    const result = countByCategory(["hand", null, "", undefined, "hand"]);
    const notRecorded = result.find((r) => r.value === "__not_recorded__");
    expect(notRecorded).toEqual({
      value: "__not_recorded__",
      label: "Not recorded",
      count: 3,
      pct: 60,
    });
  });

  it("returns pct: null for every entry when there are zero values", () => {
    expect(countByCategory([])).toEqual([]);
  });

  it("applies a label function when supplied", () => {
    const result = countByCategory(["injury"], (v) => v.toUpperCase());
    expect(result[0]!.label).toBe("INJURY");
  });
});

describe("computeDayOfWeekBreakdown", () => {
  it("always returns exactly 7 entries in Monday-Sunday order", () => {
    const result = computeDayOfWeekBreakdown([]);
    expect(result.map((r) => r.value)).toEqual([
      "Monday",
      "Tuesday",
      "Wednesday",
      "Thursday",
      "Friday",
      "Saturday",
      "Sunday",
    ]);
    expect(result.every((r) => r.count === 0 && r.pct === null)).toBe(true);
  });

  it("counts records against the correct weekday", () => {
    const records = [
      record({ occurredAt: new Date(Date.UTC(2026, 6, 15)) }), // Wed
      record({ occurredAt: new Date(Date.UTC(2026, 6, 15)) }), // Wed
      record({ occurredAt: new Date(Date.UTC(2026, 6, 12)) }), // Sun
    ];
    const result = computeDayOfWeekBreakdown(records);
    expect(result.find((r) => r.value === "Wednesday")?.count).toBe(2);
    expect(result.find((r) => r.value === "Sunday")?.count).toBe(1);
    expect(result.find((r) => r.value === "Monday")?.count).toBe(0);
  });
});

describe("computeCategoricalBreakdowns", () => {
  it("returns all five breakdown dimensions", () => {
    const records = [record({}), record({ incidentType: "near_miss", outcome: "no_injury" })];
    const result = computeCategoricalBreakdowns(records);
    expect(result.byIncidentType.reduce((s, r) => s + r.count, 0)).toBe(2);
    expect(result.byOutcome.reduce((s, r) => s + r.count, 0)).toBe(2);
    expect(result.byPersonType.reduce((s, r) => s + r.count, 0)).toBe(2);
    expect(result.byBodyPart.reduce((s, r) => s + r.count, 0)).toBe(2);
    expect(result.byDayOfWeek.reduce((s, r) => s + r.count, 0)).toBe(2);
  });
});

describe("computeMonthlyTrend", () => {
  const currentFyStart = new Date(Date.UTC(2026, 6, 1)); // 1 Jul 2026 -> FY2027
  const comparisonFyStart = new Date(Date.UTC(2025, 6, 1)); // 1 Jul 2025 -> FY2026

  it("returns 12 months starting from the FY start month", () => {
    const result = computeMonthlyTrend(currentFyStart, comparisonFyStart, [], []);
    expect(result).toHaveLength(12);
    expect(result[0]!.monthLabel).toBe("Jul");
    expect(result[11]!.monthLabel).toBe("Jun");
  });

  it("buckets current and comparison records into the same month-of-FY index", () => {
    const current = [record({ occurredAt: new Date(Date.UTC(2026, 7, 5)) })]; // Aug 2026 -> index 1
    const comparison = [
      record({ occurredAt: new Date(Date.UTC(2025, 7, 20)) }), // Aug 2025 -> index 1
      record({ occurredAt: new Date(Date.UTC(2025, 7, 22)) }),
    ];
    const result = computeMonthlyTrend(currentFyStart, comparisonFyStart, current, comparison);
    expect(result[1]!.monthLabel).toBe("Aug");
    expect(result[1]!.current).toBe(1);
    expect(result[1]!.comparison).toBe(2);
    expect(result[0]!.current).toBe(0);
  });

  it("ignores records that fall outside the 12-month window", () => {
    const current = [record({ occurredAt: new Date(Date.UTC(2027, 8, 1)) })]; // well past the FY
    const result = computeMonthlyTrend(currentFyStart, comparisonFyStart, current, []);
    expect(result.reduce((s, p) => s + p.current, 0)).toBe(0);
  });
});

describe("computeFyHistory", () => {
  it("aggregates each bucket independently, preserving input order", () => {
    const result = computeFyHistory([
      { fyLabel: "FY2025", records: [record({ isMajor: true, lostWorkdays: 5 }), record({})] },
      { fyLabel: "FY2026", records: [record({})] },
    ]);
    expect(result).toEqual([
      { fyLabel: "FY2025", totalIncidents: 2, majorIncidents: 1, lostDays: 5 },
      { fyLabel: "FY2026", totalIncidents: 1, majorIncidents: 0, lostDays: 0 },
    ]);
  });

  it("returns zeroed rows for an empty bucket, not an omitted one", () => {
    const result = computeFyHistory([{ fyLabel: "FY2024", records: [] }]);
    expect(result).toEqual([
      { fyLabel: "FY2024", totalIncidents: 0, majorIncidents: 0, lostDays: 0 },
    ]);
  });
});

describe("computeDepartmentAnalysis", () => {
  const departments = [
    { id: "dept-hk", name: "Housekeeping" },
    { id: "dept-fb", name: "Food & Beverage" },
  ];

  it("includes every department even with zero incidents this period", () => {
    const result = computeDepartmentAnalysis([], [], departments);
    expect(result).toHaveLength(2);
    expect(result.every((r) => r.total === 0 && r.sharePct === null)).toBe(true);
  });

  it("computes total/major/hospital/osh/lostDays per department and sorts by total desc", () => {
    const current = [
      record({
        departmentId: "dept-hk",
        isMajor: true,
        isHospitalReferral: true,
        lostWorkdays: 3,
      }),
      record({ departmentId: "dept-hk", isOshReportable: true }),
      record({ departmentId: "dept-fb" }),
    ];
    const result = computeDepartmentAnalysis(current, [], departments);
    expect(result[0]!.departmentId).toBe("dept-hk");
    expect(result[0]).toMatchObject({
      total: 2,
      major: 1,
      hospitalReferrals: 1,
      oshReportable: 1,
      lostDays: 3,
      sharePct: expect.closeTo(66.67, 1),
    });
    expect(result[1]).toMatchObject({
      departmentId: "dept-fb",
      total: 1,
      sharePct: expect.closeTo(33.33, 1),
    });
  });

  it("computes deltaPct and trend against the comparison period, null delta when comparison is zero", () => {
    const current = [record({ departmentId: "dept-hk" }), record({ departmentId: "dept-hk" })];
    const comparison = [record({ departmentId: "dept-hk" })];
    const result = computeDepartmentAnalysis(current, comparison, departments);
    const hk = result.find((r) => r.departmentId === "dept-hk")!;
    expect(hk.comparisonTotal).toBe(1);
    expect(hk.deltaPct).toBe(100);
    expect(hk.trend).toBe("up");

    const fb = result.find((r) => r.departmentId === "dept-fb")!;
    expect(fb.comparisonTotal).toBe(0);
    expect(fb.deltaPct).toBeNull();
    expect(fb.trend).toBe("flat");
  });

  it("marks trend as down when current is lower than comparison", () => {
    const current = [record({ departmentId: "dept-hk" })];
    const comparison = [
      record({ departmentId: "dept-hk" }),
      record({ departmentId: "dept-hk" }),
    ];
    const result = computeDepartmentAnalysis(current, comparison, departments);
    const hk = result.find((r) => r.departmentId === "dept-hk")!;
    expect(hk.trend).toBe("down");
    expect(hk.deltaPct).toBe(-50);
  });
});

describe("computeDepartmentFyHeatmap", () => {
  const departments = [{ id: "dept-hk", name: "Housekeeping" }];

  it("produces a fully rectangular grid: every department x every FY bucket", () => {
    const result = computeDepartmentFyHeatmap(
      [
        { fyLabel: "FY2025", records: [record({ departmentId: "dept-hk" })] },
        { fyLabel: "FY2026", records: [] },
      ],
      departments,
    );
    expect(result).toEqual([
      {
        departmentId: "dept-hk",
        departmentName: "Housekeeping",
        countsByFy: { FY2025: 1, FY2026: 0 },
      },
    ]);
  });
});

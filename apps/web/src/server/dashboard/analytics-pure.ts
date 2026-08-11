/**
 * Pure grouping/aggregation logic for the Safety Performance Analytics page (see chat: KPI
 * analytics rebuild, sections K-P) — no DB, no server-only, directly unit-testable. Every function
 * here operates on already-fetched, already-classified records; the classification itself
 * (RECORDABLE_OUTCOMES, OSH-reportable determination) stays in the server-only fetch layer
 * (analytics.ts) so this file never has to duplicate or drift from that vocabulary.
 */

const MONTH_ABBR = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

const WEEKDAY_LABELS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

/** Monday-first display order for a day-of-week chart (WEEKDAY_LABELS is getUTCDay()-indexed,
 * i.e. Sunday-first, which is not how an H&S weekly report is normally read). */
const WEEKDAY_DISPLAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

export function dayOfWeekLabel(date: Date): string {
  // getUTCDay() is always 0-6, WEEKDAY_LABELS always has 7 entries.
  return WEEKDAY_LABELS[date.getUTCDay()]!;
}

/**
 * One classified incident record for analytics purposes. `isMajor`/`isOshReportable` are
 * pre-computed by the server-only fetch layer (they require the RECORDABLE_OUTCOMES vocabulary
 * and an IncidentOSHReportability join respectively) — this module only ever counts/groups them.
 */
export interface IncidentAnalyticsRecord {
  id: string;
  occurredAt: Date;
  incidentType: string;
  outcome: string;
  personEventType: string;
  bodyPart: string | null;
  departmentId: string | null;
  lostWorkdays: number;
  isMajor: boolean;
  isHospitalReferral: boolean;
  isOshReportable: boolean;
}

export interface CategoryCount {
  value: string;
  label: string;
  count: number;
  /** 0-100; null when there are zero records to share across (never a fabricated 0%). */
  pct: number | null;
}

/** Counts `records` by an arbitrary string key, sorted by count desc then label asc. Unrecognised
 * keys fall back to `Not recorded` rather than being silently dropped, per the app's explicit
 * data-state convention (see data-states.ts) — a missing category is a fact worth showing, not an
 * absence to hide. */
export function countByCategory(
  values: Array<string | null | undefined>,
  labelFor: (value: string) => string = (v) => v,
): CategoryCount[] {
  const counts = new Map<string, number>();
  for (const raw of values) {
    const key = raw && raw.trim() !== "" ? raw : "__not_recorded__";
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const total = values.length;
  return [...counts.entries()]
    .map(([value, count]) => ({
      value,
      label: value === "__not_recorded__" ? "Not recorded" : labelFor(value),
      count,
      pct: total > 0 ? (count / total) * 100 : null,
    }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

/** Day-of-week breakdown in fixed Monday-Sunday reporting order (not count-sorted) — this is the
 * one breakdown callers read positionally (a weekly bar chart), so category order matters more
 * than count order here. */
export function computeDayOfWeekBreakdown(
  records: IncidentAnalyticsRecord[],
): CategoryCount[] {
  const counts: number[] = [0, 0, 0, 0, 0, 0, 0];
  for (const r of records) {
    const dayIndex = r.occurredAt.getUTCDay();
    counts[dayIndex] = (counts[dayIndex] ?? 0) + 1;
  }
  const total = records.length;
  return WEEKDAY_DISPLAY_ORDER.map((dayIndex) => {
    const count = counts[dayIndex] ?? 0;
    return {
      value: WEEKDAY_LABELS[dayIndex]!,
      label: WEEKDAY_LABELS[dayIndex]!,
      count,
      pct: total > 0 ? (count / total) * 100 : null,
    };
  });
}

export interface CategoricalBreakdowns {
  byIncidentType: CategoryCount[];
  byOutcome: CategoryCount[];
  byPersonType: CategoryCount[];
  byBodyPart: CategoryCount[];
  byDayOfWeek: CategoryCount[];
}

/** The full Excel-dashboard-parity breakdown set (see chat §K) for one set of records — call once
 * per FY/filter combination the page needs (current FY, comparison FY, or any other slice). */
export function computeCategoricalBreakdowns(
  records: IncidentAnalyticsRecord[],
  labels?: {
    incidentType?: (v: string) => string;
    outcome?: (v: string) => string;
    personType?: (v: string) => string;
  },
): CategoricalBreakdowns {
  return {
    byIncidentType: countByCategory(
      records.map((r) => r.incidentType),
      labels?.incidentType,
    ),
    byOutcome: countByCategory(
      records.map((r) => r.outcome),
      labels?.outcome,
    ),
    byPersonType: countByCategory(
      records.map((r) => r.personEventType),
      labels?.personType,
    ),
    byBodyPart: countByCategory(records.map((r) => r.bodyPart)),
    byDayOfWeek: computeDayOfWeekBreakdown(records),
  };
}

export interface MonthlyTrendPoint {
  /** 0-11 offset from the current FY's start month (0 = July in the standard Jul-Jun FY). */
  monthIndex: number;
  monthLabel: string;
  current: number;
  comparison: number;
}

function monthOffsetFromFyStart(fyStart: Date, date: Date): number {
  return (
    (date.getUTCFullYear() - fyStart.getUTCFullYear()) * 12 +
    (date.getUTCMonth() - fyStart.getUTCMonth())
  );
}

/**
 * 12-month current-vs-comparison-FY trend, aligned by month-of-FY rather than calendar month, so
 * "July of this FY" always lines up with "July of the comparison FY" regardless of which calendar
 * months they actually fall in. Months genuinely have zero incidents show `0`, not a gap — a real,
 * countable fact, not missing data.
 */
export function computeMonthlyTrend(
  currentFyStart: Date,
  comparisonFyStart: Date,
  currentRecords: IncidentAnalyticsRecord[],
  comparisonRecords: IncidentAnalyticsRecord[],
): MonthlyTrendPoint[] {
  const currentByMonth: number[] = new Array(12).fill(0);
  for (const r of currentRecords) {
    const idx = monthOffsetFromFyStart(currentFyStart, r.occurredAt);
    if (idx >= 0 && idx < 12) currentByMonth[idx] = (currentByMonth[idx] ?? 0) + 1;
  }
  const comparisonByMonth: number[] = new Array(12).fill(0);
  for (const r of comparisonRecords) {
    const idx = monthOffsetFromFyStart(comparisonFyStart, r.occurredAt);
    if (idx >= 0 && idx < 12) comparisonByMonth[idx] = (comparisonByMonth[idx] ?? 0) + 1;
  }

  const startMonth = currentFyStart.getUTCMonth();
  return Array.from({ length: 12 }, (_, i) => ({
    monthIndex: i,
    monthLabel: MONTH_ABBR[(startMonth + i) % 12]!,
    current: currentByMonth[i] ?? 0,
    comparison: comparisonByMonth[i] ?? 0,
  }));
}

export interface FyHistoryPoint {
  fyLabel: string;
  totalIncidents: number;
  majorIncidents: number;
  lostDays: number;
}

/** Aggregates each supplied FY bucket independently — order is whatever the caller passes in
 * (the fetch layer supplies oldest-first, so a trend chart reads left-to-right chronologically). */
export function computeFyHistory(
  buckets: Array<{ fyLabel: string; records: IncidentAnalyticsRecord[] }>,
): FyHistoryPoint[] {
  return buckets.map(({ fyLabel, records }) => ({
    fyLabel,
    totalIncidents: records.length,
    majorIncidents: records.filter((r) => r.isMajor).length,
    lostDays: records.reduce((sum, r) => sum + r.lostWorkdays, 0),
  }));
}

export interface DepartmentAnalysisRow {
  departmentId: string;
  departmentName: string;
  total: number;
  major: number;
  hospitalReferrals: number;
  oshReportable: number;
  lostDays: number;
  /** Share of this period's total incidents across all departments; null when that grand total is
   * zero (there is no meaningful "share" of nothing). */
  sharePct: number | null;
  comparisonTotal: number;
  /** Percentage change vs the comparison period; null when the comparison total is zero (a percent
   * change from zero is undefined, not a fabricated "+100%" or "0%"). */
  deltaPct: number | null;
  trend: "up" | "down" | "flat";
}

/**
 * One row per department (every department passed in, even ones with zero incidents this
 * period — an explicit zero is a real fact worth showing on an exec table, not something to hide
 * by omission), sorted by current-period total desc so "top N" is just `.slice(0, N)`.
 */
export function computeDepartmentAnalysis(
  currentRecords: IncidentAnalyticsRecord[],
  comparisonRecords: IncidentAnalyticsRecord[],
  departments: Array<{ id: string; name: string }>,
): DepartmentAnalysisRow[] {
  const grandTotal = currentRecords.length;

  function bucketFor(records: IncidentAnalyticsRecord[], departmentId: string) {
    return records.filter((r) => r.departmentId === departmentId);
  }

  const rows = departments.map(({ id, name }) => {
    const current = bucketFor(currentRecords, id);
    const comparison = bucketFor(comparisonRecords, id);
    const total = current.length;
    const comparisonTotal = comparison.length;

    let deltaPct: number | null = null;
    if (comparisonTotal > 0) {
      deltaPct = ((total - comparisonTotal) / comparisonTotal) * 100;
    }
    const trend: DepartmentAnalysisRow["trend"] =
      total === comparisonTotal ? "flat" : total > comparisonTotal ? "up" : "down";

    return {
      departmentId: id,
      departmentName: name,
      total,
      major: current.filter((r) => r.isMajor).length,
      hospitalReferrals: current.filter((r) => r.isHospitalReferral).length,
      oshReportable: current.filter((r) => r.isOshReportable).length,
      lostDays: current.reduce((sum, r) => sum + r.lostWorkdays, 0),
      sharePct: grandTotal > 0 ? (total / grandTotal) * 100 : null,
      comparisonTotal,
      deltaPct,
      trend,
    };
  });

  return rows.sort(
    (a, b) => b.total - a.total || a.departmentName.localeCompare(b.departmentName),
  );
}

export interface DepartmentFyHeatmapRow {
  departmentId: string;
  departmentName: string;
  /** fyLabel -> incident count for that department/FY. Missing keys mean the FY bucket wasn't
   * supplied at all (different from a real 0, which is present as the number 0). */
  countsByFy: Record<string, number>;
}

/** Department x FY matrix (see chat §K "department x FY heatmaps") — every department in
 * `departments` gets a row, every fyLabel in `buckets` gets a column, unconditionally, so the
 * heatmap grid is always fully rectangular for the caller to render. */
export function computeDepartmentFyHeatmap(
  buckets: Array<{ fyLabel: string; records: IncidentAnalyticsRecord[] }>,
  departments: Array<{ id: string; name: string }>,
): DepartmentFyHeatmapRow[] {
  return departments.map(({ id, name }) => {
    const countsByFy: Record<string, number> = {};
    for (const { fyLabel, records } of buckets) {
      countsByFy[fyLabel] = records.filter((r) => r.departmentId === id).length;
    }
    return { departmentId: id, departmentName: name, countsByFy };
  });
}

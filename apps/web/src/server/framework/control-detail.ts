/**
 * Pure helpers extracted from the /framework/controls/[controlId] page (see chat: the route's
 * "An error occurred in the Server Components render" crash) — no DB, no server-only, directly
 * unit-testable, so the defensive branches added here (dangling joins, malformed scores) are
 * actually covered instead of only reachable through a live page render.
 */

export interface FrameworkMappingSummary {
  frameworkCode: string;
  frameworkName: string;
  clauseReference: string | null;
}

export interface RawMappingRow {
  Frameworks: { code: string; name: string } | null | undefined;
  FrameworkRequirements: { clause_reference: string | null } | null | undefined;
}

/**
 * Converts raw ZCQL left-join rows into display-ready framework mappings. A ControlFrameworkMappings
 * row whose framework_requirement_id/framework_id no longer resolves (a dangling reference — e.g.
 * the mapped Frameworks or FrameworkRequirements row was deleted after the mapping was created)
 * comes back from the left join with a null nested object; the previous code read `m.Frameworks.code`
 * unconditionally and crashed the whole page on it. Such a row is now excluded rather than crashing.
 */
export function mapControlFrameworkMappings(rows: RawMappingRow[]): FrameworkMappingSummary[] {
  return rows
    .filter((r) => r.Frameworks != null)
    .map((r) => ({
      frameworkCode: r.Frameworks!.code,
      frameworkName: r.Frameworks!.name,
      clauseReference: r.FrameworkRequirements?.clause_reference ?? null,
    }));
}

export interface RawAssessmentRow {
  property_id: string;
  dimension: string;
  maturity_score: string;
  assessed_at: string;
}

/**
 * "Latest" per (property, dimension) requires assessed_at descending order — getRows makes no
 * ordering guarantee, so this sorts client-side before taking the first occurrence per dimension.
 * A row whose maturity_score doesn't parse to a number (malformed/legacy data) is skipped rather
 * than poisoning the maturity rollup with NaN.
 */
export function buildLatestScoresByPropertyDimension(
  rows: RawAssessmentRow[],
): Map<string, Map<string, number>> {
  const sorted = [...rows].sort((a, b) =>
    a.assessed_at < b.assessed_at ? 1 : a.assessed_at > b.assessed_at ? -1 : 0,
  );
  const result = new Map<string, Map<string, number>>();
  for (const a of sorted) {
    const propMap = result.get(a.property_id) ?? new Map<string, number>();
    if (!propMap.has(a.dimension)) {
      const score = Number(a.maturity_score);
      if (!Number.isNaN(score)) {
        propMap.set(a.dimension, score);
      }
    }
    result.set(a.property_id, propMap);
  }
  return result;
}

/** A controlId path segment that can't possibly be a real Catalyst ROWID (empty) — checked before
 * any query so a malformed URL fails fast with a plain "not found" instead of a wasted round trip.
 * This is a fast-path UX check only, not the security boundary: every query built from controlId
 * goes through zcqlString() (see lib/catalyst/zcql-escape.ts), which safely escapes any character
 * — including a quote — so this function no longer needs to (and doesn't) reject on one. */
export function isValidControlId(controlId: string): boolean {
  return controlId.trim().length > 0;
}

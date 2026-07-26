/**
 * Pure control-maturity calculation — no "server-only", no DB import, unit-testable. Implements
 * ADR-0002 (docs/implementation-plan.md) and the critical-gap override algorithm
 * (docs/framework-model.md §3 and §5). Kept separate from any DB-touching rollup code the same
 * way src/server/permissions/pure.ts is, and for the same reason.
 */

export type MaturityDimension = "policy" | "procedure" | "implementation" | "effectiveness";

export interface DimensionScores {
  policy?: number | null;
  procedure?: number | null;
  implementation?: number | null;
  effectiveness?: number | null;
}

/**
 * Overall control maturity = MINIMUM of the four dimension scores, not the average — a strong
 * Policy score must not mask a weak Effectiveness score. Returns null if any dimension hasn't
 * been assessed yet (an incomplete assessment has no defensible overall score).
 */
export function computeControlMaturity(scores: DimensionScores): number | null {
  const values = [
    scores.policy,
    scores.procedure,
    scores.implementation,
    scores.effectiveness,
  ];
  if (values.some((v) => v == null)) {
    return null;
  }
  return Math.min(...(values as number[]));
}

/**
 * A critical legal/life-safety gap caps the rollup at "Initial" (1) regardless of how strong
 * every other input is — docs/framework-model.md §5. `hasCriticalGap` is true when the control is
 * `is_life_safety_critical` (or legal) AND any dimension score is <= 1.
 */
export function applyCriticalGapCap(score: number, hasCriticalGap: boolean): number {
  return hasCriticalGap ? Math.min(score, 1) : score;
}

export function isCriticalGap(params: {
  isLifeSafetyCritical: boolean;
  isLegal: boolean;
  scores: DimensionScores;
}): boolean {
  if (!params.isLifeSafetyCritical && !params.isLegal) {
    return false;
  }
  const values = [
    params.scores.policy,
    params.scores.procedure,
    params.scores.implementation,
    params.scores.effectiveness,
  ];
  return values.some((v) => v != null && v <= 1);
}

const MATURITY_LABELS = [
  "Absent",
  "Initial",
  "Documented",
  "Implemented",
  "Effective",
] as const;

export function maturityLabel(score: number | null): string {
  if (score == null) return "Not assessed";
  return MATURITY_LABELS[Math.max(0, Math.min(4, Math.round(score)))] ?? "Not assessed";
}

/**
 * Rollup across many controls (e.g. all controls mapped to a framework, at a property): the
 * average of individual control scores, then capped if ANY input control is a critical gap.
 * Controls with no complete assessment are excluded from the average but still checked for
 * critical-gap status if a partial assessment already shows one.
 */
export function computeFrameworkRollup(
  controls: Array<{
    scores: DimensionScores;
    isLifeSafetyCritical: boolean;
    isLegal: boolean;
  }>,
): { averageScore: number | null; isCapped: boolean; rollupScore: number | null } {
  const anyCriticalGap = controls.some((c) =>
    isCriticalGap({
      isLifeSafetyCritical: c.isLifeSafetyCritical,
      isLegal: c.isLegal,
      scores: c.scores,
    }),
  );

  const completeScores = controls
    .map((c) => computeControlMaturity(c.scores))
    .filter((s): s is number => s != null);

  if (completeScores.length === 0) {
    return {
      averageScore: null,
      isCapped: anyCriticalGap,
      rollupScore: anyCriticalGap ? 1 : null,
    };
  }

  const average = completeScores.reduce((sum, s) => sum + s, 0) / completeScores.length;
  const rollupScore = applyCriticalGapCap(average, anyCriticalGap);

  return { averageScore: average, isCapped: anyCriticalGap, rollupScore };
}

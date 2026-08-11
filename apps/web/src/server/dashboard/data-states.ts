/**
 * Explicit assurance/data-quality states used consistently across SafeGuard (see chat) — "0", "—",
 * "N/A", "Not assessed", and missing data are NOT interchangeable, and conflating them was flagged
 * as a defect. Pure module (no DB/server-only imports) so it's directly unit-testable.
 */

export const DATA_STATES = [
  "not_assessed",
  "in_progress",
  "evidence_incomplete",
  "awaiting_verification",
  "verified_satisfactory",
  "requires_improvement",
  "major_gap",
  "not_applicable",
  "data_unavailable",
] as const;

export type DataState = (typeof DATA_STATES)[number];

export const DATA_STATE_LABELS: Record<DataState, string> = {
  not_assessed: "Not assessed",
  in_progress: "Assessment in progress",
  evidence_incomplete: "Evidence incomplete",
  awaiting_verification: "Awaiting verification",
  verified_satisfactory: "Verified satisfactory",
  requires_improvement: "Requires improvement",
  major_gap: "Major gap",
  not_applicable: "Not applicable",
  data_unavailable: "Data unavailable",
};

/** Presentation-only grouping — never used to decide the state itself, only how to colour it. */
export type DataStateTone = "neutral" | "amber" | "red" | "green" | "grey";

export const DATA_STATE_TONE: Record<DataState, DataStateTone> = {
  not_assessed: "grey",
  in_progress: "neutral",
  evidence_incomplete: "amber",
  awaiting_verification: "amber",
  verified_satisfactory: "green",
  requires_improvement: "amber",
  major_gap: "red",
  not_applicable: "neutral",
  data_unavailable: "grey",
};

/**
 * Derives a control/assessment-area data state from its assessment facts — this is the ONE place
 * that decides "not assessed" vs "major gap" vs "verified satisfactory" etc. for an assessed
 * control, so every consumer (heatmap cell, framework readiness row, control detail page) reaches
 * the same conclusion from the same facts instead of each inventing its own threshold.
 */
export function deriveControlDataState(input: {
  applicability: "applicable" | "not_applicable" | null;
  hasAssessment: boolean;
  /** 0-4 rollup maturity score, only meaningful when hasAssessment is true. */
  rollupScore: number | null;
  hasEvidenceLinked: boolean;
  isCriticalGap: boolean;
}): DataState {
  if (input.applicability === "not_applicable") {
    return "not_applicable";
  }
  if (!input.hasAssessment || input.rollupScore == null) {
    return "not_assessed";
  }
  if (input.isCriticalGap || input.rollupScore <= 1) {
    return "major_gap";
  }
  if (!input.hasEvidenceLinked) {
    return "evidence_incomplete";
  }
  if (input.rollupScore < 3) {
    return "requires_improvement";
  }
  if (input.rollupScore < 4) {
    return "awaiting_verification";
  }
  return "verified_satisfactory";
}

/** Friendly 0-4 assessment scale labels (see chat) — replaces the raw "Score 0-4" picker. */
export const MATURITY_SCALE_LABELS: Record<number, string> = {
  0: "Not implemented",
  1: "Ad hoc / informal",
  2: "Partially implemented",
  3: "Implemented",
  4: "Implemented and verified effective",
};

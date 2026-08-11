import { describe, expect, it } from "vitest";

import {
  DATA_STATE_LABELS,
  DATA_STATE_TONE,
  DATA_STATES,
  MATURITY_SCALE_LABELS,
  deriveControlDataState,
} from "./data-states";

describe("DATA_STATES / DATA_STATE_LABELS / DATA_STATE_TONE", () => {
  it("has a label for every state, with no placeholder gaps", () => {
    for (const state of DATA_STATES) {
      expect(DATA_STATE_LABELS[state]).toBeTruthy();
    }
  });
  it("has a tone for every state", () => {
    for (const state of DATA_STATES) {
      expect(DATA_STATE_TONE[state]).toBeTruthy();
    }
  });
  it("never labels a state as a bare '0', '—', or 'N/A'", () => {
    for (const state of DATA_STATES) {
      expect(["0", "—", "N/A", ""]).not.toContain(DATA_STATE_LABELS[state]);
    }
  });
});

describe("deriveControlDataState", () => {
  const base = {
    applicability: "applicable" as const,
    hasAssessment: true,
    rollupScore: 3.5,
    hasEvidenceLinked: true,
    isCriticalGap: false,
  };

  it("is not_applicable whenever applicability says so, regardless of any other input", () => {
    expect(
      deriveControlDataState({
        ...base,
        applicability: "not_applicable",
        hasAssessment: false,
        rollupScore: null,
        isCriticalGap: true,
      }),
    ).toBe("not_applicable");
  });

  it("is not_assessed when there is no assessment at all", () => {
    expect(deriveControlDataState({ ...base, hasAssessment: false, rollupScore: null })).toBe(
      "not_assessed",
    );
  });

  it("is not_assessed when hasAssessment is true but rollupScore is still null", () => {
    expect(deriveControlDataState({ ...base, hasAssessment: true, rollupScore: null })).toBe(
      "not_assessed",
    );
  });

  it("is major_gap when flagged as a critical gap, even with a high score", () => {
    expect(deriveControlDataState({ ...base, isCriticalGap: true, rollupScore: 4 })).toBe(
      "major_gap",
    );
  });

  it("is major_gap when the rollup score is at or below 1, without needing isCriticalGap", () => {
    expect(deriveControlDataState({ ...base, rollupScore: 1, isCriticalGap: false })).toBe(
      "major_gap",
    );
    expect(deriveControlDataState({ ...base, rollupScore: 0, isCriticalGap: false })).toBe(
      "major_gap",
    );
  });

  it("is evidence_incomplete above the major-gap threshold when no evidence is linked", () => {
    expect(deriveControlDataState({ ...base, rollupScore: 2, hasEvidenceLinked: false })).toBe(
      "evidence_incomplete",
    );
  });

  it("is requires_improvement when evidence exists but the score is below 3", () => {
    expect(deriveControlDataState({ ...base, rollupScore: 2, hasEvidenceLinked: true })).toBe(
      "requires_improvement",
    );
  });

  it("is awaiting_verification when the score is 3 or higher but below 4", () => {
    expect(deriveControlDataState({ ...base, rollupScore: 3, hasEvidenceLinked: true })).toBe(
      "awaiting_verification",
    );
    expect(
      deriveControlDataState({ ...base, rollupScore: 3.9, hasEvidenceLinked: true }),
    ).toBe("awaiting_verification");
  });

  it("is verified_satisfactory only at a full score of 4 with evidence linked", () => {
    expect(deriveControlDataState({ ...base, rollupScore: 4, hasEvidenceLinked: true })).toBe(
      "verified_satisfactory",
    );
  });
});

describe("MATURITY_SCALE_LABELS", () => {
  it("has a friendly label for every score 0-4", () => {
    for (const score of [0, 1, 2, 3, 4]) {
      expect(MATURITY_SCALE_LABELS[score]).toBeTruthy();
    }
  });
});

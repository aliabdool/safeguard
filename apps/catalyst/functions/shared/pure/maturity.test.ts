import { describe, expect, it } from "vitest";

import {
  applyCriticalGapCap,
  computeControlMaturity,
  computeFrameworkRollup,
  isCriticalGap,
  maturityLabel,
} from "./maturity";

describe("computeControlMaturity", () => {
  it("is the minimum of the four dimensions, not the average", () => {
    // Strong policy (4) must not mask weak effectiveness (1) — this is the exact failure mode
    // the spec calls out ("a policy alone must not produce full compliance").
    const score = computeControlMaturity({
      policy: 4,
      procedure: 4,
      implementation: 3,
      effectiveness: 1,
    });
    expect(score).toBe(1);
  });

  it("returns null when any dimension hasn't been assessed", () => {
    expect(
      computeControlMaturity({
        policy: 4,
        procedure: 4,
        implementation: null,
        effectiveness: 4,
      }),
    ).toBeNull();
  });

  it("returns 4 (Effective) when all four dimensions are fully mature", () => {
    expect(
      computeControlMaturity({ policy: 4, procedure: 4, implementation: 4, effectiveness: 4 }),
    ).toBe(4);
  });
});

describe("applyCriticalGapCap", () => {
  it("caps at 1 (Initial) when there is a critical gap, no matter how high the score", () => {
    expect(applyCriticalGapCap(4, true)).toBe(1);
    expect(applyCriticalGapCap(3.5, true)).toBe(1);
  });
  it("passes the score through unchanged when there is no critical gap", () => {
    expect(applyCriticalGapCap(3.5, false)).toBe(3.5);
  });
});

describe("isCriticalGap", () => {
  it("is true for a life-safety-critical control with a weak dimension score", () => {
    expect(
      isCriticalGap({
        isLifeSafetyCritical: true,
        isLegal: false,
        scores: { policy: 4, procedure: 4, implementation: 4, effectiveness: 1 },
      }),
    ).toBe(true);
  });
  it("is false for the same weak score on a non-critical, non-legal control", () => {
    expect(
      isCriticalGap({
        isLifeSafetyCritical: false,
        isLegal: false,
        scores: { policy: 4, procedure: 4, implementation: 4, effectiveness: 1 },
      }),
    ).toBe(false);
  });
  it("is true for a legal control even if not marked life-safety-critical", () => {
    expect(
      isCriticalGap({
        isLifeSafetyCritical: false,
        isLegal: true,
        scores: { policy: 0, procedure: 0, implementation: 0, effectiveness: 0 },
      }),
    ).toBe(true);
  });
});

describe("computeFrameworkRollup", () => {
  it("a single critical gap caps the whole rollup even when every other control is perfect", () => {
    const rollup = computeFrameworkRollup([
      {
        isLifeSafetyCritical: false,
        isLegal: false,
        scores: { policy: 4, procedure: 4, implementation: 4, effectiveness: 4 },
      },
      {
        isLifeSafetyCritical: false,
        isLegal: false,
        scores: { policy: 4, procedure: 4, implementation: 4, effectiveness: 4 },
      },
      {
        isLifeSafetyCritical: true,
        isLegal: false,
        scores: { policy: 4, procedure: 4, implementation: 4, effectiveness: 1 },
      },
    ]);
    expect(rollup.isCapped).toBe(true);
    expect(rollup.rollupScore).toBe(1);
    // The uncapped average would have been high — recorded separately so the UI can show both.
    expect(rollup.averageScore).toBeGreaterThan(1);
  });

  it("with no critical gaps, the rollup is the plain average", () => {
    const rollup = computeFrameworkRollup([
      {
        isLifeSafetyCritical: false,
        isLegal: false,
        scores: { policy: 4, procedure: 4, implementation: 4, effectiveness: 4 },
      },
      {
        isLifeSafetyCritical: false,
        isLegal: false,
        scores: { policy: 2, procedure: 2, implementation: 2, effectiveness: 2 },
      },
    ]);
    expect(rollup.isCapped).toBe(false);
    expect(rollup.rollupScore).toBe(3);
  });
});

describe("maturityLabel", () => {
  it("maps every score 0-4 to its spec label", () => {
    expect(maturityLabel(0)).toBe("Absent");
    expect(maturityLabel(1)).toBe("Initial");
    expect(maturityLabel(2)).toBe("Documented");
    expect(maturityLabel(3)).toBe("Implemented");
    expect(maturityLabel(4)).toBe("Effective");
    expect(maturityLabel(null)).toBe("Not assessed");
  });
});

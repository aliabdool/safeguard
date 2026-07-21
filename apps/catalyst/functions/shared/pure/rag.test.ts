import { describe, expect, it } from "vitest";

import { computeRagStatus, computeVariance } from "./rag";

describe("computeRagStatus — lower_better (e.g. incident counts)", () => {
  const base = {
    target: 5,
    warningThreshold: 8,
    criticalThreshold: 12,
    direction: "lower_better" as const,
  };

  it("is green at or under target", () => {
    expect(computeRagStatus({ ...base, value: 3 })).toBe("green");
    expect(computeRagStatus({ ...base, value: 5 })).toBe("green");
  });
  it("is amber between target and warning", () => {
    expect(computeRagStatus({ ...base, value: 7 })).toBe("amber");
  });
  it("is red above the critical threshold", () => {
    expect(computeRagStatus({ ...base, value: 13 })).toBe("red");
  });
  it("is unknown with no value or no target", () => {
    expect(computeRagStatus({ ...base, value: null })).toBe("unknown");
    expect(computeRagStatus({ ...base, value: 3, target: null })).toBe("unknown");
  });
});

describe("computeRagStatus — higher_better (e.g. near-miss reporting rate)", () => {
  const base = {
    target: 90,
    warningThreshold: 70,
    criticalThreshold: 50,
    direction: "higher_better" as const,
  };

  it("is green at or above target", () => {
    expect(computeRagStatus({ ...base, value: 95 })).toBe("green");
  });
  it("is amber between critical and target", () => {
    expect(computeRagStatus({ ...base, value: 60 })).toBe("amber");
  });
  it("is red below the critical threshold", () => {
    expect(computeRagStatus({ ...base, value: 40 })).toBe("red");
  });
});

describe("computeVariance", () => {
  it("computes absolute and percent variance", () => {
    const { absolute, percent } = computeVariance(12, 10);
    expect(absolute).toBe(2);
    expect(percent).toBe(20);
  });
  it("handles a zero comparison value without dividing by zero", () => {
    const { absolute, percent } = computeVariance(5, 0);
    expect(absolute).toBe(5);
    expect(percent).toBeNull();
  });
  it("is null/null when either input is missing", () => {
    expect(computeVariance(null, 10)).toEqual({ absolute: null, percent: null });
  });
});

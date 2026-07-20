import { describe, expect, it } from "vitest";

import {
  classifyMateriality,
  computeGriImpactScore,
  computeIfrsFinancialScore,
} from "./scoring";

describe("computeGriImpactScore", () => {
  it("scores an actual impact from severity/scale/scope alone", () => {
    const score = computeGriImpactScore({
      impactType: "actual",
      severity: 4,
      scale: 4,
      scope: 4,
      irremediable: false,
    });
    expect(score).toBe(4);
  });

  it("adds weight for an irremediable actual impact, capped at 5", () => {
    const score = computeGriImpactScore({
      impactType: "actual",
      severity: 5,
      scale: 5,
      scope: 5,
      irremediable: true,
    });
    expect(score).toBe(5);
  });

  it("discounts a potential impact by likelihood", () => {
    const highSeverityLowLikelihood = computeGriImpactScore({
      impactType: "potential",
      severity: 5,
      scale: 5,
      scope: 5,
      irremediable: false,
      likelihood: 1,
    });
    const highSeverityHighLikelihood = computeGriImpactScore({
      impactType: "potential",
      severity: 5,
      scale: 5,
      scope: 5,
      irremediable: false,
      likelihood: 5,
    });
    expect(highSeverityLowLikelihood).toBeLessThan(highSeverityHighLikelihood);
    expect(highSeverityHighLikelihood).toBe(5);
  });

  it("never returns below 1", () => {
    const score = computeGriImpactScore({
      impactType: "potential",
      severity: 1,
      scale: 1,
      scope: 1,
      irremediable: false,
      likelihood: 1,
    });
    expect(score).toBeGreaterThanOrEqual(1);
  });
});

describe("computeIfrsFinancialScore", () => {
  it("scores higher when more financial-effect channels are touched at the same likelihood/magnitude", () => {
    const singleChannel = computeIfrsFinancialScore({
      likelihood: 4,
      financialMagnitude: 4,
      effectCashFlows: true,
      effectAccessToFinance: false,
      effectCostOfCapital: false,
      effectBusinessModelStrategy: false,
    });
    const allChannels = computeIfrsFinancialScore({
      likelihood: 4,
      financialMagnitude: 4,
      effectCashFlows: true,
      effectAccessToFinance: true,
      effectCostOfCapital: true,
      effectBusinessModelStrategy: true,
    });
    expect(allChannels).toBeGreaterThan(singleChannel);
  });

  it("stays within the 1-5 range", () => {
    const low = computeIfrsFinancialScore({
      likelihood: 1,
      financialMagnitude: 1,
      effectCashFlows: false,
      effectAccessToFinance: false,
      effectCostOfCapital: false,
      effectBusinessModelStrategy: false,
    });
    const high = computeIfrsFinancialScore({
      likelihood: 5,
      financialMagnitude: 5,
      effectCashFlows: true,
      effectAccessToFinance: true,
      effectCostOfCapital: true,
      effectBusinessModelStrategy: true,
    });
    expect(low).toBeGreaterThanOrEqual(1);
    expect(high).toBeLessThanOrEqual(5);
  });
});

describe("classifyMateriality", () => {
  it("is not_yet_assessed when either decision is missing", () => {
    expect(classifyMateriality(null, null)).toBe("not_yet_assessed");
    expect(classifyMateriality(true, null)).toBe("not_yet_assessed");
    expect(classifyMateriality(undefined, false)).toBe("not_yet_assessed");
  });

  it("classifies all four combinations once both decisions are recorded", () => {
    expect(classifyMateriality(true, true)).toBe("material_under_both");
    expect(classifyMateriality(true, false)).toBe("material_under_gri_only");
    expect(classifyMateriality(false, true)).toBe("material_under_ifrs_only");
    expect(classifyMateriality(false, false)).toBe("not_material");
  });
});

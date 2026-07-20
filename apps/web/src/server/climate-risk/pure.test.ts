import { describe, expect, it } from "vitest";

import { categoryForHazard, isHazardValidForCategory } from "./pure";

describe("isHazardValidForCategory", () => {
  it("accepts a hazard in its correct category", () => {
    expect(isHazardValidForCategory("cyclone", "acute_physical")).toBe(true);
    expect(isHazardValidForCategory("heat_stress", "chronic_physical")).toBe(true);
    expect(isHazardValidForCategory("carbon_pricing", "transition")).toBe(true);
  });

  it("rejects a hazard assigned to the wrong category", () => {
    expect(isHazardValidForCategory("cyclone", "transition")).toBe(false);
    expect(isHazardValidForCategory("carbon_pricing", "acute_physical")).toBe(false);
    expect(isHazardValidForCategory("heat_stress", "acute_physical")).toBe(false);
  });
});

describe("categoryForHazard", () => {
  it("resolves the correct category for a known hazard", () => {
    expect(categoryForHazard("flood")).toBe("acute_physical");
    expect(categoryForHazard("water_scarcity")).toBe("chronic_physical");
    expect(categoryForHazard("regulation")).toBe("transition");
  });

  it("returns null for an unrecognised hazard", () => {
    expect(categoryForHazard("meteor_strike")).toBeNull();
  });
});

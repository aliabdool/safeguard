import { describe, expect, it } from "vitest";

import { SDG_DEFINITIONS, mapControlCategoryToSdgNumbers } from "./sdg";

describe("mapControlCategoryToSdgNumbers", () => {
  it("maps a category relevant to a single goal", () => {
    expect(mapControlCategoryToSdgNumbers("Competence")).toEqual([8]);
  });

  it("maps a category relevant to multiple goals", () => {
    expect(mapControlCategoryToSdgNumbers("High-risk work control")).toEqual([3, 8]);
  });

  it("is case-insensitive and trims whitespace", () => {
    expect(mapControlCategoryToSdgNumbers("  competence  ")).toEqual([8]);
  });

  it("returns an empty array for a category with no SDG relevance, rather than guessing", () => {
    expect(mapControlCategoryToSdgNumbers("Something entirely new")).toEqual([]);
  });

  it("returns an empty array for null/undefined", () => {
    expect(mapControlCategoryToSdgNumbers(null)).toEqual([]);
    expect(mapControlCategoryToSdgNumbers(undefined)).toEqual([]);
  });

  it("SDG 13 has no relevant Controls.category (honest, not a bug)", () => {
    const sdg13 = SDG_DEFINITIONS.find((s) => s.number === 13);
    expect(sdg13?.relevantCategories).toEqual([]);
  });
});

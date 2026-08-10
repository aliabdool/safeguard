import { describe, expect, it } from "vitest";

import { heatmapCellRag, mapControlCategoryToAssuranceArea } from "./assurance-areas";

describe("mapControlCategoryToAssuranceArea", () => {
  it("maps known categories to their assurance area", () => {
    expect(mapControlCategoryToAssuranceArea("Fire & life safety")).toBe("emergency_prep");
    expect(mapControlCategoryToAssuranceArea("Guest safety")).toBe("hotel_ops");
    expect(mapControlCategoryToAssuranceArea("Incident management")).toBe("incident_mgmt");
    expect(mapControlCategoryToAssuranceArea("Competence")).toBe("competence");
  });
  it("is case-insensitive and trims whitespace", () => {
    expect(mapControlCategoryToAssuranceArea("  fire & life safety  ")).toBe("emergency_prep");
    expect(mapControlCategoryToAssuranceArea("PPE")).toBe("hazard_risk");
  });
  it("returns null for an unrecognised category rather than guessing", () => {
    expect(mapControlCategoryToAssuranceArea("Something entirely new")).toBeNull();
  });
  it("returns null for null/undefined/empty", () => {
    expect(mapControlCategoryToAssuranceArea(null)).toBeNull();
    expect(mapControlCategoryToAssuranceArea(undefined)).toBeNull();
    expect(mapControlCategoryToAssuranceArea("")).toBeNull();
  });
});

describe("heatmapCellRag", () => {
  it("is grey (not red) when there's no score at all", () => {
    expect(heatmapCellRag(null)).toBe("grey");
  });
  it("is red at or below Initial (1)", () => {
    expect(heatmapCellRag(0)).toBe("red");
    expect(heatmapCellRag(1)).toBe("red");
  });
  it("is amber in the middle band", () => {
    expect(heatmapCellRag(1.5)).toBe("amber");
    expect(heatmapCellRag(2.5)).toBe("amber");
  });
  it("is green above the amber band", () => {
    expect(heatmapCellRag(3)).toBe("green");
    expect(heatmapCellRag(4)).toBe("green");
  });
});

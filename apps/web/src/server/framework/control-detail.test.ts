import { describe, expect, it } from "vitest";

import {
  buildLatestScoresByPropertyDimension,
  isValidControlId,
  mapControlFrameworkMappings,
  type RawAssessmentRow,
  type RawMappingRow,
} from "./control-detail";

describe("mapControlFrameworkMappings", () => {
  it("maps a well-formed row", () => {
    const rows: RawMappingRow[] = [
      {
        Frameworks: { code: "ISO45001", name: "ISO 45001" },
        FrameworkRequirements: { clause_reference: "6.1.2" },
      },
    ];
    expect(mapControlFrameworkMappings(rows)).toEqual([
      { frameworkCode: "ISO45001", frameworkName: "ISO 45001", clauseReference: "6.1.2" },
    ]);
  });

  it("excludes a row with a dangling Frameworks join instead of throwing", () => {
    const rows: RawMappingRow[] = [
      { Frameworks: null, FrameworkRequirements: { clause_reference: "6.1.2" } },
      {
        Frameworks: { code: "GRI403", name: "GRI 403" },
        FrameworkRequirements: { clause_reference: null },
      },
    ];
    expect(mapControlFrameworkMappings(rows)).toEqual([
      { frameworkCode: "GRI403", frameworkName: "GRI 403", clauseReference: null },
    ]);
  });

  it("treats a dangling FrameworkRequirements join as a null clause reference, not a crash", () => {
    const rows: RawMappingRow[] = [
      {
        Frameworks: { code: "MU_LEGAL", name: "Mauritius Legal" },
        FrameworkRequirements: null,
      },
    ];
    expect(mapControlFrameworkMappings(rows)).toEqual([
      { frameworkCode: "MU_LEGAL", frameworkName: "Mauritius Legal", clauseReference: null },
    ]);
  });

  it("returns an empty array for no mappings", () => {
    expect(mapControlFrameworkMappings([])).toEqual([]);
  });
});

describe("buildLatestScoresByPropertyDimension", () => {
  function row(overrides: Partial<RawAssessmentRow>): RawAssessmentRow {
    return {
      property_id: "prop-1",
      dimension: "policy",
      maturity_score: "3",
      assessed_at: "2026-01-01 00:00:00",
      ...overrides,
    };
  }

  it("keeps only the most recent score per (property, dimension)", () => {
    const result = buildLatestScoresByPropertyDimension([
      row({ maturity_score: "2", assessed_at: "2026-01-01 00:00:00" }),
      row({ maturity_score: "4", assessed_at: "2026-06-01 00:00:00" }),
    ]);
    expect(result.get("prop-1")?.get("policy")).toBe(4);
  });

  it("keeps dimensions/properties independent", () => {
    const result = buildLatestScoresByPropertyDimension([
      row({ property_id: "prop-1", dimension: "policy", maturity_score: "3" }),
      row({ property_id: "prop-1", dimension: "procedure", maturity_score: "1" }),
      row({ property_id: "prop-2", dimension: "policy", maturity_score: "0" }),
    ]);
    expect(result.get("prop-1")?.get("policy")).toBe(3);
    expect(result.get("prop-1")?.get("procedure")).toBe(1);
    expect(result.get("prop-2")?.get("policy")).toBe(0);
  });

  it("skips a row whose maturity_score doesn't parse, instead of poisoning the map with NaN", () => {
    const result = buildLatestScoresByPropertyDimension([
      row({ maturity_score: "not-a-number", assessed_at: "2026-06-01 00:00:00" }),
      row({ maturity_score: "2", assessed_at: "2026-01-01 00:00:00" }),
    ]);
    expect(result.get("prop-1")?.get("policy")).toBe(2);
  });

  it("returns an empty map for no assessments", () => {
    expect(buildLatestScoresByPropertyDimension([]).size).toBe(0);
  });
});

describe("isValidControlId", () => {
  it("accepts a plausible ROWID", () => {
    expect(isValidControlId("18206000000123456")).toBe(true);
  });

  it("rejects empty or whitespace-only values", () => {
    expect(isValidControlId("")).toBe(false);
    expect(isValidControlId("   ")).toBe(false);
  });

  it("accepts a value containing a single quote — no longer this function's concern, since every "
    + "query built from controlId is escaped via zcqlString() at the call site", () => {
    expect(isValidControlId("abc' or '1'='1")).toBe(true);
  });
});

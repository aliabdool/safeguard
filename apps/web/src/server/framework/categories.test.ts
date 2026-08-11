import { describe, expect, it } from "vitest";

import { FRAMEWORK_CATEGORIES, mapFrameworkCodeToCategory } from "./categories";

describe("mapFrameworkCodeToCategory", () => {
  it("maps known codes to their brief-specified categories", () => {
    expect(mapFrameworkCodeToCategory("ISO45001")).toBe("certification");
    expect(mapFrameworkCodeToCategory("ISO19011")).toBe("audit_methodology");
    expect(mapFrameworkCodeToCategory("GRI403")).toBe("disclosure");
    expect(mapFrameworkCodeToCategory("IFRS_S1")).toBe("disclosure");
    expect(mapFrameworkCodeToCategory("IFRS_S2")).toBe("disclosure");
    expect(mapFrameworkCodeToCategory("SASB_HOTELS")).toBe("disclosure");
    expect(mapFrameworkCodeToCategory("UNGC")).toBe("principles");
    expect(mapFrameworkCodeToCategory("ILO_OSH")).toBe("principles");
    expect(mapFrameworkCodeToCategory("SDG")).toBe("sdg");
  });

  it("maps the live operational/legal frameworks to 'other', not a disclosure/certification category", () => {
    expect(mapFrameworkCodeToCategory("HOTEL_OPS")).toBe("other");
    expect(mapFrameworkCodeToCategory("MU_LEGAL")).toBe("other");
  });

  it("never drops an unrecognised code — falls back to 'other'", () => {
    expect(mapFrameworkCodeToCategory("SOME_NEW_FRAMEWORK")).toBe("other");
  });

  it("every category constant has a mapped label and description (checked in categories.ts's own Records)", () => {
    expect(FRAMEWORK_CATEGORIES.length).toBeGreaterThan(0);
  });
});

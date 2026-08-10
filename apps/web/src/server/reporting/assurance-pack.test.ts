import { describe, expect, it } from "vitest";

import { buildAssurancePackMarkdown } from "./assurance-pack";

describe("buildAssurancePackMarkdown", () => {
  const base = {
    fyLabel: "FY2026",
    propertyLabel: "Sunlife Beach Resort & Spa",
    generatedAt: new Date("2026-07-20"),
    kpis: [],
    criticalGapControlCount: 0,
    openFindings: [],
    capaStatusCounts: {},
    dataQuality: [],
  };

  it("always includes the never-assured disclaimer, at both the top and the bottom", () => {
    const pack = buildAssurancePackMarkdown(base);
    const matches = pack.match(/has NOT been independently assured/g) ?? [];
    expect(matches.length).toBe(2);
  });

  it("states plainly when no critical gaps exist rather than omitting the section", () => {
    const pack = buildAssurancePackMarkdown(base);
    expect(pack).toContain("No controls currently carry a critical-gap flag");
  });

  it("surfaces critical gap count when present", () => {
    const pack = buildAssurancePackMarkdown({ ...base, criticalGapControlCount: 2 });
    expect(pack).toContain("2 control(s) currently carry a critical-gap flag");
  });

  it("lists open findings in a table when present", () => {
    const pack = buildAssurancePackMarkdown({
      ...base,
      openFindings: [
        {
          findingNumber: "DEMO-F-2026-01",
          classification: "critical_nc",
          controlCode: "FIRE-001",
          description: "Fire certificates expired.",
        },
      ],
    });
    expect(pack).toContain("DEMO-F-2026-01");
    expect(pack).toContain("FIRE-001");
  });

  it("only lists data-quality rows with a nonzero count", () => {
    const pack = buildAssurancePackMarkdown({
      ...base,
      dataQuality: [
        { label: "Missing root cause", count: 0, sampleIncidentIds: [] },
        { label: "Corrective actions overdue", count: 4, sampleIncidentIds: [] },
      ],
    });
    expect(pack).not.toContain("| Missing root cause | 0 |");
    expect(pack).toContain("| Corrective actions overdue | 4 |");
  });
});

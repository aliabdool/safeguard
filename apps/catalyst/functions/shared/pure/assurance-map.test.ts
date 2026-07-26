import { describe, expect, it } from "vitest";

import { buildEvidenceMap, type EvidenceMapInputRow } from "./assurance-map";

function row(overrides: Partial<EvidenceMapInputRow> = {}): EvidenceMapInputRow {
  return {
    frameworkCode: "ISO45001",
    requirementRef: "8.1.2",
    requirementTitle: "Hazard identification",
    controlId: "control-1",
    controlCode: "C-01",
    controlTitle: "Fire safety certification",
    propertyId: "prop-la-pirogue",
    departmentId: null,
    latestScores: { policy: 4, procedure: 4, implementation: 4, effectiveness: 4 },
    hasOpenCriticalGap: false,
    evidenceLinks: [{ documentVersionId: "ver-1", isCurrentlyValid: true }],
    linkedKpiCodes: ["ISO45001_READINESS"],
    linkedFindingIds: [],
    linkedCapaIds: [],
    reportRelevant: true,
    ...overrides,
  };
}

describe("buildEvidenceMap — Framework -> Requirement -> Control -> Evidence -> KPI/Finding/CAPA", () => {
  it("filters by framework", () => {
    const rows = [row({ frameworkCode: "ISO45001" }), row({ frameworkCode: "GRI403" })];
    const result = buildEvidenceMap(rows, { frameworkCode: "GRI403" });
    expect(result).toHaveLength(1);
    expect(result[0]?.frameworkCode).toBe("GRI403");
  });

  it("filters by critical gap", () => {
    const rows = [row({ hasOpenCriticalGap: true }), row({ hasOpenCriticalGap: false })];
    const result = buildEvidenceMap(rows, { criticalGapOnly: true });
    expect(result).toHaveLength(1);
    expect(result[0]?.hasCriticalGap).toBe(true);
  });

  it("filters by expired evidence", () => {
    const rows = [
      row({ evidenceLinks: [{ documentVersionId: "v1", isCurrentlyValid: false }] }),
      row({ evidenceLinks: [{ documentVersionId: "v2", isCurrentlyValid: true }] }),
    ];
    const result = buildEvidenceMap(rows, { expiredEvidenceOnly: true });
    expect(result).toHaveLength(1);
    expect(result[0]?.expiredEvidenceCount).toBe(1);
  });

  it("filters by evidence status = missing", () => {
    const rows = [row({ evidenceLinks: [] }), row({ evidenceLinks: [{ documentVersionId: "v1", isCurrentlyValid: true }] })];
    const result = buildEvidenceMap(rows, { evidenceStatus: "missing" });
    expect(result).toHaveLength(1);
    expect(result[0]?.totalEvidenceLinks).toBe(0);
  });

  it("filters by property", () => {
    const rows = [row({ propertyId: "prop-a" }), row({ propertyId: "prop-b" })];
    const result = buildEvidenceMap(rows, { propertyId: "prop-b" });
    expect(result).toHaveLength(1);
  });

  it("filters by report relevance", () => {
    const rows = [row({ reportRelevant: true }), row({ reportRelevant: false })];
    const result = buildEvidenceMap(rows, { reportRelevantOnly: true });
    expect(result).toHaveLength(1);
  });

  it("carries the maturity score through, applying MIN-of-dimension, not average", () => {
    const rows = [row({ latestScores: { policy: 4, procedure: 4, implementation: 4, effectiveness: 1 } })];
    const result = buildEvidenceMap(rows, {});
    expect(result[0]?.maturityScore).toBe(1);
  });

  it("carries linked KPI, finding, and CAPA references through to the display row", () => {
    const rows = [row({ linkedFindingIds: ["finding-1"], linkedCapaIds: ["capa-1"] })];
    const result = buildEvidenceMap(rows, {});
    expect(result[0]?.linkedKpiCodes).toEqual(["ISO45001_READINESS"]);
    expect(result[0]?.linkedFindingIds).toEqual(["finding-1"]);
    expect(result[0]?.linkedCapaIds).toEqual(["capa-1"]);
  });

  it("combining multiple filters narrows to the intersection", () => {
    const rows = [
      row({ frameworkCode: "ISO45001", hasOpenCriticalGap: true, propertyId: "prop-a" }),
      row({ frameworkCode: "ISO45001", hasOpenCriticalGap: false, propertyId: "prop-a" }),
      row({ frameworkCode: "GRI403", hasOpenCriticalGap: true, propertyId: "prop-a" }),
    ];
    const result = buildEvidenceMap(rows, { frameworkCode: "ISO45001", criticalGapOnly: true });
    expect(result).toHaveLength(1);
  });
});

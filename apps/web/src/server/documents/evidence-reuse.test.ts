import { describe, expect, it } from "vitest";

import { computeEvidenceReuseSummary } from "./evidence-reuse";

describe("computeEvidenceReuseSummary", () => {
  it("counts distinct entity types and total links", () => {
    const summary = computeEvidenceReuseSummary({
      links: [
        { linkedEntityType: "audit", linkedEntityId: "a1" },
        { linkedEntityType: "audit", linkedEntityId: "a2" },
        { linkedEntityType: "capa_action", linkedEntityId: "c1" },
      ],
      controlAssessmentControlIds: new Map(),
      controlFrameworkIds: new Map(),
    });
    expect(summary.totalLinks).toBe(3);
    expect(summary.distinctEntityTypes).toBe(2);
    expect(summary.distinctControls).toBe(0);
    expect(summary.distinctFrameworks).toBe(0);
  });

  it("resolves control_assessment links to distinct controls and frameworks", () => {
    const summary = computeEvidenceReuseSummary({
      links: [
        { linkedEntityType: "control_assessment", linkedEntityId: "ca1" },
        { linkedEntityType: "control_assessment", linkedEntityId: "ca2" },
        { linkedEntityType: "control_assessment", linkedEntityId: "ca3" },
      ],
      controlAssessmentControlIds: new Map([
        ["ca1", "ctrl-fire"],
        ["ca2", "ctrl-fire"], // same control, different assessment dimension row
        ["ca3", "ctrl-ptw"],
      ]),
      controlFrameworkIds: new Map([
        ["ctrl-fire", ["fw-iso", "fw-legal"]],
        ["ctrl-ptw", ["fw-iso"]],
      ]),
    });
    expect(summary.distinctControls).toBe(2);
    expect(summary.distinctFrameworks).toBe(2); // fw-iso and fw-legal, not double-counted
  });

  it("does not count a control_assessment link that has no resolvable control", () => {
    const summary = computeEvidenceReuseSummary({
      links: [{ linkedEntityType: "control_assessment", linkedEntityId: "unknown" }],
      controlAssessmentControlIds: new Map(),
      controlFrameworkIds: new Map(),
    });
    expect(summary.distinctControls).toBe(0);
    expect(summary.distinctFrameworks).toBe(0);
  });
});

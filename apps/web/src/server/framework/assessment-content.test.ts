import { describe, expect, it } from "vitest";

import { getAssessmentGuidance, type AssessmentDimension } from "./assessment-content";

const DIMENSIONS: AssessmentDimension[] = [
  "policy",
  "procedure",
  "implementation",
  "effectiveness",
];

describe("getAssessmentGuidance", () => {
  it("returns non-empty guidance for every dimension", () => {
    for (const dimension of DIMENSIONS) {
      const guidance = getAssessmentGuidance(
        { title: "Fire extinguisher inspection", category: "Fire & life safety" },
        dimension,
      );
      expect(guidance.question.length).toBeGreaterThan(0);
      expect(guidance.whyItMatters.length).toBeGreaterThan(0);
      expect(guidance.whatGoodLooksLike.length).toBeGreaterThan(0);
      expect(guidance.evidenceExamples.length).toBeGreaterThan(0);
    }
  });

  it("interpolates the control's title into the question", () => {
    const guidance = getAssessmentGuidance(
      { title: "Hot work permit", category: "High-risk work control" },
      "policy",
    );
    expect(guidance.question).toContain("Hot work permit");
  });

  it("handles a null category without throwing", () => {
    const guidance = getAssessmentGuidance(
      { title: "Some control", category: null },
      "procedure",
    );
    expect(guidance.question).toContain("Some control");
  });
});

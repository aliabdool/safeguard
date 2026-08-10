import { describe, expect, it } from "vitest";

import { generateExecutiveNarrative, type NarrativeInput } from "./narrative";

function baseInput(overrides: Partial<NarrativeInput> = {}): NarrativeInput {
  return {
    scopeLabel: "Sunlife Group",
    fyLabel: "FY2027",
    totalIncidentsCurrent: 10,
    totalIncidentsComparison: 15,
    highPotentialCurrent: 0,
    managementAttention: [],
    businessUnitRows: [],
    frameworkReadiness: [],
    dataQuality: [],
    ...overrides,
  };
}

describe("generateExecutiveNarrative", () => {
  it("shows a restrained positive state when there are no exceptions", () => {
    const result = generateExecutiveNarrative(baseInput());
    expect(result.managementSummary).toContain("No critical management exceptions");
  });

  it("counts critical exceptions in the management summary", () => {
    const result = generateExecutiveNarrative(
      baseInput({
        managementAttention: [
          { severity: "critical", businessUnitName: "La Pirogue", message: "x" },
          { severity: "high", businessUnitName: "Sugar Beach", message: "y" },
        ],
      }),
    );
    expect(result.managementSummary).toContain("1 matter");
  });

  it("describes a decreasing incident trend", () => {
    const result = generateExecutiveNarrative(
      baseInput({ totalIncidentsCurrent: 5, totalIncidentsComparison: 10 }),
    );
    expect(result.keyChange).toContain("decreased");
  });

  it("never includes a person's name — only aggregate facts", () => {
    const result = generateExecutiveNarrative(
      baseInput({
        managementAttention: [
          { severity: "critical", businessUnitName: "La Pirogue", message: "Fatality recorded." },
        ],
      }),
    );
    const allText = JSON.stringify(result);
    expect(allText).not.toMatch(/John|Jane|Doe/);
  });

  it("lists required decisions from critical items", () => {
    const result = generateExecutiveNarrative(
      baseInput({
        managementAttention: [
          { severity: "critical", businessUnitName: "La Pirogue", message: "Overdue CAPA." },
        ],
      }),
    );
    expect(result.requiredDecisions).toHaveLength(1);
    expect(result.requiredDecisions[0]).toContain("La Pirogue");
  });

  it("falls back to a no-decisions message when nothing is critical", () => {
    const result = generateExecutiveNarrative(baseInput());
    expect(result.requiredDecisions[0]).toContain("No management decisions are required");
  });
});

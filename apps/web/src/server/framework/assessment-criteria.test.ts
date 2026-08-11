import { describe, expect, it } from "vitest";

import { assertZcqlSafe } from "@/lib/testing/zcql-assertions";

import { buildExistingAssessmentCriteria } from "./assessment-criteria";

const BASE = {
  controlId: "18206000000079045",
  propertyId: "18206000000042391",
  departmentId: "18206000000042761" as string | null,
  periodLabel: "FY2026-Q2",
  dimension: "policy",
};

describe("buildExistingAssessmentCriteria", () => {
  it("builds a plain criteria string for well-formed input", () => {
    const criteria = buildExistingAssessmentCriteria(BASE);
    expect(criteria).toBe(
      "ControlAssessments.control_id = '18206000000079045' and " +
        "ControlAssessments.property_id = '18206000000042391' and " +
        "ControlAssessments.department_id = '18206000000042761' and " +
        "ControlAssessments.period_label = 'FY2026-Q2' and " +
        "ControlAssessments.dimension = 'policy'",
    );
  });

  it("renders a null departmentId as an IS NULL clause, not an empty-string comparison", () => {
    const criteria = buildExistingAssessmentCriteria({ ...BASE, departmentId: null });
    expect(criteria).toContain("ControlAssessments.department_id is null");
    expect(criteria).not.toContain("department_id = ''");
  });

  // The exact values from the live incident and the user's requested regression set — each must
  // produce a criteria string that passes the same ZCQL-safety contract every other query in this
  // app is held to, never a broken/truncated literal.
  it.each([
    ["FY2026-Q2", BASE.periodLabel],
    ["Q2'26", "Q2'26"],
    ["Manager's Review", "Manager's Review"],
    ["O'Brien", "O'Brien"],
    ["multiple quotes", "'''"],
    ["empty string", ""],
  ])("stays ZCQL-safe for periodLabel = %s", (_label, periodLabel) => {
    const criteria = buildExistingAssessmentCriteria({ ...BASE, periodLabel });
    expect(() => assertZcqlSafe(criteria, "buildExistingAssessmentCriteria")).not.toThrow();
    // The value must round-trip as a quoted, escaped literal — every embedded quote doubled.
    expect(criteria).toContain(`'${periodLabel.replace(/'/g, "''")}'`);
  });

  it("also escapes an apostrophe in departmentId, controlId, propertyId, and dimension", () => {
    const criteria = buildExistingAssessmentCriteria({
      controlId: "abc' or '1'='1",
      propertyId: "prop' or '1'='1",
      departmentId: "dept' or '1'='1",
      periodLabel: "FY2026-Q2",
      dimension: "polic'y",
    });
    expect(() => assertZcqlSafe(criteria, "buildExistingAssessmentCriteria")).not.toThrow();
    expect(criteria).toContain("'abc'' or ''1''=''1'");
    expect(criteria).toContain("'prop'' or ''1''=''1'");
    expect(criteria).toContain("'dept'' or ''1''=''1'");
    expect(criteria).toContain("'polic''y'");
  });
});

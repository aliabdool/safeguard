/**
 * Pure ZCQL-criteria builder extracted from createControlAssessmentAction (see
 * app/(app)/framework/controls/actions.ts) — no DB, no server-only, directly unit-testable, so the
 * escaping this function is responsible for is actually covered instead of only reachable through
 * a live form submission (same rationale as control-detail.ts's extraction).
 */

import { zcqlString } from "@/lib/catalyst/zcql-escape";

export interface ExistingAssessmentLookup {
  controlId: string;
  propertyId: string;
  departmentId: string | null;
  periodLabel: string;
  dimension: string;
}

/**
 * Builds the "does an assessment already exist for this (control, property, department, period,
 * dimension) tuple" lookup criteria. Every value is user-controlled — periodLabel and notes are
 * free text an assessor can type an apostrophe into (e.g. "Q2'26", "Manager's Review", "O'Brien")
 * — so every one of them goes through zcqlString() rather than raw interpolation. Previously
 * periodLabel was interpolated unescaped here and a single quote in it broke the query with a ZCQL
 * syntax error, 500ing the save (see chat: reproduced live against ControlAssessments.period_label).
 */
export function buildExistingAssessmentCriteria(input: ExistingAssessmentLookup): string {
  const departmentClause = input.departmentId
    ? `ControlAssessments.department_id = ${zcqlString(input.departmentId)}`
    : `ControlAssessments.department_id is null`;
  return (
    `ControlAssessments.control_id = ${zcqlString(input.controlId)} and ` +
    `ControlAssessments.property_id = ${zcqlString(input.propertyId)} and ` +
    `${departmentClause} and ` +
    `ControlAssessments.period_label = ${zcqlString(input.periodLabel)} and ` +
    `ControlAssessments.dimension = ${zcqlString(input.dimension)}`
  );
}

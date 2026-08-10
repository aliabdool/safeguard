/**
 * Pure validation/calculation rules for the incident wizard — no "server-only", no DB/network
 * imports, so they're directly unit-testable (same convention as server/permissions/pure.ts).
 */

/** high_potential = potential >= 4 OR actual >= 4 (brief Step 5) — no manual override. */
export function computeHighPotential(
  actualSeverity: number,
  potentialSeverity: number,
): boolean {
  return actualSeverity >= 4 || potentialSeverity >= 4;
}

export interface TypeSelectionInput {
  code: string;
  isPrimary: boolean;
}

export type TypeSelectionResult =
  { ok: true; primaryCode: string; codes: string[] } | { ok: false; error: string };

/**
 * Enforces the IncidentTypeSelections submission invariants (see chat): at least one type, exactly
 * one primary, no duplicate codes. Data Store has no composite-unique enforcement we can rely on
 * for (incident_id, type_code), so this is the actual duplicate/primary guard.
 */
export function validateTypeSelections(selections: TypeSelectionInput[]): TypeSelectionResult {
  if (selections.length === 0) {
    return { ok: false, error: "Select at least one incident type." };
  }

  const codes = selections.map((s) => s.code);
  const uniqueCodes = new Set(codes);
  if (uniqueCodes.size !== codes.length) {
    return { ok: false, error: "The same incident type was selected more than once." };
  }

  const primaries = selections.filter((s) => s.isPrimary);
  if (primaries.length === 0) {
    return { ok: false, error: "One incident type must be marked as primary." };
  }
  if (primaries.length > 1) {
    return { ok: false, error: "Only one incident type can be marked as primary." };
  }

  return { ok: true, primaryCode: primaries[0]!.code, codes };
}

/** Outcomes that can only be recorded when at least one person is affected — see chat. */
export const INJURY_ONLY_OUTCOMES = [
  "first_aid",
  "medical_treatment",
  "restricted_work",
  "lost_time_injury",
  "hospitalisation",
  "permanent_impairment",
  "fatality",
] as const;

export type PersonInjuryConsistencyResult = { ok: true } | { ok: false; error: string };

/**
 * Enforces the person/injury consistency rule from the priority remediation brief (see chat): an
 * injury-implying outcome (first aid, medical treatment, hospitalisation, etc.) is invalid without
 * at least one affected person, and "no person affected" must always pair with a "no injury /
 * not applicable" outcome — the exact invalid state the live browser test surfaced ("Persons
 * affected: None" + "Outcome: First aid only"). Shared between the client-side wizard step
 * validation and the server action so neither can be bypassed independently of the other.
 */
export function validatePersonInjuryConsistency(
  personsAffected: "yes" | "no",
  personCount: number,
  outcome: string,
): PersonInjuryConsistencyResult {
  if (personsAffected === "no") {
    if (personCount > 0) {
      return {
        ok: false,
        error: "No affected persons should be recorded when 'No person affected' is selected.",
      };
    }
    if (outcome !== "no_injury") {
      return {
        ok: false,
        error:
          "An injury/medical outcome cannot be recorded without at least one affected person. Select 'No injury / Not applicable', or go back and add the affected person(s).",
      };
    }
    return { ok: true };
  }

  // personsAffected === "yes"
  if (personCount === 0) {
    return { ok: false, error: "Add at least one affected person." };
  }
  return { ok: true };
}

export interface WitnessOwnerInput {
  incidentId?: string | null;
  investigationId?: string | null;
}

/**
 * IncidentWitnesses must never be orphaned: incident_id != null OR investigation_id != null (see
 * chat — the table is shared between report-time witnesses and investigation-stage witnesses now
 * that both columns are nullable).
 */
export function isValidWitnessOwner(input: WitnessOwnerInput): boolean {
  return Boolean(input.incidentId) || Boolean(input.investigationId);
}

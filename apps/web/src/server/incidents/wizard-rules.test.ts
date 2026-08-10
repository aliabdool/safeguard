import { describe, expect, it } from "vitest";

import {
  computeHighPotential,
  isValidWitnessOwner,
  validatePersonInjuryConsistency,
  validateTypeSelections,
} from "./wizard-rules";

describe("computeHighPotential", () => {
  it("is false when both severities are below 4", () => {
    expect(computeHighPotential(1, 3)).toBe(false);
  });
  it("is true when actual severity is 4 or more", () => {
    expect(computeHighPotential(4, 1)).toBe(true);
  });
  it("is true when potential severity is 4 or more", () => {
    expect(computeHighPotential(1, 5)).toBe(true);
  });
});

describe("validateTypeSelections", () => {
  it("rejects zero selections", () => {
    const result = validateTypeSelections([]);
    expect(result.ok).toBe(false);
  });

  it("rejects duplicate type codes", () => {
    const result = validateTypeSelections([
      { code: "injury", isPrimary: true },
      { code: "injury", isPrimary: false },
    ]);
    expect(result.ok).toBe(false);
  });

  it("rejects zero primary selections", () => {
    const result = validateTypeSelections([
      { code: "injury", isPrimary: false },
      { code: "near_miss", isPrimary: false },
    ]);
    expect(result.ok).toBe(false);
  });

  it("rejects more than one primary selection", () => {
    const result = validateTypeSelections([
      { code: "injury", isPrimary: true },
      { code: "near_miss", isPrimary: true },
    ]);
    expect(result.ok).toBe(false);
  });

  it("accepts exactly one primary among multiple types", () => {
    const result = validateTypeSelections([
      { code: "injury", isPrimary: true },
      { code: "near_miss", isPrimary: false },
      { code: "fire_smoke", isPrimary: false },
    ]);
    expect(result).toEqual({
      ok: true,
      primaryCode: "injury",
      codes: ["injury", "near_miss", "fire_smoke"],
    });
  });
});

describe("validatePersonInjuryConsistency", () => {
  it("rejects the exact reported defect: no persons but an injury outcome", () => {
    const result = validatePersonInjuryConsistency("no", 0, "first_aid");
    expect(result.ok).toBe(false);
  });
  it("rejects every injury-implying outcome without a person", () => {
    for (const outcome of [
      "first_aid",
      "medical_treatment",
      "restricted_work",
      "lost_time_injury",
      "hospitalisation",
      "permanent_impairment",
      "fatality",
    ]) {
      expect(validatePersonInjuryConsistency("no", 0, outcome).ok).toBe(false);
    }
  });
  it("accepts no persons with no_injury outcome", () => {
    expect(validatePersonInjuryConsistency("no", 0, "no_injury")).toEqual({ ok: true });
  });
  it("rejects persons recorded when 'no person affected' is selected", () => {
    const result = validatePersonInjuryConsistency("no", 1, "no_injury");
    expect(result.ok).toBe(false);
  });
  it("rejects zero persons when 'yes' is selected", () => {
    const result = validatePersonInjuryConsistency("yes", 0, "no_injury");
    expect(result.ok).toBe(false);
  });
  it("accepts a person affected with any outcome, including no_injury", () => {
    expect(validatePersonInjuryConsistency("yes", 1, "no_injury")).toEqual({ ok: true });
    expect(validatePersonInjuryConsistency("yes", 1, "first_aid")).toEqual({ ok: true });
    expect(validatePersonInjuryConsistency("yes", 2, "hospitalisation")).toEqual({ ok: true });
  });
});

describe("isValidWitnessOwner", () => {
  it("rejects an orphan witness with neither owner", () => {
    expect(isValidWitnessOwner({})).toBe(false);
    expect(isValidWitnessOwner({ incidentId: null, investigationId: null })).toBe(false);
  });
  it("accepts a report-time witness with only incidentId", () => {
    expect(isValidWitnessOwner({ incidentId: "inc-1" })).toBe(true);
  });
  it("accepts an investigation-stage witness with only investigationId", () => {
    expect(isValidWitnessOwner({ investigationId: "inv-1" })).toBe(true);
  });
  it("accepts a witness with both set", () => {
    expect(isValidWitnessOwner({ incidentId: "inc-1", investigationId: "inv-1" })).toBe(true);
  });
});

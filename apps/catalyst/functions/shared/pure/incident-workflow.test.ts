import { describe, expect, it } from "vitest";

import {
  defaultOshReportableStatus,
  isValidPersonEventType,
  isValidStatusTransition,
  PERSON_EVENT_TYPES,
} from "./incident-workflow";

describe("PERSON_EVENT_TYPES / isValidPersonEventType", () => {
  it("accepts exactly the six brief-approved types", () => {
    expect(PERSON_EVENT_TYPES).toEqual([
      "employee",
      "trainee",
      "guest",
      "contractor",
      "near_miss",
      "unsafe_condition",
    ]);
  });
  it("rejects anything outside the six", () => {
    expect(isValidPersonEventType("visitor")).toBe(false);
    expect(isValidPersonEventType("supplier")).toBe(false);
    expect(isValidPersonEventType("")).toBe(false);
  });
  it("accepts every one of the six", () => {
    for (const t of PERSON_EVENT_TYPES) {
      expect(isValidPersonEventType(t)).toBe(true);
    }
  });
});

describe("isValidStatusTransition", () => {
  it("allows the forward workflow one step at a time", () => {
    expect(isValidStatusTransition("reported", "investigating")).toBe(true);
    expect(isValidStatusTransition("investigating", "corrective_action")).toBe(true);
    expect(isValidStatusTransition("corrective_action", "verifying")).toBe(true);
    expect(isValidStatusTransition("verifying", "closed")).toBe(true);
  });
  it("rejects skipping steps", () => {
    expect(isValidStatusTransition("reported", "closed")).toBe(false);
    expect(isValidStatusTransition("reported", "corrective_action")).toBe(false);
  });
  it("rejects moving backwards, except re-opening a closed incident", () => {
    expect(isValidStatusTransition("verifying", "investigating")).toBe(false);
    expect(isValidStatusTransition("corrective_action", "reported")).toBe(false);
    expect(isValidStatusTransition("closed", "investigating")).toBe(true);
  });
  it("rejects a no-op transition", () => {
    expect(isValidStatusTransition("investigating", "investigating")).toBe(false);
  });
});

describe("defaultOshReportableStatus", () => {
  it("is always pending_determination — never guessed as yes or no by the app", () => {
    expect(defaultOshReportableStatus()).toBe("pending_determination");
  });
});

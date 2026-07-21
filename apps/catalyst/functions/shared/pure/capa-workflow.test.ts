import { describe, expect, it } from "vitest";

import {
  isValidCapaStatus,
  isValidCapaStatusTransition,
  isValidOwnerVerifierPair,
} from "./capa-workflow";

describe("isValidCapaStatus", () => {
  it("accepts the five known statuses", () => {
    for (const s of ["open", "in_progress", "pending_verification", "verified", "closed"]) {
      expect(isValidCapaStatus(s)).toBe(true);
    }
  });
  it("rejects anything else", () => {
    expect(isValidCapaStatus("cancelled")).toBe(false);
  });
});

describe("isValidCapaStatusTransition", () => {
  it("allows the forward workflow", () => {
    expect(isValidCapaStatusTransition("open", "in_progress")).toBe(true);
    expect(isValidCapaStatusTransition("in_progress", "pending_verification")).toBe(true);
    expect(isValidCapaStatusTransition("pending_verification", "verified")).toBe(true);
    expect(isValidCapaStatusTransition("verified", "closed")).toBe(true);
  });
  it("cannot skip straight from open to verified", () => {
    expect(isValidCapaStatusTransition("open", "verified")).toBe(false);
  });
  it("cannot skip straight from open to closed", () => {
    expect(isValidCapaStatusTransition("open", "closed")).toBe(false);
  });
  it("a verifier can send work back to the owner", () => {
    expect(isValidCapaStatusTransition("pending_verification", "in_progress")).toBe(true);
  });
  it("a closed CAPA can be reopened to in_progress", () => {
    expect(isValidCapaStatusTransition("closed", "in_progress")).toBe(true);
  });
  it("a closed CAPA cannot jump back to pending_verification", () => {
    expect(isValidCapaStatusTransition("closed", "pending_verification")).toBe(false);
  });
});

describe("isValidOwnerVerifierPair — the rule management named by name", () => {
  it("rejects the owner and verifier being the same person", () => {
    expect(isValidOwnerVerifierPair("user-1", "user-1")).toBe(false);
  });
  it("accepts two different people", () => {
    expect(isValidOwnerVerifierPair("user-1", "user-2")).toBe(true);
  });
  it("rejects an empty owner or verifier id", () => {
    expect(isValidOwnerVerifierPair("", "user-2")).toBe(false);
    expect(isValidOwnerVerifierPair("user-1", "")).toBe(false);
  });
});

import { describe, expect, it } from "vitest";

import {
  isDocumentExpired,
  isReviewDue,
  isValidDocumentStatusTransition,
  isValidEvidence,
} from "./document-rules";

const ASOF = new Date("2026-07-21T00:00:00Z");

describe("isDocumentExpired", () => {
  it("a document with no expiry date never expires", () => {
    expect(isDocumentExpired(null, ASOF)).toBe(false);
  });
  it("is true once the expiry date is in the past", () => {
    expect(isDocumentExpired("2026-01-01", ASOF)).toBe(true);
  });
  it("is false while the expiry date is still in the future", () => {
    expect(isDocumentExpired("2027-01-01", ASOF)).toBe(false);
  });
});

describe("isReviewDue", () => {
  it("is true once the review date has passed", () => {
    expect(isReviewDue("2026-01-01", ASOF)).toBe(true);
  });
});

describe("isValidDocumentStatusTransition", () => {
  it("allows the approval workflow forward", () => {
    expect(isValidDocumentStatusTransition("draft", "pending_approval")).toBe(true);
    expect(isValidDocumentStatusTransition("pending_approval", "approved")).toBe(true);
  });
  it("a rejected document goes back to draft, not straight to approved", () => {
    expect(isValidDocumentStatusTransition("rejected", "approved")).toBe(false);
    expect(isValidDocumentStatusTransition("rejected", "draft")).toBe(true);
  });
  it("an approved document can only be superseded, not silently edited back to draft", () => {
    expect(isValidDocumentStatusTransition("approved", "draft")).toBe(false);
    expect(isValidDocumentStatusTransition("approved", "superseded")).toBe(true);
  });
});

describe("isValidEvidence — expired evidence must never silently count as valid", () => {
  it("an approved, unexpired document is valid evidence", () => {
    expect(isValidEvidence({ expiryDate: "2027-01-01", status: "approved" }, ASOF)).toBe(true);
  });
  it("an approved but expired document is NOT valid evidence", () => {
    expect(isValidEvidence({ expiryDate: "2026-01-01", status: "approved" }, ASOF)).toBe(false);
  });
  it("a draft document is never valid evidence regardless of expiry", () => {
    expect(isValidEvidence({ expiryDate: "2027-01-01", status: "draft" }, ASOF)).toBe(false);
  });
});

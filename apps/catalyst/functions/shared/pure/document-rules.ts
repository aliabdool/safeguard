/**
 * Pure document/evidence rules — no Data Store/network imports. New in Phase 7.
 */

/** A document with no expiry date never "expires" (e.g. a policy with no statutory renewal
 * cycle) — only documents that carry an expiry_date can be expired. */
export function isDocumentExpired(expiryDate: string | null, asOf: Date): boolean {
  if (!expiryDate) return false;
  return new Date(`${expiryDate}T23:59:59Z`) < asOf;
}

export function isReviewDue(reviewDate: string | null, asOf: Date): boolean {
  if (!reviewDate) return false;
  return new Date(`${reviewDate}T23:59:59Z`) < asOf;
}

export type DocumentApprovalStatus = "draft" | "pending_approval" | "approved" | "rejected" | "superseded";

const ALLOWED_TRANSITIONS: Record<DocumentApprovalStatus, readonly DocumentApprovalStatus[]> = {
  draft: ["pending_approval"],
  pending_approval: ["approved", "rejected"],
  approved: ["superseded"],
  rejected: ["draft"],
  superseded: [],
};

export function isValidDocumentStatusTransition(
  from: DocumentApprovalStatus,
  to: DocumentApprovalStatus,
): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

/**
 * The rule management named explicitly: an expired document must never silently count as valid
 * evidence just because a link row exists. Evidence validity is a function of the CURRENT date
 * against the document's expiry, evaluated every time it's used as evidence — never cached as a
 * one-time "is valid" flag on the link itself.
 */
export function isValidEvidence(params: { expiryDate: string | null; status: DocumentApprovalStatus }, asOf: Date): boolean {
  if (params.status !== "approved") return false;
  return !isDocumentExpired(params.expiryDate, asOf);
}

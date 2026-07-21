/**
 * Pure CAPA workflow rules — no Data Store/network imports, unit-testable in plain Node. New in
 * Phase 6. Statuses match what api-dashboard-summary/index.ts's getCapaStatus() already assumes
 * (open / in_progress / pending_verification / verified / closed) — that endpoint was built
 * ahead of this module on purpose, so this module has to match its shape, not the other way round.
 */

export const CAPA_STATUSES = [
  "open",
  "in_progress",
  "pending_verification",
  "verified",
  "closed",
] as const;
export type CapaStatus = (typeof CAPA_STATUSES)[number];

export function isValidCapaStatus(value: string): value is CapaStatus {
  return (CAPA_STATUSES as readonly string[]).includes(value);
}

/** Forward workflow, plus the two legitimate backward moves: a verifier sending work back to the
 * owner (pending_verification -> in_progress), and reopening a closed CAPA if something regresses
 * (closed -> in_progress). Every other backward move is invalid. */
const ALLOWED_TRANSITIONS: Record<CapaStatus, readonly CapaStatus[]> = {
  open: ["in_progress"],
  in_progress: ["pending_verification"],
  pending_verification: ["verified", "in_progress"],
  verified: ["closed"],
  closed: ["in_progress"],
};

export function isValidCapaStatusTransition(from: CapaStatus, to: CapaStatus): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

export type CapaVerificationOutcome = "verified" | "rejected";

/**
 * The rule management named explicitly, by name: "CAPA owner and verifier must always be
 * different people." This is checked at CAPA creation/reassignment AND re-checked, defensively,
 * at the moment of verification — a constraint that only held when the record was created is not
 * good enough if anything downstream is ever allowed to edit ownerId/verifierId independently.
 */
export function isValidOwnerVerifierPair(ownerId: string, verifierId: string): boolean {
  return ownerId.length > 0 && verifierId.length > 0 && ownerId !== verifierId;
}

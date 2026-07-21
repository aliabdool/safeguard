/**
 * Pure incident-workflow logic — no Data Store, no framework import. New for the Catalyst
 * migration (the Supabase build enforced status/person-type validity via Postgres enum columns;
 * Data Store has no enum column type, so this now has to be an explicit application-layer check
 * instead of a database constraint).
 */

/** Brief §3.A / §Improvement 4's exact six person/event types — a deliberately smaller set than
 * the Supabase build's ten (which also had visitor/supplier/public/none). Matches what was
 * explicitly approved for this migration; the fuller set can be reinstated later if needed. */
export const PERSON_EVENT_TYPES = [
  "employee",
  "trainee",
  "guest",
  "contractor",
  "near_miss",
  "unsafe_condition",
] as const;
export type PersonEventType = (typeof PERSON_EVENT_TYPES)[number];

export function isValidPersonEventType(value: string): value is PersonEventType {
  return (PERSON_EVENT_TYPES as readonly string[]).includes(value);
}

export const INCIDENT_STATUSES = [
  "reported",
  "investigating",
  "corrective_action",
  "verifying",
  "closed",
] as const;
export type IncidentStatus = (typeof INCIDENT_STATUSES)[number];

/** Forward-only by default (reported -> investigating -> corrective_action -> verifying ->
 * closed), matching the Supabase build's workflow, but allows stepping back from `closed` to
 * `investigating` (re-opening) since a closed incident can genuinely need to be revisited — no
 * other backward transition is allowed. */
const ALLOWED_TRANSITIONS: Record<IncidentStatus, IncidentStatus[]> = {
  reported: ["investigating"],
  investigating: ["corrective_action"],
  corrective_action: ["verifying"],
  verifying: ["closed"],
  closed: ["investigating"],
};

export function isValidStatusTransition(from: IncidentStatus, to: IncidentStatus): boolean {
  if (from === to) return false;
  return ALLOWED_TRANSITIONS[from].includes(to);
}

export type OshReportableStatus = "yes" | "no" | "pending_determination";

/**
 * Hospital referral and statutory OSH reportability are independent facts about an incident —
 * neither may be derived from the other, in either direction. This is why the default is always
 * "pending_determination" regardless of person/event type or hospital-referral value: some H&S
 * regimes (e.g. UK RIDDOR) do require statutory notification for certain near-miss "dangerous
 * occurrences," so even a near-miss must never be auto-defaulted to "no" — only a person
 * reviewing the incident may make that determination (brief requirement #3, test case: "Hospital
 * referral and statutory OSH reportability remain separate fields").
 */
export function defaultOshReportableStatus(): OshReportableStatus {
  return "pending_determination";
}

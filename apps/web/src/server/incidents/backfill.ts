/**
 * Pure planning logic for the historical Incidents.financial_year / Incidents.incident_prefix
 * backfill (see chat: pre-migration demo rows such as LP-2026-000152 have both columns null).
 * Deliberately scoped to ONLY these two columns — Incidents.incident_number and
 * Incidents.incident_sequence are never touched here (per explicit instruction: numbering is a
 * concurrency-safe allocation scheme, not a derivable value, and must never be rewritten).
 *
 * No DB, no server-only — the plan*() functions here are directly unit-testable. The server-only
 * runner that actually fetches live rows and (optionally) applies the plan lives in
 * run-backfill.ts and is NOT wired into any route/cron/admin action yet — per explicit
 * instruction, this backfill must not execute against live data until Catalyst access returns,
 * a dry run has been reviewed, and the user has explicitly approved execution.
 */

import { financialYearFor } from "@/server/kpi/period";

export interface IncidentFinancialYearInput {
  id: string;
  occurredAt: Date;
  financialYear: string | null;
}

export interface FinancialYearBackfillEntry {
  incidentId: string;
  before: string | null;
  after: string;
}

/**
 * Plans Incidents.financial_year updates, derived from occurred_at via the exact same Jul-Jun FY
 * rule (financialYearFor) live incident creation already uses (see wizard-actions.ts) — never a
 * separately re-implemented rule that could silently drift from it. Idempotent: a row whose
 * financial_year already matches the derived value produces no plan entry, so re-running this
 * planner (e.g. after a partial apply, or a second dry run) against the same data is a no-op for
 * rows already backfilled.
 */
export function planFinancialYearBackfill(
  incidents: IncidentFinancialYearInput[],
): FinancialYearBackfillEntry[] {
  const entries: FinancialYearBackfillEntry[] = [];
  for (const incident of incidents) {
    const { fyLabel } = financialYearFor(incident.occurredAt);
    if (incident.financialYear !== fyLabel) {
      entries.push({
        incidentId: incident.id,
        before: incident.financialYear,
        after: fyLabel,
      });
    }
  }
  return entries;
}

export interface IncidentPrefixInput {
  id: string;
  propertyId: string | null;
  incidentPrefix: string | null;
}

export interface IncidentPrefixBackfillEntry {
  incidentId: string;
  before: string | null;
  after: string;
}

export interface IncidentPrefixSkip {
  incidentId: string;
  reason: string;
}

export interface IncidentPrefixBackfillPlan {
  entries: IncidentPrefixBackfillEntry[];
  skipped: IncidentPrefixSkip[];
}

/**
 * Plans Incidents.incident_prefix updates, derived from the incident's Properties.incident_prefix
 * (never guessed or defaulted — a property with no configured prefix produces an explicit skip,
 * not a fabricated value). Idempotent: an incident whose incident_prefix already matches its
 * property's configured prefix produces no plan entry. `propertyPrefixById` is the caller's
 * already-fetched Properties.incident_prefix lookup (kept out of this pure function so it stays
 * DB-free and independently testable).
 */
export function planIncidentPrefixBackfill(
  incidents: IncidentPrefixInput[],
  propertyPrefixById: ReadonlyMap<string, string | null>,
): IncidentPrefixBackfillPlan {
  const entries: IncidentPrefixBackfillEntry[] = [];
  const skipped: IncidentPrefixSkip[] = [];

  for (const incident of incidents) {
    if (!incident.propertyId) {
      skipped.push({ incidentId: incident.id, reason: "Incident has no property_id." });
      continue;
    }
    if (!propertyPrefixById.has(incident.propertyId)) {
      skipped.push({
        incidentId: incident.id,
        reason: `Referenced property ${incident.propertyId} could not be found.`,
      });
      continue;
    }
    const prefix = propertyPrefixById.get(incident.propertyId) ?? null;
    if (!prefix) {
      skipped.push({
        incidentId: incident.id,
        reason: `Property ${incident.propertyId} has no incident_prefix configured.`,
      });
      continue;
    }
    if (incident.incidentPrefix !== prefix) {
      entries.push({
        incidentId: incident.id,
        before: incident.incidentPrefix,
        after: prefix,
      });
    }
  }

  return { entries, skipped };
}

export interface BackfillSummary {
  totalScanned: number;
  financialYearChanges: number;
  incidentPrefixChanges: number;
  incidentPrefixSkipped: number;
}

export function summarizeBackfillPlan(
  totalScanned: number,
  financialYearEntries: FinancialYearBackfillEntry[],
  prefixPlan: IncidentPrefixBackfillPlan,
): BackfillSummary {
  return {
    totalScanned,
    financialYearChanges: financialYearEntries.length,
    incidentPrefixChanges: prefixPlan.entries.length,
    incidentPrefixSkipped: prefixPlan.skipped.length,
  };
}

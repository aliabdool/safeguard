import "server-only";

import type { CatalystApp } from "@/lib/catalyst/app";

import {
  planFinancialYearBackfill,
  planIncidentPrefixBackfill,
  summarizeBackfillPlan,
  type BackfillSummary,
  type FinancialYearBackfillEntry,
  type IncidentPrefixBackfillPlan,
} from "./backfill";

/**
 * ============================================================================================
 * NOT WIRED TO ANY ROUTE, ACTION, OR CRON JOB. Do not call runFinancialYearAndPrefixBackfill()
 * with dryRun: false against live data.
 *
 * Per explicit instruction (see chat): this backfill must not execute until Catalyst access has
 * returned, a dry run has been reviewed, and execution has been explicitly approved. When that
 * happens, the live sequence is: (1) live AppSail log inspection is unrelated/already done,
 * (2) live historical-data gap analysis/quantification, (3) run this function with dryRun: true
 * and review the returned plan, (4) only after approval, run again with dryRun: false.
 *
 * Scope is deliberately narrow: Incidents.financial_year and Incidents.incident_prefix only.
 * Incidents.incident_number and Incidents.incident_sequence are never read for planning purposes
 * and never written here — see backfill.ts's own doc comment for why.
 * ============================================================================================
 */

interface IncidentRawRow {
  ROWID: string;
  occurred_at: string;
  property_id: string | null;
  financial_year: string | null;
  incident_prefix: string | null;
}

/** Not `extends CatalystRow` — `incident_prefix` is genuinely nullable, which conflicts with
 * CatalystRow's `Record<string, string>` index signature (same reasoning as ControlRow in
 * assurance-heatmap.ts). */
interface PropertyRawRow {
  ROWID: string;
  incident_prefix: string | null;
}

export interface BackfillResult {
  summary: BackfillSummary;
  financialYearPlan: FinancialYearBackfillEntry[];
  incidentPrefixPlan: IncidentPrefixBackfillPlan;
  applied: boolean;
  errors: Array<{
    incidentId: string;
    column: "financial_year" | "incident_prefix";
    message: string;
  }>;
}

/**
 * Builds the backfill plan from live Incidents/Properties data and, only when `dryRun` is false,
 * applies it row-by-row via updateRow (each column updated independently so a failure on one
 * incident/column doesn't block the rest — errors are collected and returned, never thrown, so a
 * partial run always produces a complete, inspectable report).
 *
 * 300 is ZCQL/getRows's own hard cap (confirmed live elsewhere in this app — see zcql-datetime.ts
 * callers) — if the historical Incidents table ever exceeds 300 rows this needs real pagination;
 * not expected at this app's current scale, and disclosed here rather than silently truncating.
 */
export async function runFinancialYearAndPrefixBackfill(
  catalystApp: CatalystApp,
  options: { dryRun: boolean },
): Promise<BackfillResult> {
  const datastore = catalystApp.datastore();

  const [incidentRows, propertyRows] = await Promise.all([
    datastore.table("Incidents").getRows({ maxRows: 300 }) as unknown as Promise<
      IncidentRawRow[]
    >,
    datastore.table("Properties").getRows({ maxRows: 300 }) as unknown as Promise<
      PropertyRawRow[]
    >,
  ]);

  const propertyPrefixById = new Map<string, string | null>(
    propertyRows.map((p) => [p.ROWID, p.incident_prefix]),
  );

  const financialYearPlan = planFinancialYearBackfill(
    incidentRows.map((r) => ({
      id: r.ROWID,
      occurredAt: new Date(r.occurred_at),
      financialYear: r.financial_year,
    })),
  );
  const incidentPrefixPlan = planIncidentPrefixBackfill(
    incidentRows.map((r) => ({
      id: r.ROWID,
      propertyId: r.property_id,
      incidentPrefix: r.incident_prefix,
    })),
    propertyPrefixById,
  );

  const summary = summarizeBackfillPlan(
    incidentRows.length,
    financialYearPlan,
    incidentPrefixPlan,
  );
  const errors: BackfillResult["errors"] = [];

  if (!options.dryRun) {
    for (const entry of financialYearPlan) {
      try {
        await datastore
          .table("Incidents")
          .updateRow({ ROWID: entry.incidentId, financial_year: entry.after });
      } catch (err) {
        errors.push({
          incidentId: entry.incidentId,
          column: "financial_year",
          message: err instanceof Error ? err.message : String(err),
        });
      }
    }
    for (const entry of incidentPrefixPlan.entries) {
      try {
        await datastore
          .table("Incidents")
          .updateRow({ ROWID: entry.incidentId, incident_prefix: entry.after });
      } catch (err) {
        errors.push({
          incidentId: entry.incidentId,
          column: "incident_prefix",
          message: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  return {
    summary,
    financialYearPlan,
    incidentPrefixPlan,
    applied: !options.dryRun,
    errors,
  };
}

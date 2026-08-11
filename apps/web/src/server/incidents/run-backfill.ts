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
 * NOT WIRED TO ANY ROUTE, ACTION, OR CRON JOB — a one-off maintenance script only, called
 * directly, not something end users or a scheduled job can trigger. Any future dryRun: false
 * call against live data still needs the same explicit approval this one got (see chat: executed
 * once, 2026-08-11, against the 8 pre-migration demo rows on the live Development project;
 * verified idempotent by an immediate dryRun: true re-run reporting 0 further changes).
 *
 * Scope is deliberately narrow: Incidents.financial_year and Incidents.incident_prefix only.
 * Incidents.incident_number and Incidents.incident_sequence are never read for planning purposes
 * and never written here — see backfill.ts's own doc comment for why.
 *
 * This backfill is for data consistency/auditability and the incident-numbering allocator
 * (number.ts, which filters by incident_prefix) — NOT a prerequisite for KPI/CEO dashboard
 * reporting. Every dashboard/KPI aggregate in this app is computed from Incidents.occurred_at,
 * property_id, and department_id (see kpi/calculations/incidents.ts, dashboard/business-units.ts),
 * which are populated at incident-creation time regardless of these two columns — confirmed live
 * (see chat) that dashboard totals were identical before and after this backfill ran.
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

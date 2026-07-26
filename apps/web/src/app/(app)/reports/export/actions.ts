"use server";

import { headers } from "next/headers";

import { catalystAppFromHeaders, type CatalystApp, type CatalystRow } from "@/lib/catalyst/app";
import { writeAuditLog } from "@/server/audit-log";
import { hasPropertyAccess, requireRole } from "@/server/permissions";
import { recentFinancialYears } from "@/server/kpi/period";
import { buildAssurancePackMarkdown } from "@/server/reporting/assurance-pack";
import { generateBoardNarrative } from "@/server/reporting/board-narrative";
import {
  gatherAssurancePackInput,
  gatherBoardNarrativeInput,
} from "@/server/reporting/gather";

const EXPORT_ROLES = [
  "SUPER_ADMIN",
  "GROUP_HS_ADMIN",
  "PROPERTY_HS_OFFICER",
  "INTERNAL_AUDITOR",
  "EXECUTIVE_READONLY",
] as const;

/**
 * Every export writes exactly one row to Catalyst's ReportExports table — in addition to the
 * usual AuditTrail entry via writeAuditLog — mirroring recordExport() in
 * apps/catalyst/functions/shared/services/report-service.ts (built for the standalone Catalyst
 * client). Nothing pre-migration wrote an equivalent row (there was no reportExports Drizzle
 * table), so this is new behaviour added to reach parity with that already-proven pattern, not a
 * change to any existing feature.
 */
async function recordReportExport(
  catalystApp: CatalystApp,
  reportType: string,
  exportedBy: string,
  filters: Record<string, unknown>,
  recordCount: number,
) {
  await catalystApp.datastore().table("ReportExports").insertRow({
    report_type: reportType,
    exported_by: exportedBy,
    filters_json: JSON.stringify(filters),
    record_count: recordCount,
  });
}

/** Resolves an fy label (e.g. "FY2026") + optional property to the same scope the dashboard uses. */
async function resolveScope(
  catalystApp: CatalystApp,
  fyLabel: string | null,
  propertyId: string | null,
) {
  const ctx = await requireRole([...EXPORT_ROLES]);
  const propertyRows = (await catalystApp
    .datastore()
    .table("Properties")
    .getRows({})) as CatalystRow[];
  const visiblePropertyIds = new Set(
    propertyRows.filter((p) => hasPropertyAccess(ctx, p.ROWID)).map((p) => p.ROWID),
  );
  const scopedPropertyId =
    propertyId && visiblePropertyIds.has(propertyId) ? propertyId : null;

  const fyOptions = recentFinancialYears(new Date());
  const selected = fyOptions.find((o) => o.label === fyLabel) ?? fyOptions[0]!;

  return { ctx, propertyId: scopedPropertyId, asOfAnchor: selected.asOfAnchor };
}

function toCsvValue(value: unknown): string {
  const str = value == null ? "" : String(value);
  return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

interface IncidentCsvRow extends CatalystRow {
  incident_number: string;
  property_id: string;
  occurred_at: string;
  person_event_type: string;
  incident_type: string;
  outcome: string;
  actual_severity: string;
  potential_severity: string;
  status: string;
  lost_workdays: string;
  incident_cost: string;
}

/**
 * Server Action returning CSV text — export is permission-controlled the same way every other
 * read is (property access), and every export is an audit_log event per docs/security-model.md.
 * Deliberately excludes medical detail entirely: this queries `Incidents`, never `MedicalNotes`,
 * so there's no code path here that could leak clinical data into an export.
 */
export async function exportIncidentsCsvAction(): Promise<string> {
  const ctx = await requireRole([...EXPORT_ROLES]);
  const catalystApp = catalystAppFromHeaders(await headers());
  const datastore = catalystApp.datastore();

  const propertyRows = (await datastore.table("Properties").getRows({})) as Array<
    CatalystRow & { name: string }
  >;
  const visiblePropertyIds = propertyRows
    .filter((p) => hasPropertyAccess(ctx, p.ROWID))
    .map((p) => p.ROWID);
  const propertyName = new Map(propertyRows.map((p) => [p.ROWID, p.name]));

  const rows: IncidentCsvRow[] =
    visiblePropertyIds.length === 0
      ? []
      : ((await datastore.table("Incidents").getRows({
          criteria: `Incidents.property_id in ('${visiblePropertyIds.join("', '")}')`,
        })) as IncidentCsvRow[]);

  const headerRow = [
    "incident_number",
    "property",
    "occurred_at",
    "person_type",
    "incident_type",
    "outcome",
    "actual_severity",
    "potential_severity",
    "status",
    "lost_workdays",
    "incident_cost",
  ];
  const csvLines = [headerRow.join(",")];
  for (const r of rows) {
    csvLines.push(
      [
        r.incident_number,
        propertyName.get(r.property_id) ?? "",
        r.occurred_at,
        r.person_event_type,
        r.incident_type,
        r.outcome,
        r.actual_severity,
        r.potential_severity,
        r.status,
        r.lost_workdays,
        r.incident_cost,
      ]
        .map(toCsvValue)
        .join(","),
    );
  }

  await recordReportExport(catalystApp, "incident_export", ctx.userId, {}, rows.length);

  const h = await headers();
  await writeAuditLog({
    actorId: ctx.userId,
    eventType: "data_exported",
    entityType: "incidents",
    reason: `CSV export, ${rows.length} rows`,
    ipAddress: h.get("x-forwarded-for") ?? h.get("cf-connecting-ip") ?? null,
    userAgent: h.get("user-agent"),
  });

  return csvLines.join("\n");
}

/**
 * Auto-generated board narrative — deterministic prose built entirely from live KPI figures
 * (src/server/reporting/board-narrative.ts). Same permission/audit-trail treatment as the CSV
 * export: this is a data export, not a UI-only view.
 */
export async function generateBoardNarrativeAction(
  fyLabel: string | null,
  propertyId: string | null,
): Promise<string> {
  const catalystApp = catalystAppFromHeaders(await headers());
  const {
    ctx,
    propertyId: scopedPropertyId,
    asOfAnchor,
  } = await resolveScope(catalystApp, fyLabel, propertyId);
  const input = await gatherBoardNarrativeInput(catalystApp, scopedPropertyId, asOfAnchor);
  const narrative = generateBoardNarrative(input);

  await recordReportExport(
    catalystApp,
    "board_narrative",
    ctx.userId,
    { propertyId: scopedPropertyId, fyLabel: input.fyLabel },
    input.kpis.length,
  );

  const h = await headers();
  await writeAuditLog({
    actorId: ctx.userId,
    eventType: "data_exported",
    entityType: "board_narrative",
    reason: `Board narrative generated for ${input.fyLabel} / ${input.propertyLabel}`,
    ipAddress: h.get("x-forwarded-for") ?? h.get("cf-connecting-ip") ?? null,
    userAgent: h.get("user-agent"),
  });

  return narrative;
}

/**
 * ISAE-3000-aligned assurance evidence pack (src/server/reporting/assurance-pack.ts) — structured
 * for an external assurance engagement, but explicitly disclaimed as not itself an assurance
 * opinion. Same permission/audit-trail treatment as the other exports.
 */
export async function generateAssurancePackAction(
  fyLabel: string | null,
  propertyId: string | null,
): Promise<string> {
  const catalystApp = catalystAppFromHeaders(await headers());
  const {
    ctx,
    propertyId: scopedPropertyId,
    asOfAnchor,
  } = await resolveScope(catalystApp, fyLabel, propertyId);
  const input = await gatherAssurancePackInput(catalystApp, scopedPropertyId, asOfAnchor);
  const pack = buildAssurancePackMarkdown(input);

  await recordReportExport(
    catalystApp,
    "assurance_pack",
    ctx.userId,
    { propertyId: scopedPropertyId, fyLabel: input.fyLabel },
    input.kpis.length + input.openFindings.length,
  );

  const h = await headers();
  await writeAuditLog({
    actorId: ctx.userId,
    eventType: "data_exported",
    entityType: "assurance_pack",
    reason: `Assurance pack generated for ${input.fyLabel} / ${input.propertyLabel}`,
    ipAddress: h.get("x-forwarded-for") ?? h.get("cf-connecting-ip") ?? null,
    userAgent: h.get("user-agent"),
  });

  return pack;
}

"use server";

import { headers } from "next/headers";
import { inArray } from "drizzle-orm";

import { getDb } from "@/db";
import { incidents, properties } from "@/db/schema";
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

/** Resolves an fy label (e.g. "FY2026") + optional property to the same scope the dashboard uses. */
async function resolveScope(fyLabel: string | null, propertyId: string | null) {
  const ctx = await requireRole([...EXPORT_ROLES]);
  const db = getDb();
  const allProperties = await db.select({ id: properties.id }).from(properties);
  const visiblePropertyIds = new Set(
    allProperties.filter((p) => hasPropertyAccess(ctx, p.id)).map((p) => p.id),
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

/**
 * Server Action returning CSV text — export is permission-controlled the same way every other
 * read is (property access), and every export is an audit_log event per docs/security-model.md.
 * Deliberately excludes medical detail entirely: this queries `incidents`, never
 * `medical_records`, so there's no code path here that could leak clinical data into an export.
 */
export async function exportIncidentsCsvAction(): Promise<string> {
  const ctx = await requireRole([...EXPORT_ROLES]);

  const db = getDb();
  const allProperties = await db
    .select({ id: properties.id, name: properties.name })
    .from(properties);
  const visiblePropertyIds = allProperties
    .filter((p) => hasPropertyAccess(ctx, p.id))
    .map((p) => p.id);
  const propertyName = new Map(allProperties.map((p) => [p.id, p.name]));

  const rows =
    visiblePropertyIds.length === 0
      ? []
      : await db
          .select()
          .from(incidents)
          .where(inArray(incidents.propertyId, visiblePropertyIds));

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
        r.incidentNumber,
        propertyName.get(r.propertyId) ?? "",
        r.occurredAt.toISOString(),
        r.personType,
        r.incidentType,
        r.outcome,
        r.actualSeverity,
        r.potentialSeverity,
        r.status,
        r.lostWorkdays,
        r.incidentCost,
      ]
        .map(toCsvValue)
        .join(","),
    );
  }

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
  const {
    ctx,
    propertyId: scopedPropertyId,
    asOfAnchor,
  } = await resolveScope(fyLabel, propertyId);
  const input = await gatherBoardNarrativeInput(scopedPropertyId, asOfAnchor);
  const narrative = generateBoardNarrative(input);

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
  const {
    ctx,
    propertyId: scopedPropertyId,
    asOfAnchor,
  } = await resolveScope(fyLabel, propertyId);
  const input = await gatherAssurancePackInput(scopedPropertyId, asOfAnchor);
  const pack = buildAssurancePackMarkdown(input);

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

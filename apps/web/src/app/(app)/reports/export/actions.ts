"use server";

import { headers } from "next/headers";
import { inArray } from "drizzle-orm";

import { getDb } from "@/db";
import { incidents, properties } from "@/db/schema";
import { writeAuditLog } from "@/server/audit-log";
import { hasPropertyAccess, requireRole } from "@/server/permissions";

const EXPORT_ROLES = [
  "SUPER_ADMIN",
  "GROUP_HS_ADMIN",
  "PROPERTY_HS_OFFICER",
  "INTERNAL_AUDITOR",
  "EXECUTIVE_READONLY",
] as const;

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

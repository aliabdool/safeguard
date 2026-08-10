"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import type { ActionResult } from "@/app/(auth)/actions";
import { catalystAppFromHeaders, type CatalystRow } from "@/lib/catalyst/app";
import { toZcqlDateTime } from "@/lib/catalyst/zcql-datetime";
import { writeAuditLog } from "@/server/audit-log";
import { hasPropertyAccess, requireActiveUser, requireRole } from "@/server/permissions";

/**
 * TODO(Phase D): file upload still targeted Supabase Storage and a Postgres files.id — that ID
 * can't be stored in Catalyst's IncidentAttachments.file_id (which references Catalyst's own Files
 * table, 13-files.json), and the Postgres incident_attachments table's FK to incidents.id no
 * longer resolves now that incidents are created in Catalyst, not Postgres. Wiring this up
 * correctly requires the storage migration to Catalyst File Store first; until then this action
 * intentionally errors rather than silently writing a dangling/wrong reference. Signature kept
 * identical to the pre-migration version so attachment-upload.tsx still typechecks unchanged.
 */
export async function requestIncidentAttachmentUploadAction(_input: {
  incidentId: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  isPhoto: boolean;
}): Promise<{ fileId: string; storagePath: string; token: string }> {
  throw new Error(
    "Photo/document upload is temporarily unavailable during the migration to Zoho Catalyst — file storage has not moved over yet.",
  );
}

export async function confirmIncidentAttachmentAction(_input: {
  incidentId: string;
  fileId: string;
  isPhoto: boolean;
  caption?: string;
}): Promise<void> {
  throw new Error(
    "Photo/document upload is temporarily unavailable during the migration to Zoho Catalyst — file storage has not moved over yet.",
  );
}

const notifySchema = z.object({
  incidentId: z.string(),
  notifiedParty: z.string().min(1),
  method: z.string().optional(),
});

export async function recordIncidentNotificationAction(
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const ctx = await requireActiveUser();
  const parsed = notifySchema.safeParse({
    incidentId: formData.get("incidentId"),
    notifiedParty: formData.get("notifiedParty"),
    method: formData.get("method") ?? undefined,
  });
  if (!parsed.success) {
    return { error: "Notified party is required." };
  }

  const catalystApp = catalystAppFromHeaders(await headers());
  const datastore = catalystApp.datastore();

  const incidentRows = (await datastore.table("Incidents").getRows({
    criteria: `Incidents.ROWID = '${parsed.data.incidentId}'`,
    maxRows: 1,
  })) as Array<CatalystRow & { property_id: string }>;
  const incident = incidentRows[0];
  if (!incident || !hasPropertyAccess(ctx, incident.property_id)) {
    return { error: "No access to this incident." };
  }

  await datastore.table("IncidentNotifications").insertRow({
    incident_id: parsed.data.incidentId,
    notified_party: parsed.data.notifiedParty,
    method: parsed.data.method ?? null,
    notified_by: ctx.userId,
    notified_at: toZcqlDateTime(new Date()),
  });

  revalidatePath(`/incidents/${parsed.data.incidentId}`);
  return {};
}

/** Status machine: reported -> investigating -> corrective_action -> verifying -> closed. */
const STATUS_ORDER = [
  "reported",
  "investigating",
  "corrective_action",
  "verifying",
  "closed",
] as const;
type IncidentStatus = (typeof STATUS_ORDER)[number];

export async function advanceIncidentStatusAction(
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const incidentId = formData.get("incidentId")?.toString();
  const targetStatus = formData.get("targetStatus")?.toString() as IncidentStatus | undefined;
  if (!incidentId || !targetStatus || !STATUS_ORDER.includes(targetStatus)) {
    return { error: "Invalid request." };
  }

  const ctx = await requireRole([
    "PROPERTY_HS_OFFICER",
    "GROUP_HS_ADMIN",
    "SUPER_ADMIN",
    "DUTY_MANAGER",
    "DEPARTMENT_MANAGER",
  ]);

  const catalystApp = catalystAppFromHeaders(await headers());
  const datastore = catalystApp.datastore();

  const incidentRows = (await datastore.table("Incidents").getRows({
    criteria: `Incidents.ROWID = '${incidentId}'`,
    maxRows: 1,
  })) as Array<CatalystRow & { property_id: string; department_id: string; status: string }>;
  const incident = incidentRows[0];
  if (!incident) {
    return { error: "Unknown incident." };
  }
  if (!hasPropertyAccess(ctx, incident.property_id)) {
    return { error: "No access to this incident." };
  }

  const currentIndex = STATUS_ORDER.indexOf(incident.status as IncidentStatus);
  const targetIndex = STATUS_ORDER.indexOf(targetStatus);
  if (targetIndex !== currentIndex + 1) {
    return {
      error: `Cannot move from '${incident.status}' to '${targetStatus}' — the workflow only advances one step at a time (Report → Investigate → Corrective Action → Verify → Close).`,
    };
  }

  if (targetStatus === "closed" || targetStatus === "verifying") {
    const linkedCapaRows = (await datastore.table("CAPA").getRows({
      criteria: `CAPA.source_type = 'incident' and CAPA.source_id = '${incidentId}'`,
    })) as Array<CatalystRow & { status: string }>;
    const openCapas = linkedCapaRows.filter(
      (c) => c.status !== "closed" && c.status !== "verified",
    );
    if (targetStatus === "closed" && openCapas.length > 0) {
      return {
        error: "All linked corrective actions must be verified/closed before closing the incident.",
      };
    }
  }

  await datastore.table("Incidents").updateRow({
    ROWID: incidentId,
    status: targetStatus,
    updated_at: toZcqlDateTime(new Date()),
  });

  await writeAuditLog({
    actorId: ctx.userId,
    eventType: "status_changed",
    entityType: "Incidents",
    entityId: incidentId,
    propertyId: incident.property_id,
    departmentId: incident.department_id,
    previousValue: { status: incident.status },
    newValue: { status: targetStatus },
  });

  revalidatePath(`/incidents/${incidentId}`);
  revalidatePath("/incidents");
  return {};
}

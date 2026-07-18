"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import type { ActionResult } from "@/app/(auth)/actions";
import { getDb } from "@/db";
import {
  capaActions,
  incidentAttachments,
  incidentNotifications,
  incidentPersons,
  incidents,
  properties,
} from "@/db/schema";
import { writeAuditLog } from "@/server/audit-log";
import { nextIncidentNumber } from "@/server/incidents/number";
import {
  hasDepartmentAccess,
  hasPropertyAccess,
  requireActiveUser,
  requireRole,
} from "@/server/permissions";
import { confirmUpload, createUploadUrl, FileValidationError } from "@/server/storage";

const REPORTER_ROLES = [
  "INCIDENT_REPORTER",
  "DUTY_MANAGER",
  "DEPARTMENT_MANAGER",
  "PROPERTY_HS_OFFICER",
  "GROUP_HS_ADMIN",
  "SUPER_ADMIN",
] as const;

const createIncidentSchema = z.object({
  propertyId: z.string().uuid(),
  departmentId: z.string().uuid(),
  locationDetail: z.string().optional(),
  occurredAt: z.string().min(1, "Date/time of occurrence is required."),
  personType: z.enum([
    "employee",
    "contractor",
    "guest",
    "visitor",
    "supplier",
    "public",
    "none",
    "near_miss",
    "unsafe_condition",
  ]),
  personName: z.string().optional(),
  incidentType: z.string().min(1, "Incident type is required."),
  injuryType: z.string().optional(),
  bodyPart: z.string().optional(),
  outcome: z.string().min(1, "Outcome is required."),
  actualSeverity: z.coerce.number().int().min(1).max(5),
  potentialSeverity: z.coerce.number().int().min(1).max(5),
  isHighPotential: z.boolean(),
  treatment: z.string().optional(),
  hospitalReferral: z.boolean(),
  lostWorkdays: z.coerce.number().int().min(0),
  restrictedDutyDays: z.coerce.number().int().min(0),
  incidentCost: z.coerce.number().min(0),
  businessInterruptionDays: z.coerce.number().int().min(0),
  immediateActions: z.string().optional(),
});

export async function createIncidentAction(
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const ctx = await requireRole([...REPORTER_ROLES]);

  const parsed = createIncidentSchema.safeParse({
    propertyId: formData.get("propertyId"),
    departmentId: formData.get("departmentId"),
    locationDetail: formData.get("locationDetail") ?? undefined,
    occurredAt: formData.get("occurredAt"),
    personType: formData.get("personType"),
    personName: formData.get("personName") ?? undefined,
    incidentType: formData.get("incidentType"),
    injuryType: formData.get("injuryType") ?? undefined,
    bodyPart: formData.get("bodyPart") ?? undefined,
    outcome: formData.get("outcome"),
    actualSeverity: formData.get("actualSeverity"),
    potentialSeverity: formData.get("potentialSeverity"),
    isHighPotential: formData.get("isHighPotential") === "on",
    treatment: formData.get("treatment") ?? undefined,
    hospitalReferral: formData.get("hospitalReferral") === "on",
    lostWorkdays: formData.get("lostWorkdays") || 0,
    restrictedDutyDays: formData.get("restrictedDutyDays") || 0,
    incidentCost: formData.get("incidentCost") || 0,
    businessInterruptionDays: formData.get("businessInterruptionDays") || 0,
    immediateActions: formData.get("immediateActions") ?? undefined,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid incident details." };
  }
  const data = parsed.data;

  if (!hasPropertyAccess(ctx, data.propertyId)) {
    return { error: "No access to this property." };
  }
  if (!hasDepartmentAccess(ctx, data.propertyId, data.departmentId)) {
    return { error: "No access to this department." };
  }

  const db = getDb();
  const [property] = await db
    .select({ code: properties.code })
    .from(properties)
    .where(eq(properties.id, data.propertyId))
    .limit(1);
  if (!property) {
    return { error: "Unknown property." };
  }

  let incidentId: string | undefined;
  for (let attempt = 0; attempt < 3 && !incidentId; attempt++) {
    const incidentNumber = await nextIncidentNumber(property.code, data.propertyId);
    try {
      const [created] = await db
        .insert(incidents)
        .values({
          incidentNumber,
          propertyId: data.propertyId,
          departmentId: data.departmentId,
          locationDetail: data.locationDetail ?? null,
          occurredAt: new Date(data.occurredAt),
          reportedBy: ctx.userId,
          personType: data.personType,
          incidentType: data.incidentType,
          injuryType: data.injuryType ?? null,
          bodyPart: data.bodyPart ?? null,
          outcome: data.outcome,
          actualSeverity: data.actualSeverity,
          potentialSeverity: data.potentialSeverity,
          isHighPotential: data.isHighPotential,
          treatment: data.treatment ?? null,
          hospitalReferral: data.hospitalReferral,
          lostWorkdays: data.lostWorkdays,
          restrictedDutyDays: data.restrictedDutyDays,
          incidentCost: String(data.incidentCost),
          businessInterruptionDays: data.businessInterruptionDays,
          immediateActions: data.immediateActions ?? null,
        })
        .returning({ id: incidents.id });
      incidentId = created!.id;
    } catch (err) {
      // Unique-violation race on incident_number under concurrent creation — retry with a
      // freshly computed number. Any other error propagates.
      if (attempt === 2) throw err;
    }
  }
  if (!incidentId) {
    return { error: "Could not allocate an incident number. Try again." };
  }

  await db.insert(incidentPersons).values({
    incidentId,
    personType: data.personType,
    fullName: data.personName ?? null,
    isPrimary: true,
  });

  await writeAuditLog({
    actorId: ctx.userId,
    eventType: "record_created",
    entityType: "incidents",
    entityId: incidentId,
    propertyId: data.propertyId,
    departmentId: data.departmentId,
    newValue: { status: "reported" },
  });

  revalidatePath("/incidents");
  redirect(`/incidents/${incidentId}`);
}

const attachmentSchema = z.object({
  incidentId: z.string().uuid(),
  filename: z.string().min(1),
  mimeType: z.string().min(1),
  sizeBytes: z.coerce.number().int().positive(),
  isPhoto: z.boolean(),
});

export async function requestIncidentAttachmentUploadAction(input: {
  incidentId: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  isPhoto: boolean;
}) {
  const ctx = await requireActiveUser();
  const parsed = attachmentSchema.parse(input);

  const db = getDb();
  const [incident] = await db
    .select({ propertyId: incidents.propertyId, departmentId: incidents.departmentId })
    .from(incidents)
    .where(eq(incidents.id, parsed.incidentId))
    .limit(1);
  if (!incident) {
    throw new Error("Unknown incident.");
  }
  if (!hasPropertyAccess(ctx, incident.propertyId)) {
    throw new Error("No access to this incident.");
  }

  try {
    const upload = await createUploadUrl({
      bucket: "incident-evidence",
      filename: parsed.filename,
      mimeType: parsed.mimeType,
      sizeBytes: parsed.sizeBytes,
      uploadedBy: ctx.userId,
    });
    return upload;
  } catch (err) {
    if (err instanceof FileValidationError) {
      throw new Error(err.message);
    }
    throw err;
  }
}

const confirmAttachmentSchema = z.object({
  incidentId: z.string().uuid(),
  fileId: z.string().uuid(),
  isPhoto: z.boolean(),
  caption: z.string().optional(),
});

export async function confirmIncidentAttachmentAction(input: {
  incidentId: string;
  fileId: string;
  isPhoto: boolean;
  caption?: string;
}) {
  const ctx = await requireActiveUser();
  const parsed = confirmAttachmentSchema.parse(input);

  await confirmUpload(parsed.fileId);

  const db = getDb();
  await db.insert(incidentAttachments).values({
    incidentId: parsed.incidentId,
    fileId: parsed.fileId,
    isPhoto: parsed.isPhoto,
    caption: parsed.caption ?? null,
  });

  await writeAuditLog({
    actorId: ctx.userId,
    eventType: "document_uploaded",
    entityType: "incident_attachments",
    entityId: parsed.fileId,
  });

  revalidatePath(`/incidents/${parsed.incidentId}`);
}

const notifySchema = z.object({
  incidentId: z.string().uuid(),
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

  const db = getDb();
  const [incident] = await db
    .select({ propertyId: incidents.propertyId })
    .from(incidents)
    .where(eq(incidents.id, parsed.data.incidentId))
    .limit(1);
  if (!incident || !hasPropertyAccess(ctx, incident.propertyId)) {
    return { error: "No access to this incident." };
  }

  await db.insert(incidentNotifications).values({
    incidentId: parsed.data.incidentId,
    notifiedParty: parsed.data.notifiedParty,
    method: parsed.data.method ?? null,
    notifiedBy: ctx.userId,
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

  const db = getDb();
  const [incident] = await db
    .select()
    .from(incidents)
    .where(eq(incidents.id, incidentId))
    .limit(1);
  if (!incident) {
    return { error: "Unknown incident." };
  }
  if (!hasPropertyAccess(ctx, incident.propertyId)) {
    return { error: "No access to this incident." };
  }

  const currentIndex = STATUS_ORDER.indexOf(incident.status);
  const targetIndex = STATUS_ORDER.indexOf(targetStatus);
  if (targetIndex !== currentIndex + 1) {
    return {
      error: `Cannot move from '${incident.status}' to '${targetStatus}' — the workflow only advances one step at a time (Report → Investigate → Corrective Action → Verify → Close).`,
    };
  }

  if (targetStatus === "closed" || targetStatus === "verifying") {
    const linkedCapas = await db
      .select({ status: capaActions.status })
      .from(capaActions)
      .where(
        and(eq(capaActions.sourceType, "incident"), eq(capaActions.sourceId, incidentId)),
      );
    const openCapas = linkedCapas.filter(
      (c) => c.status !== "closed" && c.status !== "verified",
    );
    if (targetStatus === "closed" && openCapas.length > 0) {
      return {
        error:
          "All linked corrective actions must be verified/closed before closing the incident.",
      };
    }
  }

  await db
    .update(incidents)
    .set({ status: targetStatus, updatedAt: new Date() })
    .where(eq(incidents.id, incidentId));

  await writeAuditLog({
    actorId: ctx.userId,
    eventType: "status_changed",
    entityType: "incidents",
    entityId: incidentId,
    propertyId: incident.propertyId,
    departmentId: incident.departmentId,
    previousValue: { status: incident.status },
    newValue: { status: targetStatus },
  });

  revalidatePath(`/incidents/${incidentId}`);
  revalidatePath("/incidents");
  return {};
}

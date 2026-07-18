"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { z } from "zod";

import type { ActionResult } from "@/app/(auth)/actions";
import { getDb } from "@/db";
import { capaActions, capaVerifications, scheduledReminders } from "@/db/schema";
import { writeAuditLog } from "@/server/audit-log";
import { nextCapaActionNumber } from "@/server/capa/number";
import { hasPropertyAccess, requireActiveUser, requireRole } from "@/server/permissions";

const createSchema = z.object({
  sourceType: z.enum([
    "incident",
    "audit_finding",
    "legal_gap",
    "inspection",
    "management_review",
  ]),
  sourceId: z.string().uuid(),
  description: z.string().min(1, "Description is required."),
  rootCause: z.string().optional(),
  correctiveAction: z.string().optional(),
  preventiveAction: z.string().optional(),
  hierarchyOfControl: z
    .enum(["elimination", "substitution", "engineering", "administrative", "ppe"])
    .optional()
    .or(z.literal("")),
  ownerId: z.string().uuid(),
  propertyId: z.string().uuid(),
  departmentId: z.string().uuid().optional().or(z.literal("")),
  priority: z.enum(["low", "medium", "high", "critical"]),
  dueDate: z.string().min(1, "Due date is required."),
  cost: z.coerce.number().min(0).optional(),
  requiredEvidence: z.string().optional(),
  verificationOwnerId: z.string().uuid(),
});

export async function createCapaAction(
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const ctx = await requireActiveUser();

  const parsed = createSchema.safeParse({
    sourceType: formData.get("sourceType"),
    sourceId: formData.get("sourceId"),
    description: formData.get("description"),
    rootCause: formData.get("rootCause") ?? undefined,
    correctiveAction: formData.get("correctiveAction") ?? undefined,
    preventiveAction: formData.get("preventiveAction") ?? undefined,
    hierarchyOfControl: formData.get("hierarchyOfControl") ?? "",
    ownerId: formData.get("ownerId"),
    propertyId: formData.get("propertyId"),
    departmentId: formData.get("departmentId") ?? "",
    priority: formData.get("priority"),
    dueDate: formData.get("dueDate"),
    cost: formData.get("cost") || undefined,
    requiredEvidence: formData.get("requiredEvidence") ?? undefined,
    verificationOwnerId: formData.get("verificationOwnerId"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid corrective action." };
  }
  const data = parsed.data;

  if (data.ownerId === data.verificationOwnerId) {
    return {
      error: "The action owner cannot also be the verifier — pick a different verifier.",
    };
  }
  if (!hasPropertyAccess(ctx, data.propertyId)) {
    return { error: "No access to this property." };
  }

  const db = getDb();
  const actionNumber = await nextCapaActionNumber();

  const [created] = await db
    .insert(capaActions)
    .values({
      actionNumber,
      sourceType: data.sourceType,
      sourceId: data.sourceId,
      description: data.description,
      rootCause: data.rootCause ?? null,
      correctiveAction: data.correctiveAction ?? null,
      preventiveAction: data.preventiveAction ?? null,
      hierarchyOfControl: data.hierarchyOfControl || null,
      ownerId: data.ownerId,
      propertyId: data.propertyId,
      departmentId: data.departmentId || null,
      priority: data.priority,
      dueDate: data.dueDate,
      cost: data.cost != null ? String(data.cost) : null,
      requiredEvidence: data.requiredEvidence ?? null,
      verificationOwnerId: data.verificationOwnerId,
      status: "open",
    })
    .returning({ id: capaActions.id });

  await writeAuditLog({
    actorId: ctx.userId,
    eventType: "record_created",
    entityType: "capa_actions",
    entityId: created!.id,
    propertyId: data.propertyId,
    departmentId: data.departmentId || null,
    newValue: { sourceType: data.sourceType, sourceId: data.sourceId, status: "open" },
  });

  // Remind the owner 3 days before the due date — processed by /api/cron/reminders.
  const remindAt = new Date(data.dueDate);
  remindAt.setUTCDate(remindAt.getUTCDate() - 3);
  await db.insert(scheduledReminders).values({
    relatedEntityType: "capa_actions",
    relatedEntityId: created!.id,
    remindAt,
    reminderType: "capa_due_soon",
  });

  revalidatePath("/capa");
  redirect(`/capa/${created!.id}`);
}

const verifySchema = z.object({
  capaId: z.string().uuid(),
  outcome: z.enum(["effective", "not_effective"]),
  comment: z.string().optional(),
});

export async function verifyCapaAction(
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const ctx = await requireActiveUser();
  const parsed = verifySchema.safeParse({
    capaId: formData.get("capaId"),
    outcome: formData.get("outcome"),
    comment: formData.get("comment") ?? undefined,
  });
  if (!parsed.success) {
    return { error: "Invalid verification." };
  }

  const db = getDb();
  const [capa] = await db
    .select()
    .from(capaActions)
    .where(eq(capaActions.id, parsed.data.capaId))
    .limit(1);
  if (!capa || !hasPropertyAccess(ctx, capa.propertyId)) {
    return { error: "No access to this corrective action." };
  }
  if (capa.ownerId === ctx.userId) {
    return { error: "The action owner cannot verify their own corrective action." };
  }
  if (capa.verificationOwnerId !== ctx.userId) {
    const isElevated = ["PROPERTY_HS_OFFICER", "GROUP_HS_ADMIN", "SUPER_ADMIN"].some((r) =>
      ctx.roleCodes.includes(r as (typeof ctx.roleCodes)[number]),
    );
    if (!isElevated) {
      return {
        error:
          "Only the designated verification owner (or an H&S officer/admin) can verify this.",
      };
    }
  }

  await db.insert(capaVerifications).values({
    capaId: parsed.data.capaId,
    verifierId: ctx.userId,
    outcome: parsed.data.outcome,
    comment: parsed.data.comment ?? null,
  });

  await db
    .update(capaActions)
    .set({
      status: parsed.data.outcome === "effective" ? "verified" : "in_progress",
      updatedAt: new Date(),
    })
    .where(eq(capaActions.id, parsed.data.capaId));

  await writeAuditLog({
    actorId: ctx.userId,
    eventType: "evidence_verified",
    entityType: "capa_actions",
    entityId: parsed.data.capaId,
    newValue: { outcome: parsed.data.outcome },
  });

  revalidatePath(`/capa/${parsed.data.capaId}`);
  return {};
}

const closeSchema = z.object({ capaId: z.string().uuid() });

/** Requires status = verified and final_approved_by != owner_id — mirrors the RLS check constraint. */
export async function closeCapaAction(
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const ctx = await requireRole(["PROPERTY_HS_OFFICER", "GROUP_HS_ADMIN", "SUPER_ADMIN"]);
  const parsed = closeSchema.safeParse({ capaId: formData.get("capaId") });
  if (!parsed.success) {
    return { error: "Invalid request." };
  }

  const db = getDb();
  const [capa] = await db
    .select()
    .from(capaActions)
    .where(eq(capaActions.id, parsed.data.capaId))
    .limit(1);
  if (!capa || !hasPropertyAccess(ctx, capa.propertyId)) {
    return { error: "No access to this corrective action." };
  }
  if (capa.status !== "verified") {
    return {
      error: "A corrective action must be verified as effective before it can be closed.",
    };
  }
  if (capa.ownerId === ctx.userId) {
    return { error: "The action owner cannot be the one who gives final closure approval." };
  }

  await db
    .update(capaActions)
    .set({
      status: "closed",
      finalApprovedBy: ctx.userId,
      finalApprovedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(capaActions.id, parsed.data.capaId));

  await writeAuditLog({
    actorId: ctx.userId,
    eventType: "finding_closed",
    entityType: "capa_actions",
    entityId: parsed.data.capaId,
    previousValue: { status: capa.status },
    newValue: { status: "closed" },
  });

  revalidatePath(`/capa/${parsed.data.capaId}`);
  revalidatePath("/capa");
  return {};
}

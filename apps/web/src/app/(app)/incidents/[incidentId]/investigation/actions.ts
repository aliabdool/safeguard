"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";

import type { ActionResult } from "@/app/(auth)/actions";
import { getDb } from "@/db";
import {
  incidents,
  investigationApprovals,
  investigationCauses,
  investigationFiveWhys,
  investigationWitnesses,
  investigations,
} from "@/db/schema";
import { writeAuditLog } from "@/server/audit-log";
import { hasPropertyAccess, requireActiveUser, requireRole } from "@/server/permissions";

const assignSchema = z.object({
  incidentId: z.string().uuid(),
  investigatorId: z.string().uuid(),
});

export async function assignInvestigatorAction(
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const ctx = await requireRole(["PROPERTY_HS_OFFICER", "GROUP_HS_ADMIN", "SUPER_ADMIN"]);
  const parsed = assignSchema.safeParse({
    incidentId: formData.get("incidentId"),
    investigatorId: formData.get("investigatorId"),
  });
  if (!parsed.success) {
    return { error: "Invalid investigator selection." };
  }

  const db = getDb();
  const [incident] = await db
    .select()
    .from(incidents)
    .where(eq(incidents.id, parsed.data.incidentId))
    .limit(1);
  if (!incident || !hasPropertyAccess(ctx, incident.propertyId)) {
    return { error: "No access to this incident." };
  }

  await db
    .insert(investigations)
    .values({
      incidentId: parsed.data.incidentId,
      investigatorId: parsed.data.investigatorId,
      status: "assigned",
    })
    .onConflictDoUpdate({
      target: investigations.incidentId,
      set: { investigatorId: parsed.data.investigatorId, status: "assigned" },
    });

  await writeAuditLog({
    actorId: ctx.userId,
    eventType: "record_created",
    entityType: "investigations",
    entityId: parsed.data.incidentId,
    newValue: { investigatorId: parsed.data.investigatorId },
  });

  revalidatePath(`/incidents/${parsed.data.incidentId}/investigation`);
  return {};
}

const causeSchema = z.object({
  investigationId: z.string().uuid(),
  incidentId: z.string().uuid(),
  causeType: z.enum(["immediate", "root"]),
  category: z.string().optional(),
  description: z.string().min(1, "Description is required."),
});

export async function addCauseAction(
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  await requireActiveUser();
  const parsed = causeSchema.safeParse({
    investigationId: formData.get("investigationId"),
    incidentId: formData.get("incidentId"),
    causeType: formData.get("causeType"),
    category: formData.get("category") ?? undefined,
    description: formData.get("description"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid cause." };
  }

  const db = getDb();
  await db.insert(investigationCauses).values({
    investigationId: parsed.data.investigationId,
    causeType: parsed.data.causeType,
    category: parsed.data.category ?? null,
    description: parsed.data.description,
  });

  revalidatePath(`/incidents/${parsed.data.incidentId}/investigation`);
  return {};
}

const fiveWhySchema = z.object({
  investigationId: z.string().uuid(),
  incidentId: z.string().uuid(),
  sequence: z.coerce.number().int().min(1).max(5),
  question: z.string().min(1),
  answer: z.string().optional(),
});

export async function addFiveWhyAction(
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  await requireActiveUser();
  const parsed = fiveWhySchema.safeParse({
    investigationId: formData.get("investigationId"),
    incidentId: formData.get("incidentId"),
    sequence: formData.get("sequence"),
    question: formData.get("question"),
    answer: formData.get("answer") ?? undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid entry." };
  }

  const db = getDb();
  await db.insert(investigationFiveWhys).values({
    investigationId: parsed.data.investigationId,
    sequence: parsed.data.sequence,
    question: parsed.data.question,
    answer: parsed.data.answer ?? null,
  });

  revalidatePath(`/incidents/${parsed.data.incidentId}/investigation`);
  return {};
}

const witnessSchema = z.object({
  investigationId: z.string().uuid(),
  incidentId: z.string().uuid(),
  name: z.string().min(1),
  role: z.string().optional(),
  statement: z.string().optional(),
  contact: z.string().optional(),
});

export async function addWitnessAction(
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  await requireActiveUser();
  const parsed = witnessSchema.safeParse({
    investigationId: formData.get("investigationId"),
    incidentId: formData.get("incidentId"),
    name: formData.get("name"),
    role: formData.get("role") ?? undefined,
    statement: formData.get("statement") ?? undefined,
    contact: formData.get("contact") ?? undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid witness." };
  }

  const db = getDb();
  await db.insert(investigationWitnesses).values({
    investigationId: parsed.data.investigationId,
    name: parsed.data.name,
    role: parsed.data.role ?? null,
    statement: parsed.data.statement ?? null,
    contact: parsed.data.contact ?? null,
  });

  revalidatePath(`/incidents/${parsed.data.incidentId}/investigation`);
  return {};
}

const reconstructionSchema = z.object({
  investigationId: z.string().uuid(),
  incidentId: z.string().uuid(),
  eventReconstruction: z
    .string()
    .min(1, "Event reconstruction is required to complete the investigation."),
});

export async function completeInvestigationAction(
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const ctx = await requireActiveUser();
  const parsed = reconstructionSchema.safeParse({
    investigationId: formData.get("investigationId"),
    incidentId: formData.get("incidentId"),
    eventReconstruction: formData.get("eventReconstruction"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Event reconstruction is required." };
  }

  const db = getDb();
  const [investigation] = await db
    .select()
    .from(investigations)
    .where(eq(investigations.id, parsed.data.investigationId))
    .limit(1);
  if (!investigation) {
    return { error: "Unknown investigation." };
  }
  if (investigation.investigatorId !== ctx.userId) {
    const isElevated = ["PROPERTY_HS_OFFICER", "GROUP_HS_ADMIN", "SUPER_ADMIN"].some((r) =>
      ctx.roleCodes.includes(r as (typeof ctx.roleCodes)[number]),
    );
    if (!isElevated) {
      return {
        error: "Only the assigned investigator (or an H&S officer/admin) can complete this.",
      };
    }
  }

  await db
    .update(investigations)
    .set({
      eventReconstruction: parsed.data.eventReconstruction,
      status: "completed",
      completedAt: new Date(),
    })
    .where(eq(investigations.id, parsed.data.investigationId));

  await writeAuditLog({
    actorId: ctx.userId,
    eventType: "status_changed",
    entityType: "investigations",
    entityId: parsed.data.investigationId,
    newValue: { status: "completed" },
  });

  revalidatePath(`/incidents/${parsed.data.incidentId}/investigation`);
  return {};
}

const approveSchema = z.object({
  investigationId: z.string().uuid(),
  incidentId: z.string().uuid(),
  decision: z.enum(["approved", "rejected"]),
  comment: z.string().optional(),
});

export async function approveInvestigationAction(
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const ctx = await requireRole(["PROPERTY_HS_OFFICER", "GROUP_HS_ADMIN", "SUPER_ADMIN"]);
  const parsed = approveSchema.safeParse({
    investigationId: formData.get("investigationId"),
    incidentId: formData.get("incidentId"),
    decision: formData.get("decision"),
    comment: formData.get("comment") ?? undefined,
  });
  if (!parsed.success) {
    return { error: "Invalid approval." };
  }

  const db = getDb();
  await db.insert(investigationApprovals).values({
    investigationId: parsed.data.investigationId,
    approverId: ctx.userId,
    decision: parsed.data.decision,
    comment: parsed.data.comment ?? null,
  });

  await db
    .update(investigations)
    .set({ status: parsed.data.decision === "approved" ? "approved" : "in_progress" })
    .where(eq(investigations.id, parsed.data.investigationId));

  await writeAuditLog({
    actorId: ctx.userId,
    eventType: parsed.data.decision === "approved" ? "approval" : "rejection",
    entityType: "investigations",
    entityId: parsed.data.investigationId,
    reason: parsed.data.comment ?? null,
  });

  revalidatePath(`/incidents/${parsed.data.incidentId}/investigation`);
  return {};
}

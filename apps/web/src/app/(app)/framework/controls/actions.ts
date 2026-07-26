"use server";

import { revalidatePath } from "next/cache";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";

import type { ActionResult } from "@/app/(auth)/actions";
import { getDb } from "@/db";
import { controlAssessments } from "@/db/schema";
import { writeAuditLog } from "@/server/audit-log";
import { isCriticalGap } from "@/server/framework/maturity";
import { hasPropertyAccess, requireRole } from "@/server/permissions";

const schema = z.object({
  controlId: z.string().uuid(),
  propertyId: z.string().uuid(),
  departmentId: z.string().uuid().optional().or(z.literal("")),
  periodLabel: z.string().min(1, "Period label is required (e.g. FY2026-Q2)."),
  dimension: z.enum(["policy", "procedure", "implementation", "effectiveness"]),
  maturityScore: z.coerce.number().int().min(0).max(4),
  notes: z.string().optional(),
  isLifeSafetyCritical: z.coerce.boolean(),
  isLegal: z.coerce.boolean(),
});

export async function createControlAssessmentAction(
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const ctx = await requireRole([
    "PROPERTY_HS_OFFICER",
    "GROUP_HS_ADMIN",
    "SUPER_ADMIN",
    "INTERNAL_AUDITOR",
  ]);

  const parsed = schema.safeParse({
    controlId: formData.get("controlId"),
    propertyId: formData.get("propertyId"),
    departmentId: formData.get("departmentId") ?? "",
    periodLabel: formData.get("periodLabel"),
    dimension: formData.get("dimension"),
    maturityScore: formData.get("maturityScore"),
    notes: formData.get("notes") ?? undefined,
    isLifeSafetyCritical: formData.get("isLifeSafetyCritical") === "on",
    isLegal: formData.get("isLegal") === "on",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid assessment." };
  }
  const data = parsed.data;

  if (!hasPropertyAccess(ctx, data.propertyId)) {
    return { error: "No access to this property." };
  }

  const criticalGap = isCriticalGap({
    isLifeSafetyCritical: data.isLifeSafetyCritical,
    isLegal: data.isLegal,
    scores: { [data.dimension]: data.maturityScore },
  });

  const db = getDb();
  const departmentId = data.departmentId || null;

  // Postgres treats NULL as distinct under a unique index, so a plain onConflictDoUpdate can't
  // dedupe property-wide (departmentId === null) re-assessments correctly — select-then-write
  // instead, same tradeoff as the incident-number allocator (acceptable race window for v1
  // assessment-entry volume; the unique index on the table is still a correctness backstop for
  // the departmentId-is-not-null case).
  const [existing] = await db
    .select({ id: controlAssessments.id })
    .from(controlAssessments)
    .where(
      and(
        eq(controlAssessments.controlId, data.controlId),
        eq(controlAssessments.propertyId, data.propertyId),
        departmentId
          ? eq(controlAssessments.departmentId, departmentId)
          : isNull(controlAssessments.departmentId),
        eq(controlAssessments.periodLabel, data.periodLabel),
        eq(controlAssessments.dimension, data.dimension),
      ),
    )
    .limit(1);

  if (existing) {
    await db
      .update(controlAssessments)
      .set({
        maturityScore: data.maturityScore,
        isCriticalGap: criticalGap,
        assessedBy: ctx.userId,
        assessedAt: new Date(),
        notes: data.notes ?? null,
      })
      .where(eq(controlAssessments.id, existing.id));
  } else {
    await db.insert(controlAssessments).values({
      controlId: data.controlId,
      propertyId: data.propertyId,
      departmentId,
      periodLabel: data.periodLabel,
      dimension: data.dimension,
      maturityScore: data.maturityScore,
      isCriticalGap: criticalGap,
      assessedBy: ctx.userId,
      notes: data.notes ?? null,
    });
  }

  await writeAuditLog({
    actorId: ctx.userId,
    eventType: "score_changed",
    entityType: "control_assessments",
    entityId: data.controlId,
    propertyId: data.propertyId,
    departmentId: data.departmentId || null,
    newValue: {
      dimension: data.dimension,
      maturityScore: data.maturityScore,
      isCriticalGap: criticalGap,
    },
  });

  revalidatePath(`/framework/controls/${data.controlId}`);
  return {};
}

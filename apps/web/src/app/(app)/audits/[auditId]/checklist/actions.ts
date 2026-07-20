"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import type { ActionResult } from "@/app/(auth)/actions";
import { getDb } from "@/db";
import { auditAssessments, auditChecklistItems } from "@/db/schema";
import { requireActiveUser } from "@/server/permissions";

const itemSchema = z.object({
  auditId: z.string().uuid(),
  question: z.string().min(1, "Question is required."),
  criteriaReference: z.string().optional(),
  controlId: z.string().uuid().optional().or(z.literal("")),
});

export async function addChecklistItemAction(
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  await requireActiveUser();
  const parsed = itemSchema.safeParse({
    auditId: formData.get("auditId"),
    question: formData.get("question"),
    criteriaReference: formData.get("criteriaReference") ?? undefined,
    controlId: formData.get("controlId") ?? "",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid checklist item." };
  }

  const db = getDb();
  await db.insert(auditChecklistItems).values({
    auditId: parsed.data.auditId,
    question: parsed.data.question,
    criteriaReference: parsed.data.criteriaReference ?? null,
    controlId: parsed.data.controlId || null,
  });

  revalidatePath(`/audits/${parsed.data.auditId}/checklist`);
  return {};
}

const assessmentSchema = z.object({
  checklistItemId: z.string().uuid(),
  auditId: z.string().uuid(),
  dimension: z.enum(["policy", "procedure", "implementation", "effectiveness"]),
  maturityScore: z.coerce.number().int().min(0).max(4),
  evidenceReviewed: z.string().optional(),
});

export async function addChecklistAssessmentAction(
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const ctx = await requireActiveUser();
  const parsed = assessmentSchema.safeParse({
    checklistItemId: formData.get("checklistItemId"),
    auditId: formData.get("auditId"),
    dimension: formData.get("dimension"),
    maturityScore: formData.get("maturityScore"),
    evidenceReviewed: formData.get("evidenceReviewed") ?? undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid assessment." };
  }

  const db = getDb();
  await db.insert(auditAssessments).values({
    checklistItemId: parsed.data.checklistItemId,
    dimension: parsed.data.dimension,
    maturityScore: parsed.data.maturityScore,
    evidenceReviewed: parsed.data.evidenceReviewed ?? null,
    assessorId: ctx.userId,
  });

  revalidatePath(`/audits/${parsed.data.auditId}/checklist`);
  return {};
}

"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import type { ActionResult } from "@/app/(auth)/actions";
import { catalystAppFromHeaders } from "@/lib/catalyst/app";
import { requireActiveUser } from "@/server/permissions";

const itemSchema = z.object({
  auditId: z.string(),
  question: z.string().min(1, "Question is required."),
  criteriaReference: z.string().optional(),
  controlId: z.string().optional().or(z.literal("")),
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

  const catalystApp = catalystAppFromHeaders(await headers());
  await catalystApp.datastore().table("AuditChecklistItems").insertRow({
    audit_id: parsed.data.auditId,
    question: parsed.data.question,
    criteria_reference: parsed.data.criteriaReference ?? null,
    control_id: parsed.data.controlId || null,
  });

  revalidatePath(`/audits/${parsed.data.auditId}/checklist`);
  return {};
}

const assessmentSchema = z.object({
  checklistItemId: z.string(),
  auditId: z.string(),
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

  const catalystApp = catalystAppFromHeaders(await headers());
  await catalystApp.datastore().table("AuditAssessments").insertRow({
    checklist_item_id: parsed.data.checklistItemId,
    dimension: parsed.data.dimension,
    maturity_score: parsed.data.maturityScore,
    evidence_reviewed: parsed.data.evidenceReviewed ?? null,
    assessor_id: ctx.userId,
  });

  revalidatePath(`/audits/${parsed.data.auditId}/checklist`);
  return {};
}

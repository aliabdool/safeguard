"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import type { ActionResult } from "@/app/(auth)/actions";
import { catalystAppFromHeaders, type CatalystRow } from "@/lib/catalyst/app";
import { writeAuditLog } from "@/server/audit-log";
import { isCriticalGap } from "@/server/framework/maturity";
import { hasPropertyAccess, requireRole } from "@/server/permissions";

const schema = z.object({
  controlId: z.string(),
  propertyId: z.string(),
  departmentId: z.string().optional().or(z.literal("")),
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

  const catalystApp = catalystAppFromHeaders(await headers());
  const datastore = catalystApp.datastore();
  const departmentId = data.departmentId || null;

  // Data Store has no upsert/onConflictDoUpdate, and (like Postgres treating NULL as distinct
  // under a unique index) a null department_id can't be relied on to dedupe via a criteria filter
  // alone either — select-then-write instead, same tradeoff as the incident-number allocator
  // (acceptable race window for v1 assessment-entry volume).
  const departmentClause = departmentId
    ? `ControlAssessments.department_id == '${departmentId}'`
    : `ControlAssessments.department_id is null`;
  const existingRows = (await datastore.table("ControlAssessments").getRows({
    criteria:
      `ControlAssessments.control_id == '${data.controlId}' && ` +
      `ControlAssessments.property_id == '${data.propertyId}' && ` +
      `${departmentClause} && ` +
      `ControlAssessments.period_label == '${data.periodLabel}' && ` +
      `ControlAssessments.dimension == '${data.dimension}'`,
    maxRows: 1,
  })) as CatalystRow[];
  const existing = existingRows[0];

  if (existing) {
    await datastore.table("ControlAssessments").updateRow({
      ROWID: existing.ROWID,
      maturity_score: data.maturityScore,
      is_critical_gap: criticalGap,
      assessed_by: ctx.userId,
      assessed_at: new Date().toISOString(),
      notes: data.notes ?? null,
    });
  } else {
    await datastore.table("ControlAssessments").insertRow({
      control_id: data.controlId,
      property_id: data.propertyId,
      department_id: departmentId,
      period_label: data.periodLabel,
      dimension: data.dimension,
      maturity_score: data.maturityScore,
      is_critical_gap: criticalGap,
      assessed_by: ctx.userId,
      notes: data.notes ?? null,
    });
  }

  await writeAuditLog({
    actorId: ctx.userId,
    eventType: "score_changed",
    entityType: "ControlAssessments",
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

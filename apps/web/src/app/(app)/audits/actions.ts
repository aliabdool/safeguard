"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { z } from "zod";

import type { ActionResult } from "@/app/(auth)/actions";
import { getDb } from "@/db";
import { auditTeamMembers, audits } from "@/db/schema";
import { writeAuditLog } from "@/server/audit-log";
import { nextAuditReference } from "@/server/audits/number";
import { hasPropertyAccess, requireRole } from "@/server/permissions";

const createSchema = z.object({
  type: z.enum([
    "self_assessment",
    "department_inspection",
    "internal_audit",
    "legal_compliance_audit",
    "iso45001_readiness",
    "external_assurance",
  ]),
  scope: z.string().optional(),
  criteria: z.string().optional(),
  propertyId: z.string().uuid(),
  leadAuditorId: z.string().uuid(),
  plannedStart: z.string().optional(),
  plannedEnd: z.string().optional(),
});

export async function createAuditAction(
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const ctx = await requireRole([
    "INTERNAL_AUDITOR",
    "PROPERTY_HS_OFFICER",
    "GROUP_HS_ADMIN",
    "SUPER_ADMIN",
  ]);
  const parsed = createSchema.safeParse({
    type: formData.get("type"),
    scope: formData.get("scope") ?? undefined,
    criteria: formData.get("criteria") ?? undefined,
    propertyId: formData.get("propertyId"),
    leadAuditorId: formData.get("leadAuditorId"),
    plannedStart: formData.get("plannedStart") || undefined,
    plannedEnd: formData.get("plannedEnd") || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid audit details." };
  }
  const data = parsed.data;
  if (!hasPropertyAccess(ctx, data.propertyId)) {
    return { error: "No access to this property." };
  }

  const db = getDb();
  const auditReference = await nextAuditReference();

  const [created] = await db
    .insert(audits)
    .values({
      auditReference,
      type: data.type,
      scope: data.scope ?? null,
      criteria: data.criteria ?? null,
      propertyId: data.propertyId,
      leadAuditorId: data.leadAuditorId,
      plannedStart: data.plannedStart || null,
      plannedEnd: data.plannedEnd || null,
      status: "planned",
    })
    .returning({ id: audits.id });

  await db.insert(auditTeamMembers).values({
    auditId: created!.id,
    userId: data.leadAuditorId,
    roleOnAudit: "lead_auditor",
  });

  await writeAuditLog({
    actorId: ctx.userId,
    eventType: "record_created",
    entityType: "audits",
    entityId: created!.id,
    propertyId: data.propertyId,
    newValue: { type: data.type, status: "planned" },
  });

  revalidatePath("/audits");
  redirect(`/audits/${created!.id}`);
}

const teamMemberSchema = z.object({
  auditId: z.string().uuid(),
  userId: z.string().uuid(),
  roleOnAudit: z.string().min(1),
});

export async function addAuditTeamMemberAction(
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const ctx = await requireRole(["INTERNAL_AUDITOR", "GROUP_HS_ADMIN", "SUPER_ADMIN"]);
  const parsed = teamMemberSchema.safeParse({
    auditId: formData.get("auditId"),
    userId: formData.get("userId"),
    roleOnAudit: formData.get("roleOnAudit"),
  });
  if (!parsed.success) {
    return { error: "Invalid team member." };
  }

  const db = getDb();
  await db.insert(auditTeamMembers).values(parsed.data).onConflictDoNothing();

  await writeAuditLog({
    actorId: ctx.userId,
    eventType: "record_created",
    entityType: "audit_team_members",
    entityId: parsed.data.auditId,
    newValue: { userId: parsed.data.userId, roleOnAudit: parsed.data.roleOnAudit },
  });

  revalidatePath(`/audits/${parsed.data.auditId}`);
  return {};
}

const STATUS_ORDER = ["planned", "in_progress", "reporting", "closed"] as const;
type AuditStatus = (typeof STATUS_ORDER)[number];

export async function advanceAuditStatusAction(
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const auditId = formData.get("auditId")?.toString();
  const targetStatus = formData.get("targetStatus")?.toString() as AuditStatus | undefined;
  if (!auditId || !targetStatus || !STATUS_ORDER.includes(targetStatus)) {
    return { error: "Invalid request." };
  }

  const ctx = await requireRole(["INTERNAL_AUDITOR", "GROUP_HS_ADMIN", "SUPER_ADMIN"]);
  const db = getDb();
  const [audit] = await db.select().from(audits).where(eq(audits.id, auditId)).limit(1);
  if (!audit) {
    return { error: "Unknown audit." };
  }

  const currentIndex = STATUS_ORDER.indexOf(audit.status);
  const targetIndex = STATUS_ORDER.indexOf(targetStatus);
  if (targetIndex !== currentIndex + 1) {
    return { error: `Cannot move from '${audit.status}' to '${targetStatus}'.` };
  }

  const updates: { status: AuditStatus; actualStart?: string; actualEnd?: string } = {
    status: targetStatus,
  };
  if (targetStatus === "in_progress") {
    updates.actualStart = new Date().toISOString().slice(0, 10);
  }
  if (targetStatus === "closed") {
    updates.actualEnd = new Date().toISOString().slice(0, 10);
  }

  await db.update(audits).set(updates).where(eq(audits.id, auditId));

  await writeAuditLog({
    actorId: ctx.userId,
    eventType: "status_changed",
    entityType: "audits",
    entityId: auditId,
    previousValue: { status: audit.status },
    newValue: { status: targetStatus },
  });

  revalidatePath(`/audits/${auditId}`);
  revalidatePath("/audits");
  return {};
}

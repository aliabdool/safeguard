"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import type { ActionResult } from "@/app/(auth)/actions";
import { catalystAppFromHeaders, type CatalystRow } from "@/lib/catalyst/app";
import { toZcqlDateTime } from "@/lib/catalyst/zcql-datetime";
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
  propertyId: z.string(),
  leadAuditorId: z.string(),
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

  const catalystApp = catalystAppFromHeaders(await headers());
  const datastore = catalystApp.datastore();
  const auditReference = await nextAuditReference(catalystApp);

  const created = await datastore.table("Audits").insertRow({
    audit_number: auditReference,
    audit_type: data.type,
    scope: data.scope ?? null,
    criteria: data.criteria ?? null,
    property_id: data.propertyId,
    lead_auditor_id: data.leadAuditorId,
    planned_start: data.plannedStart || null,
    planned_end: data.plannedEnd || null,
    status: "planned",
    created_at: toZcqlDateTime(new Date()),
  });
  const auditId = String(created.ROWID);

  await datastore.table("AuditTeamMembers").insertRow({
    audit_id: auditId,
    user_id: data.leadAuditorId,
    role_on_audit: "lead_auditor",
  });

  await writeAuditLog({
    actorId: ctx.userId,
    eventType: "record_created",
    entityType: "Audits",
    entityId: auditId,
    propertyId: data.propertyId,
    newValue: { type: data.type, status: "planned" },
  });

  revalidatePath("/audits");
  redirect(`/audits/${auditId}`);
}

const teamMemberSchema = z.object({
  auditId: z.string(),
  userId: z.string(),
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

  const catalystApp = catalystAppFromHeaders(await headers());
  const datastore = catalystApp.datastore();

  // apps/web's audit_team_members table has no unique constraint on (audit_id, user_id) either —
  // the original Postgres insert used onConflictDoNothing() with no arbiter target, which is a
  // no-op absent a matching unique constraint, so this is a plain insert there too.
  await datastore.table("AuditTeamMembers").insertRow({
    audit_id: parsed.data.auditId,
    user_id: parsed.data.userId,
    role_on_audit: parsed.data.roleOnAudit,
  });

  await writeAuditLog({
    actorId: ctx.userId,
    eventType: "record_created",
    entityType: "AuditTeamMembers",
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
  const catalystApp = catalystAppFromHeaders(await headers());
  const datastore = catalystApp.datastore();

  const auditRows = (await datastore.table("Audits").getRows({
    criteria: `Audits.ROWID = '${auditId}'`,
    maxRows: 1,
  })) as Array<CatalystRow & { status: string }>;
  const audit = auditRows[0];
  if (!audit) {
    return { error: "Unknown audit." };
  }

  const currentIndex = STATUS_ORDER.indexOf(audit.status as AuditStatus);
  const targetIndex = STATUS_ORDER.indexOf(targetStatus);
  if (targetIndex !== currentIndex + 1) {
    return { error: `Cannot move from '${audit.status}' to '${targetStatus}'.` };
  }

  const updates: Record<string, unknown> & { ROWID: string } = {
    ROWID: auditId,
    status: targetStatus,
  };
  if (targetStatus === "in_progress") {
    updates.actual_start = new Date().toISOString().slice(0, 10);
  }
  if (targetStatus === "closed") {
    updates.actual_end = new Date().toISOString().slice(0, 10);
  }

  await datastore.table("Audits").updateRow(updates);

  await writeAuditLog({
    actorId: ctx.userId,
    eventType: "status_changed",
    entityType: "Audits",
    entityId: auditId,
    previousValue: { status: audit.status },
    newValue: { status: targetStatus },
  });

  revalidatePath(`/audits/${auditId}`);
  revalidatePath("/audits");
  return {};
}

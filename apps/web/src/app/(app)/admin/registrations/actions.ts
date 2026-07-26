"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { catalystAppFromHeaders } from "@/lib/catalyst/app";
import { requireRole } from "@/server/permissions";
import { writeAuditLog } from "@/server/audit-log";

import type { ActionResult } from "@/app/(auth)/actions";

const approveSchema = z.object({
  userId: z.string(),
  registrationRequestId: z.string(),
  roleId: z.string(),
  propertyIds: z.array(z.string()).min(1, "Select at least one property."),
  departmentIds: z.array(z.string()),
  grantMedicalPermission: z.boolean(),
  medicalPermissionReason: z.string().optional(),
});

export async function approveRegistrationAction(
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const admin = await requireRole(["SUPER_ADMIN", "GROUP_HS_ADMIN"]);

  const parsed = approveSchema.safeParse({
    userId: formData.get("userId"),
    registrationRequestId: formData.get("registrationRequestId"),
    roleId: formData.get("roleId"),
    propertyIds: formData.getAll("propertyIds"),
    departmentIds: formData.getAll("departmentIds"),
    grantMedicalPermission: formData.get("grantMedicalPermission") === "on",
    medicalPermissionReason: formData.get("medicalPermissionReason")?.toString(),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid approval details." };
  }
  const data = parsed.data;
  if (data.grantMedicalPermission && !data.medicalPermissionReason) {
    return { error: "A reason is required to grant medical-data access." };
  }

  const catalystApp = catalystAppFromHeaders(await headers());
  const datastore = catalystApp.datastore();
  const nowIso = new Date().toISOString();

  // Data Store has no multi-table transaction primitive, so these writes are sequenced, not
  // atomic (see apps/catalyst/data-store-schema/README.md) — a partial failure needs manual
  // cleanup, the same tradeoff every other Catalyst Function already accepts. Data Store also has
  // no unique-constraint/upsert equivalent to Postgres's onConflictDoNothing, so a double submit
  // of this form can insert a duplicate UserRoles/UserPropertyAccess row — acceptable for v1, flag
  // for hardening alongside the rest of Phase C/D.
  await datastore.table("Users").updateRow({
    ROWID: data.userId,
    status: "active",
    approved_by: admin.userId,
    approved_at: nowIso,
    updated_at: nowIso,
  });

  await datastore.table("RegistrationRequests").updateRow({
    ROWID: data.registrationRequestId,
    status: "approved",
    reviewed_by: admin.userId,
    reviewed_at: nowIso,
  });

  await datastore.table("UserRoles").insertRow({
    user_id: data.userId,
    role_id: data.roleId,
    granted_by: admin.userId,
  });

  for (const propertyId of data.propertyIds) {
    await datastore.table("UserPropertyAccess").insertRow({
      user_id: data.userId,
      property_id: propertyId,
      granted_by: admin.userId,
    });

    for (const departmentId of data.departmentIds) {
      await datastore.table("UserDepartmentAccess").insertRow({
        user_id: data.userId,
        property_id: propertyId,
        department_id: departmentId,
        granted_by: admin.userId,
      });
    }
  }

  if (data.grantMedicalPermission) {
    // Catalyst's ported schema has three granular medical-permission codes (view/edit/export);
    // this single checkbox grants view only — matching the single boolean this form always had.
    // Granting edit/export needs a separate, more deliberate action, not yet exposed in this UI.
    await datastore.table("UserPermissions").insertRow({
      user_id: data.userId,
      permission_code: "view_medical_notes",
      granted_by: admin.userId,
      reason: data.medicalPermissionReason ?? "",
    });
  }

  await writeAuditLog({
    actorId: admin.userId,
    eventType: "registration_approved",
    entityType: "Users",
    entityId: data.userId,
    newValue: {
      roleId: data.roleId,
      propertyIds: data.propertyIds,
      departmentIds: data.departmentIds,
      medicalPermissionGranted: data.grantMedicalPermission,
    },
  });

  revalidatePath("/admin/registrations");
  revalidatePath("/admin/users");
  return {};
}

const rejectSchema = z.object({
  userId: z.string(),
  registrationRequestId: z.string(),
  reason: z.string().min(1, "A rejection reason is required."),
});

export async function rejectRegistrationAction(
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const admin = await requireRole(["SUPER_ADMIN", "GROUP_HS_ADMIN"]);

  const parsed = rejectSchema.safeParse({
    userId: formData.get("userId"),
    registrationRequestId: formData.get("registrationRequestId"),
    reason: formData.get("reason"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "A rejection reason is required." };
  }
  const data = parsed.data;

  const catalystApp = catalystAppFromHeaders(await headers());
  const datastore = catalystApp.datastore();
  const nowIso = new Date().toISOString();

  await datastore.table("Users").updateRow({
    ROWID: data.userId,
    status: "rejected",
    updated_at: nowIso,
  });

  await datastore.table("RegistrationRequests").updateRow({
    ROWID: data.registrationRequestId,
    status: "rejected",
    reviewed_by: admin.userId,
    reviewed_at: nowIso,
    rejection_reason: data.reason,
  });

  await writeAuditLog({
    actorId: admin.userId,
    eventType: "registration_rejected",
    entityType: "Users",
    entityId: data.userId,
    reason: data.reason,
  });

  revalidatePath("/admin/registrations");
  return {};
}

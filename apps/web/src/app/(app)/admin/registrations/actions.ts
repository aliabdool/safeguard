"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { getDb } from "@/db";
import {
  profiles,
  registrationRequests,
  userDepartmentAccess,
  userMedicalPermission,
  userPropertyAccess,
  userRoles,
} from "@/db/schema";
import { requireRole } from "@/server/permissions";
import { writeAuditLog } from "@/server/audit-log";

import type { ActionResult } from "@/app/(auth)/actions";

const approveSchema = z.object({
  userId: z.string().uuid(),
  registrationRequestId: z.string().uuid(),
  roleId: z.string().uuid(),
  propertyIds: z.array(z.string().uuid()).min(1, "Select at least one property."),
  departmentIds: z.array(z.string().uuid()),
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

  const db = getDb();
  const now = new Date();

  await db.transaction(async (tx) => {
    await tx
      .update(profiles)
      .set({ status: "active", approvedBy: admin.userId, approvedAt: now, updatedAt: now })
      .where(eq(profiles.id, data.userId));

    await tx
      .update(registrationRequests)
      .set({ status: "approved", reviewedBy: admin.userId, reviewedAt: now })
      .where(eq(registrationRequests.id, data.registrationRequestId));

    await tx
      .insert(userRoles)
      .values({ userId: data.userId, roleId: data.roleId, grantedBy: admin.userId })
      .onConflictDoNothing();

    for (const propertyId of data.propertyIds) {
      await tx
        .insert(userPropertyAccess)
        .values({ userId: data.userId, propertyId, grantedBy: admin.userId })
        .onConflictDoNothing();

      for (const departmentId of data.departmentIds) {
        await tx
          .insert(userDepartmentAccess)
          .values({ userId: data.userId, propertyId, departmentId, grantedBy: admin.userId })
          .onConflictDoNothing();
      }
    }

    if (data.grantMedicalPermission) {
      await tx
        .insert(userMedicalPermission)
        .values({
          userId: data.userId,
          grantedBy: admin.userId,
          reason: data.medicalPermissionReason ?? "",
        })
        .onConflictDoUpdate({
          target: userMedicalPermission.userId,
          set: {
            grantedBy: admin.userId,
            grantedAt: now,
            reason: data.medicalPermissionReason ?? "",
            revokedBy: null,
            revokedAt: null,
          },
        });
    }
  });

  await writeAuditLog({
    actorId: admin.userId,
    eventType: "registration_approved",
    entityType: "profiles",
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
  userId: z.string().uuid(),
  registrationRequestId: z.string().uuid(),
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

  const db = getDb();
  await db.transaction(async (tx) => {
    await tx
      .update(profiles)
      .set({ status: "rejected", updatedAt: new Date() })
      .where(eq(profiles.id, data.userId));

    await tx
      .update(registrationRequests)
      .set({
        status: "rejected",
        reviewedBy: admin.userId,
        reviewedAt: new Date(),
        rejectionReason: data.reason,
      })
      .where(eq(registrationRequests.id, data.registrationRequestId));
  });

  await writeAuditLog({
    actorId: admin.userId,
    eventType: "registration_rejected",
    entityType: "profiles",
    entityId: data.userId,
    reason: data.reason,
  });

  revalidatePath("/admin/registrations");
  return {};
}

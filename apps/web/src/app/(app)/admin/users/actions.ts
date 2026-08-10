"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { catalystAppFromHeaders, type CatalystRow } from "@/lib/catalyst/app";
import { toZcqlDateTime } from "@/lib/catalyst/zcql-datetime";
import { requireRole } from "@/server/permissions";
import { writeAuditLog } from "@/server/audit-log";

import type { ActionResult } from "@/app/(auth)/actions";

interface UserRow extends CatalystRow {
  zuid: string;
}

const suspendSchema = z.object({
  userId: z.string(),
  reason: z.string().min(1, "A reason is required to suspend an account."),
});

export async function suspendUserAction(
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const admin = await requireRole(["SUPER_ADMIN", "GROUP_HS_ADMIN"]);
  const parsed = suspendSchema.safeParse({
    userId: formData.get("userId"),
    reason: formData.get("reason"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "A reason is required." };
  }

  const catalystApp = catalystAppFromHeaders(await headers());
  const datastore = catalystApp.datastore();

  const userRows = await datastore
    .table("Users")
    .getRows({ criteria: `Users.ROWID = '${parsed.data.userId}'`, maxRows: 1 }) as UserRow[];
  const userRow = userRows[0];
  if (!userRow) {
    return { error: "User not found." };
  }

  const nowIso = toZcqlDateTime(new Date());
  await datastore.table("Users").updateRow({
    ROWID: parsed.data.userId,
    status: "suspended",
    suspended_by: admin.userId,
    suspended_at: nowIso,
    suspension_reason: parsed.data.reason,
    updated_at: nowIso,
  });

  // Disabling at the identity-provider level (not just our own Data Store status flag) actually
  // locks the account out of Catalyst Authentication immediately.
  await catalystApp.userManagement().updateUserStatus(userRow.zuid, "disable");

  await writeAuditLog({
    actorId: admin.userId,
    eventType: "user_suspended",
    entityType: "Users",
    entityId: parsed.data.userId,
    reason: parsed.data.reason,
  });

  revalidatePath("/admin/users");
  return {};
}

const userIdSchema = z.object({ userId: z.string() });

export async function reactivateUserAction(
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const admin = await requireRole(["SUPER_ADMIN", "GROUP_HS_ADMIN"]);
  const parsed = userIdSchema.safeParse({ userId: formData.get("userId") });
  if (!parsed.success) {
    return { error: "Invalid user." };
  }

  const catalystApp = catalystAppFromHeaders(await headers());
  const datastore = catalystApp.datastore();

  const userRows = await datastore
    .table("Users")
    .getRows({ criteria: `Users.ROWID = '${parsed.data.userId}'`, maxRows: 1 }) as UserRow[];
  const userRow = userRows[0];
  if (!userRow) {
    return { error: "User not found." };
  }

  const nowIso = toZcqlDateTime(new Date());
  await datastore.table("Users").updateRow({
    ROWID: parsed.data.userId,
    status: "active",
    suspended_by: null,
    suspended_at: null,
    suspension_reason: null,
    updated_at: nowIso,
  });

  await catalystApp.userManagement().updateUserStatus(userRow.zuid, "enable");

  await writeAuditLog({
    actorId: admin.userId,
    eventType: "user_reactivated",
    entityType: "Users",
    entityId: parsed.data.userId,
  });

  revalidatePath("/admin/users");
  return {};
}

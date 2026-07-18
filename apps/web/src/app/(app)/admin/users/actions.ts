"use server";

import { revalidatePath } from "next/cache";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";

import { getDb } from "@/db";
import { profiles } from "@/db/schema";
import { requireRole } from "@/server/permissions";
import { writeAuditLog } from "@/server/audit-log";

import type { ActionResult } from "@/app/(auth)/actions";

const suspendSchema = z.object({
  userId: z.string().uuid(),
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

  const db = getDb();
  await db
    .update(profiles)
    .set({
      status: "suspended",
      suspendedBy: admin.userId,
      suspendedAt: new Date(),
      suspensionReason: parsed.data.reason,
      updatedAt: new Date(),
    })
    .where(eq(profiles.id, parsed.data.userId));

  // Suspension takes effect immediately regardless of token validity (checked in the (app)
  // layout on every request), but we also revoke existing sessions so a still-valid access
  // token can't be used against any Route Handler that doesn't re-check status.
  await revokeUserSessions(parsed.data.userId);

  await writeAuditLog({
    actorId: admin.userId,
    eventType: "user_suspended",
    entityType: "profiles",
    entityId: parsed.data.userId,
    reason: parsed.data.reason,
  });

  revalidatePath("/admin/users");
  return {};
}

const userIdSchema = z.object({ userId: z.string().uuid() });

export async function reactivateUserAction(
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const admin = await requireRole(["SUPER_ADMIN", "GROUP_HS_ADMIN"]);
  const parsed = userIdSchema.safeParse({ userId: formData.get("userId") });
  if (!parsed.success) {
    return { error: "Invalid user." };
  }

  const db = getDb();
  await db
    .update(profiles)
    .set({
      status: "active",
      suspendedBy: null,
      suspendedAt: null,
      suspensionReason: null,
      updatedAt: new Date(),
    })
    .where(eq(profiles.id, parsed.data.userId));

  await writeAuditLog({
    actorId: admin.userId,
    eventType: "user_reactivated",
    entityType: "profiles",
    entityId: parsed.data.userId,
  });

  revalidatePath("/admin/users");
  return {};
}

export async function revokeSessionsAction(
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const admin = await requireRole(["SUPER_ADMIN", "GROUP_HS_ADMIN"]);
  const parsed = userIdSchema.safeParse({ userId: formData.get("userId") });
  if (!parsed.success) {
    return { error: "Invalid user." };
  }

  await revokeUserSessions(parsed.data.userId);

  await writeAuditLog({
    actorId: admin.userId,
    eventType: "session_revoked",
    entityType: "profiles",
    entityId: parsed.data.userId,
  });

  revalidatePath("/admin/users");
  return {};
}

/**
 * The Supabase Admin (GoTrue) JS SDK's `auth.admin.signOut()` revokes a single session given
 * its JWT — it has no "revoke every session for this user id" call. Supabase Auth's own session
 * model (`auth.sessions`, with `auth.refresh_tokens.session_id` cascading on delete) is the
 * actual source of truth, so we delete the user's session rows directly over the same pooled
 * Postgres connection Drizzle uses elsewhere — this is the same mechanism the Supabase
 * Dashboard's own "Revoke sessions" action relies on. Deleting from `auth.sessions` immediately
 * invalidates refresh; any still-valid (unexpired) access token stops working at its next
 * refresh, which is why suspension is *also* checked on every request in the (app) layout rather
 * than relying on token invalidation alone.
 */
async function revokeUserSessions(userId: string) {
  const db = getDb();
  await db.execute(sql`delete from auth.sessions where user_id = ${userId}`);
}

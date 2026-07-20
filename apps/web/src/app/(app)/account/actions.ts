"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import type { ActionResult } from "@/app/(auth)/actions";
import { getDb } from "@/db";
import { notifications } from "@/db/schema";
import { requireActiveUser } from "@/server/permissions";

const schema = z.object({ notificationId: z.string().uuid() });

export async function markNotificationReadAction(
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const ctx = await requireActiveUser();
  const parsed = schema.safeParse({ notificationId: formData.get("notificationId") });
  if (!parsed.success) {
    return { error: "Invalid notification." };
  }

  const db = getDb();
  // Scoped to the caller's own userId in the WHERE clause — a user can only mark their own
  // notifications read, matching the notifications_rw RLS policy exactly.
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(notifications.id, parsed.data.notificationId),
        eq(notifications.userId, ctx.userId),
      ),
    );

  revalidatePath("/account");
  return {};
}

"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";

import type { ActionResult } from "@/app/(auth)/actions";
import { catalystAppFromHeaders, type CatalystRow } from "@/lib/catalyst/app";
import { requireActiveUser } from "@/server/permissions";

// Was z.string().uuid() pre-migration — a Catalyst ROWID is not a Postgres UUID.
const schema = z.object({ notificationId: z.string() });

export async function markNotificationReadAction(
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const ctx = await requireActiveUser();
  const parsed = schema.safeParse({ notificationId: formData.get("notificationId") });
  if (!parsed.success) {
    return { error: "Invalid notification." };
  }

  const catalystApp = catalystAppFromHeaders(await headers());
  const datastore = catalystApp.datastore();

  // Scoped to the caller's own userId — a user can only mark their own notifications read,
  // matching the notifications_rw RLS policy the Supabase build enforced at the database layer.
  // Catalyst's Data Store has no row-level-security equivalent, so this application-layer check
  // is now the sole enforcement (see apps/catalyst/data-store-schema/README.md).
  const rows = (await datastore.table("Notifications").getRows({
    criteria: `Notifications.ROWID = '${parsed.data.notificationId}'`,
    maxRows: 1,
  })) as Array<CatalystRow & { recipient_user_id: string }>;
  const notification = rows[0];
  if (!notification || notification.recipient_user_id !== ctx.userId) {
    return { error: "Invalid notification." };
  }

  await datastore.table("Notifications").updateRow({
    ROWID: parsed.data.notificationId,
    read_at: new Date().toISOString(),
  });

  revalidatePath("/account");
  return {};
}

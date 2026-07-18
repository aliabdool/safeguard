import "server-only";

import { and, eq, isNull, lte } from "drizzle-orm";

import { getDb } from "@/db";
import {
  capaActions,
  documentVersions,
  documents,
  notifications,
  scheduledReminders,
} from "@/db/schema";

const REMINDER_COPY: Record<string, { title: string; body: (entityLabel: string) => string }> =
  {
    capa_due_soon: {
      title: "Corrective action due soon",
      body: (label) => `${label} is due within 3 days.`,
    },
    document_review_due: {
      title: "Document review due",
      body: (label) => `${label} has reached its scheduled review date.`,
    },
  };

/**
 * Called by /api/cron/reminders (Cloudflare Cron Trigger). Processes every due, unsent
 * scheduled_reminders row into an in-app notification for the responsible user, then marks it
 * sent. Idempotent per row (sentAt gate) so a retried cron invocation can't double-notify.
 */
export async function processDueReminders(
  now: Date = new Date(),
): Promise<{ processed: number }> {
  const db = getDb();

  const due = await db
    .select()
    .from(scheduledReminders)
    .where(and(lte(scheduledReminders.remindAt, now), isNull(scheduledReminders.sentAt)));

  let processed = 0;

  for (const reminder of due) {
    const recipient = await resolveRecipient(
      reminder.relatedEntityType,
      reminder.relatedEntityId,
    );
    if (!recipient) {
      // Entity was deleted or has no resolvable owner — mark sent anyway so it doesn't retry
      // forever; nothing left to notify.
      await db
        .update(scheduledReminders)
        .set({ sentAt: now })
        .where(eq(scheduledReminders.id, reminder.id));
      continue;
    }

    const copy = REMINDER_COPY[reminder.reminderType] ?? {
      title: "Reminder",
      body: () => "You have a pending item to review.",
    };

    await db.insert(notifications).values({
      userId: recipient.userId,
      type: reminder.reminderType,
      title: copy.title,
      body: copy.body(recipient.label),
      relatedEntityType: reminder.relatedEntityType,
      relatedEntityId: reminder.relatedEntityId,
    });

    await db
      .update(scheduledReminders)
      .set({ sentAt: now })
      .where(eq(scheduledReminders.id, reminder.id));
    processed += 1;
  }

  return { processed };
}

async function resolveRecipient(
  entityType: string,
  entityId: string,
): Promise<{ userId: string; label: string } | null> {
  const db = getDb();

  if (entityType === "capa_actions") {
    const [row] = await db
      .select({ userId: capaActions.ownerId, label: capaActions.actionNumber })
      .from(capaActions)
      .where(eq(capaActions.id, entityId))
      .limit(1);
    return row ?? null;
  }

  if (entityType === "document_versions") {
    const [row] = await db
      .select({ userId: documents.ownerId, label: documents.title })
      .from(documentVersions)
      .innerJoin(documents, eq(documents.id, documentVersions.documentId))
      .where(eq(documentVersions.id, entityId))
      .limit(1);
    return row ?? null;
  }

  return null;
}

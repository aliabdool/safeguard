import "server-only";

import { catalystAdminApp, type CatalystApp, type CatalystRow } from "@/lib/catalyst/app";

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

interface ReminderRow extends CatalystRow {
  related_entity_type: string;
  related_entity_id: string;
  reminder_type: string;
}

/**
 * Called by /api/cron/reminders (Cloudflare Cron Trigger). Processes every due, unsent
 * ScheduledReminders row into an in-app Notifications row for the responsible user, then marks it
 * sent. Idempotent per row (sent_at gate) so a retried cron invocation can't double-notify.
 *
 * Uses catalystAdminApp() — this route runs with no browser session, only the shared CRON_SECRET
 * header checked in src/server/cron/auth.ts.
 *
 * NOTE: ScheduledReminders rows are still only ever written by the CAPA and Documents modules'
 * own Server Actions (src/app/(app)/capa/actions.ts, src/app/(app)/documents/actions.ts) — those
 * are out of scope for this migration slice and, as of this change, still write to Postgres via
 * Drizzle until their own Phase C migration lands. Until then this job will simply find no rows in
 * Catalyst's ScheduledReminders table; that is an expected transitional gap between parallel
 * migration slices, not a regression introduced here.
 */
export async function processDueReminders(
  now: Date = new Date(),
): Promise<{ processed: number }> {
  const catalystApp = catalystAdminApp();
  const datastore = catalystApp.datastore();

  const due = (await datastore.table("ScheduledReminders").getRows({
    criteria: `ScheduledReminders.remind_at <= '${now.toISOString()}' && ScheduledReminders.sent_at is null`,
  })) as ReminderRow[];

  let processed = 0;

  for (const reminder of due) {
    const recipient = await resolveRecipient(
      catalystApp,
      reminder.related_entity_type,
      reminder.related_entity_id,
    );
    if (!recipient) {
      // Entity was deleted or has no resolvable owner — mark sent anyway so it doesn't retry
      // forever; nothing left to notify.
      await datastore.table("ScheduledReminders").updateRow({
        ROWID: reminder.ROWID,
        sent_at: now.toISOString(),
      });
      continue;
    }

    const copy = REMINDER_COPY[reminder.reminder_type] ?? {
      title: "Reminder",
      body: () => "You have a pending item to review.",
    };

    await datastore.table("Notifications").insertRow({
      recipient_user_id: recipient.userId,
      notification_type: reminder.reminder_type,
      title: copy.title,
      message: copy.body(recipient.label),
      entity_type: reminder.related_entity_type,
      entity_id: reminder.related_entity_id,
      severity: "info",
      created_at: now.toISOString(),
    });

    await datastore.table("ScheduledReminders").updateRow({
      ROWID: reminder.ROWID,
      sent_at: now.toISOString(),
    });
    processed += 1;
  }

  return { processed };
}

async function resolveRecipient(
  catalystApp: CatalystApp,
  entityType: string,
  entityId: string,
): Promise<{ userId: string; label: string } | null> {
  const datastore = catalystApp.datastore();

  if (entityType === "capa_actions") {
    const rows = (await datastore.table("CAPA").getRows({
      criteria: `CAPA.ROWID = '${entityId}'`,
      maxRows: 1,
    })) as Array<CatalystRow & { owner_id: string; capa_number: string }>;
    const row = rows[0];
    return row ? { userId: row.owner_id, label: row.capa_number } : null;
  }

  if (entityType === "document_versions") {
    const rows = (await catalystApp.zcql().executeZCQLQuery(
      `select Documents.owner_id, Documents.title from DocumentVersions left join Documents on DocumentVersions.document_id = Documents.ROWID where DocumentVersions.ROWID = '${entityId}'`,
    )) as Array<{ Documents: { owner_id: string; title: string } | null }>;
    const doc = rows[0]?.Documents;
    return doc ? { userId: doc.owner_id, label: doc.title } : null;
  }

  return null;
}

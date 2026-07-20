import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { profiles } from "./identity";

export const notifications = pgTable("notifications", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => profiles.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  title: text("title").notNull(),
  body: text("body"),
  relatedEntityType: text("related_entity_type"),
  relatedEntityId: uuid("related_entity_id"),
  readAt: timestamp("read_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const scheduledReminders = pgTable("scheduled_reminders", {
  id: uuid("id").primaryKey().defaultRandom(),
  relatedEntityType: text("related_entity_type").notNull(),
  relatedEntityId: uuid("related_entity_id").notNull(),
  remindAt: timestamp("remind_at", { withTimezone: true }).notNull(),
  reminderType: text("reminder_type").notNull(),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  channel: text("channel").notNull().default("in_app"),
});

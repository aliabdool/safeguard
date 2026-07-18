import { jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { departments, properties } from "./reference";

/**
 * Append-only. No `updatedAt`, no soft-delete column, by design. The RLS/grants migration
 * revokes UPDATE/DELETE on this table entirely — see docs/security-model.md §3.4.
 * Never write passwords, secrets, or medical notes into this table.
 */
export const auditLog = pgTable("audit_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  actorId: uuid("actor_id"),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
  eventType: text("event_type").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: uuid("entity_id"),
  propertyId: uuid("property_id").references(() => properties.id),
  departmentId: uuid("department_id").references(() => departments.id),
  previousValue: jsonb("previous_value"),
  newValue: jsonb("new_value"),
  reason: text("reason"),
  requestId: text("request_id"),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
});

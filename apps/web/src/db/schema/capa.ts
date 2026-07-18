import { date, numeric, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import {
  capaPriorityEnum,
  capaSourceTypeEnum,
  capaStatusEnum,
  capaVerificationOutcomeEnum,
  hierarchyOfControlEnum,
} from "./_enums";
import { profiles } from "./identity";
import { departments, properties } from "./reference";

/**
 * One shared action table for every CAPA source. `sourceId` is a deliberate polymorphic
 * reference (ADR-0003, docs/implementation-plan.md) validated at the application layer.
 */
export const capaActions = pgTable("capa_actions", {
  id: uuid("id").primaryKey().defaultRandom(),
  actionNumber: text("action_number").notNull().unique(),
  sourceType: capaSourceTypeEnum("source_type").notNull(),
  sourceId: uuid("source_id").notNull(),
  description: text("description").notNull(),
  rootCause: text("root_cause"),
  correctiveAction: text("corrective_action"),
  preventiveAction: text("preventive_action"),
  hierarchyOfControl: hierarchyOfControlEnum("hierarchy_of_control"),
  ownerId: uuid("owner_id")
    .notNull()
    .references(() => profiles.id),
  propertyId: uuid("property_id")
    .notNull()
    .references(() => properties.id, { onDelete: "restrict" }),
  departmentId: uuid("department_id").references(() => departments.id, {
    onDelete: "restrict",
  }),
  priority: capaPriorityEnum("priority").notNull().default("medium"),
  dueDate: date("due_date").notNull(),
  cost: numeric("cost", { precision: 12, scale: 2 }),
  requiredEvidence: text("required_evidence"),
  status: capaStatusEnum("status").notNull().default("open"),
  verificationOwnerId: uuid("verification_owner_id").references(() => profiles.id),
  effectivenessReviewDate: date("effectiveness_review_date"),
  finalApprovedBy: uuid("final_approved_by").references(() => profiles.id),
  finalApprovedAt: timestamp("final_approved_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const capaVerifications = pgTable("capa_verifications", {
  id: uuid("id").primaryKey().defaultRandom(),
  capaId: uuid("capa_id")
    .notNull()
    .references(() => capaActions.id, { onDelete: "cascade" }),
  verifierId: uuid("verifier_id")
    .notNull()
    .references(() => profiles.id),
  verifiedAt: timestamp("verified_at", { withTimezone: true }).notNull().defaultNow(),
  outcome: capaVerificationOutcomeEnum("outcome").notNull(),
  comment: text("comment"),
});

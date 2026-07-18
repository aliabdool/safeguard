import {
  boolean,
  integer,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

import { frameworkCodeEnum, maturityDimensionEnum } from "./_enums";
import { profiles } from "./identity";
import { departments, properties } from "./reference";

export const frameworks = pgTable("frameworks", {
  id: uuid("id").primaryKey().defaultRandom(),
  code: frameworkCodeEnum("code").notNull().unique(),
  name: text("name").notNull(),
  description: text("description"),
});

/** The single master control library. Never duplicated per framework — see docs/framework-model.md. */
export const controls = pgTable("controls", {
  id: uuid("id").primaryKey().defaultRandom(),
  controlCode: text("control_code").notNull().unique(),
  title: text("title").notNull(),
  description: text("description"),
  category: text("category"),
  isLifeSafetyCritical: boolean("is_life_safety_critical").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const controlFrameworkMappings = pgTable(
  "control_framework_mappings",
  {
    controlId: uuid("control_id")
      .notNull()
      .references(() => controls.id, { onDelete: "cascade" }),
    frameworkId: uuid("framework_id")
      .notNull()
      .references(() => frameworks.id, { onDelete: "cascade" }),
    clauseReference: text("clause_reference"),
    weight: real("weight").notNull().default(1),
  },
  (table) => [primaryKey({ columns: [table.controlId, table.frameworkId] })],
);

export const legalRequirementDetails = pgTable("legal_requirement_details", {
  controlId: uuid("control_id")
    .primaryKey()
    .references(() => controls.id, { onDelete: "cascade" }),
  citation: text("citation").notNull(),
  regulator: text("regulator"),
  penaltyDescription: text("penalty_description"),
  renewalFrequency: text("renewal_frequency"),
  contentStatus: text("content_status").notNull().default("starter_set_needs_legal_review"),
});

export const controlAssessments = pgTable("control_assessments", {
  id: uuid("id").primaryKey().defaultRandom(),
  controlId: uuid("control_id")
    .notNull()
    .references(() => controls.id, { onDelete: "cascade" }),
  propertyId: uuid("property_id")
    .notNull()
    .references(() => properties.id, { onDelete: "restrict" }),
  departmentId: uuid("department_id").references(() => departments.id, {
    onDelete: "restrict",
  }),
  periodLabel: text("period_label").notNull(),
  dimension: maturityDimensionEnum("dimension").notNull(),
  maturityScore: integer("maturity_score").notNull(),
  isCriticalGap: boolean("is_critical_gap").notNull().default(false),
  assessedBy: uuid("assessed_by")
    .notNull()
    .references(() => profiles.id),
  assessedAt: timestamp("assessed_at", { withTimezone: true }).notNull().defaultNow(),
  notes: text("notes"),
});

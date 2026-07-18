import {
  date,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

import { dataQualityStatusEnum, kpiClassificationEnum } from "./_enums";
import { frameworks } from "./framework";
import { profiles } from "./identity";
import { departments, properties } from "./reference";

export const kpiDefinitions = pgTable("kpi_definitions", {
  id: uuid("id").primaryKey().defaultRandom(),
  kpiCode: text("kpi_code").notNull().unique(),
  name: text("name").notNull(),
  definition: text("definition").notNull(),
  formula: text("formula").notNull(),
  unit: text("unit").notNull(),
  classification: kpiClassificationEnum("classification").notNull(),
  reportingBoundary: text("reporting_boundary"),
  inclusionRules: text("inclusion_rules"),
  exclusionRules: text("exclusion_rules"),
  reportingFrequency: text("reporting_frequency").notNull().default("monthly"),
  dataOwnerId: uuid("data_owner_id").references(() => profiles.id),
  approverId: uuid("approver_id").references(() => profiles.id),
  sourceTables: text("source_tables").array().notNull().default([]),
  target: numeric("target", { precision: 14, scale: 4 }),
  warningThreshold: numeric("warning_threshold", { precision: 14, scale: 4 }),
  criticalThreshold: numeric("critical_threshold", { precision: 14, scale: 4 }),
  evidenceRequirements: text("evidence_requirements"),
  assuranceStatus: text("assurance_status").notNull().default("unverified"),
  version: integer("version").notNull().default(1),
  effectiveFrom: date("effective_from").notNull(),
  effectiveTo: date("effective_to"),
  direction: text("direction").notNull().default("lower_better"),
});

export const kpiFrameworkMappings = pgTable(
  "kpi_framework_mappings",
  {
    kpiId: uuid("kpi_id")
      .notNull()
      .references(() => kpiDefinitions.id, { onDelete: "cascade" }),
    frameworkId: uuid("framework_id")
      .notNull()
      .references(() => frameworks.id, { onDelete: "cascade" }),
  },
  (table) => [primaryKey({ columns: [table.kpiId, table.frameworkId] })],
);

/** Snapshot cache — always recomputable, never the sole source of truth. See docs/kpi-catalogue.md §3. */
export const kpiCalculations = pgTable("kpi_calculations", {
  id: uuid("id").primaryKey().defaultRandom(),
  kpiId: uuid("kpi_id")
    .notNull()
    .references(() => kpiDefinitions.id, { onDelete: "cascade" }),
  propertyId: uuid("property_id").references(() => properties.id),
  departmentId: uuid("department_id").references(() => departments.id),
  periodStart: date("period_start").notNull(),
  periodEnd: date("period_end").notNull(),
  comparisonPeriodStart: date("comparison_period_start"),
  comparisonPeriodEnd: date("comparison_period_end"),
  currentValue: numeric("current_value", { precision: 14, scale: 4 }),
  comparisonValue: numeric("comparison_value", { precision: 14, scale: 4 }),
  varianceAbs: numeric("variance_abs", { precision: 14, scale: 4 }),
  variancePct: numeric("variance_pct", { precision: 8, scale: 4 }),
  dataThroughDate: date("data_through_date").notNull(),
  dataQualityStatus: dataQualityStatusEnum("data_quality_status").notNull().default("ok"),
  includedRecordIds: jsonb("included_record_ids").notNull().default([]),
  excludedRecordIds: jsonb("excluded_record_ids").notNull().default([]),
  calculatedBy: uuid("calculated_by"),
  calculatedAt: timestamp("calculated_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Manually-entered, versioned exposure data (hours worked, occupied room nights) that feeds
 * rate-based KPIs (LTIFR, TRIR, Severity Rate, guest-incidents-per-1000-room-nights). No
 * rostering/PMS integration exists yet — see docs/implementation-plan.md §4 assumption 2.
 */
export const exposureData = pgTable("exposure_data", {
  id: uuid("id").primaryKey().defaultRandom(),
  propertyId: uuid("property_id")
    .notNull()
    .references(() => properties.id, { onDelete: "restrict" }),
  periodStart: date("period_start").notNull(),
  periodEnd: date("period_end").notNull(),
  totalHoursWorked: numeric("total_hours_worked", { precision: 14, scale: 2 }),
  occupiedRoomNights: numeric("occupied_room_nights", { precision: 14, scale: 2 }),
  enteredBy: uuid("entered_by")
    .notNull()
    .references(() => profiles.id),
  approvedBy: uuid("approved_by").references(() => profiles.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

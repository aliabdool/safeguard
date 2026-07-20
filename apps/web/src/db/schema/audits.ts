import { date, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import {
  auditStatusEnum,
  auditTypeEnum,
  findingClassificationEnum,
  findingStatusEnum,
  maturityDimensionEnum,
} from "./_enums";
import { controls } from "./framework";
import { documentVersions } from "./documents";
import { profiles } from "./identity";
import { departments, properties } from "./reference";

export const audits = pgTable("audits", {
  id: uuid("id").primaryKey().defaultRandom(),
  auditReference: text("audit_reference").notNull().unique(),
  type: auditTypeEnum("type").notNull(),
  scope: text("scope"),
  criteria: text("criteria"),
  propertyId: uuid("property_id")
    .notNull()
    .references(() => properties.id, { onDelete: "restrict" }),
  leadAuditorId: uuid("lead_auditor_id")
    .notNull()
    .references(() => profiles.id),
  plannedStart: date("planned_start"),
  plannedEnd: date("planned_end"),
  actualStart: date("actual_start"),
  actualEnd: date("actual_end"),
  status: auditStatusEnum("status").notNull().default("planned"),
  reportDocumentVersionId: uuid("report_document_version_id").references(
    () => documentVersions.id,
  ),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const auditDepartments = pgTable("audit_departments", {
  auditId: uuid("audit_id")
    .notNull()
    .references(() => audits.id, { onDelete: "cascade" }),
  departmentId: uuid("department_id")
    .notNull()
    .references(() => departments.id, { onDelete: "restrict" }),
});

export const auditTeamMembers = pgTable("audit_team_members", {
  auditId: uuid("audit_id")
    .notNull()
    .references(() => audits.id, { onDelete: "cascade" }),
  userId: uuid("user_id")
    .notNull()
    .references(() => profiles.id, { onDelete: "cascade" }),
  roleOnAudit: text("role_on_audit").notNull().default("team_member"),
});

export const auditChecklistItems = pgTable("audit_checklist_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  auditId: uuid("audit_id")
    .notNull()
    .references(() => audits.id, { onDelete: "cascade" }),
  controlId: uuid("control_id").references(() => controls.id),
  question: text("question").notNull(),
  criteriaReference: text("criteria_reference"),
});

export const auditAssessments = pgTable("audit_assessments", {
  id: uuid("id").primaryKey().defaultRandom(),
  checklistItemId: uuid("checklist_item_id")
    .notNull()
    .references(() => auditChecklistItems.id, { onDelete: "cascade" }),
  dimension: maturityDimensionEnum("dimension").notNull(),
  maturityScore: integer("maturity_score").notNull(),
  evidenceReviewed: text("evidence_reviewed"),
  assessorId: uuid("assessor_id")
    .notNull()
    .references(() => profiles.id),
  assessedAt: timestamp("assessed_at", { withTimezone: true }).notNull().defaultNow(),
});

export const auditFindings = pgTable("audit_findings", {
  id: uuid("id").primaryKey().defaultRandom(),
  auditId: uuid("audit_id")
    .notNull()
    .references(() => audits.id, { onDelete: "cascade" }),
  findingNumber: text("finding_number").notNull().unique(),
  controlId: uuid("control_id").references(() => controls.id),
  classification: findingClassificationEnum("classification").notNull(),
  description: text("description").notNull(),
  evidence: text("evidence"),
  raisedBy: uuid("raised_by")
    .notNull()
    .references(() => profiles.id),
  raisedAt: timestamp("raised_at", { withTimezone: true }).notNull().defaultNow(),
  status: findingStatusEnum("status").notNull().default("open"),
});

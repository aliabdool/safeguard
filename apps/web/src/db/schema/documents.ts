import { date, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import {
  confidentialityLevelEnum,
  documentApprovalActionEnum,
  documentStatusEnum,
  evidenceLevelEnum,
  evidenceLinkedEntityTypeEnum,
  verificationStatusEnum,
} from "./_enums";
import { files } from "./files";
import { profiles } from "./identity";
import { departments, properties } from "./reference";

export const documents = pgTable("documents", {
  id: uuid("id").primaryKey().defaultRandom(),
  documentNumber: text("document_number").notNull().unique(),
  title: text("title").notNull(),
  category: text("category").notNull(),
  ownerId: uuid("owner_id")
    .notNull()
    .references(() => profiles.id),
  currentVersionId: uuid("current_version_id"),
  confidentialityLevel: confidentialityLevelEnum("confidentiality_level")
    .notNull()
    .default("internal"),
  retentionPeriodMonths: integer("retention_period_months"),
  status: documentStatusEnum("status").notNull().default("draft"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const documentVersions = pgTable("document_versions", {
  id: uuid("id").primaryKey().defaultRandom(),
  documentId: uuid("document_id")
    .notNull()
    .references(() => documents.id, { onDelete: "cascade" }),
  versionNo: integer("version_no").notNull(),
  fileId: uuid("file_id")
    .notNull()
    .references(() => files.id),
  effectiveDate: date("effective_date"),
  reviewDate: date("review_date"),
  expiryDate: date("expiry_date"),
  approverId: uuid("approver_id").references(() => profiles.id),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  uploadedBy: uuid("uploaded_by")
    .notNull()
    .references(() => profiles.id),
  uploadedAt: timestamp("uploaded_at", { withTimezone: true }).notNull().defaultNow(),
  status: documentStatusEnum("status").notNull().default("draft"),
  changeSummary: text("change_summary"),
});

export const documentPropertyApplicability = pgTable("document_property_applicability", {
  documentId: uuid("document_id")
    .notNull()
    .references(() => documents.id, { onDelete: "cascade" }),
  propertyId: uuid("property_id")
    .notNull()
    .references(() => properties.id, { onDelete: "restrict" }),
});

export const documentDepartmentApplicability = pgTable("document_department_applicability", {
  documentId: uuid("document_id")
    .notNull()
    .references(() => documents.id, { onDelete: "cascade" }),
  departmentId: uuid("department_id")
    .notNull()
    .references(() => departments.id, { onDelete: "restrict" }),
});

export const documentApprovalHistory = pgTable("document_approval_history", {
  id: uuid("id").primaryKey().defaultRandom(),
  documentVersionId: uuid("document_version_id")
    .notNull()
    .references(() => documentVersions.id, { onDelete: "cascade" }),
  actorId: uuid("actor_id")
    .notNull()
    .references(() => profiles.id),
  action: documentApprovalActionEnum("action").notNull(),
  comment: text("comment"),
  actedAt: timestamp("acted_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * The reuse mechanism: one approved document version can be linked as evidence to many
 * unrelated entity types. `linkedEntityId` is a deliberate polymorphic reference (ADR-0003 in
 * docs/implementation-plan.md) — validated at the application layer, not by a DB foreign key.
 */
export const evidenceLinks = pgTable("evidence_links", {
  id: uuid("id").primaryKey().defaultRandom(),
  documentVersionId: uuid("document_version_id")
    .notNull()
    .references(() => documentVersions.id, { onDelete: "restrict" }),
  linkedEntityType: evidenceLinkedEntityTypeEnum("linked_entity_type").notNull(),
  linkedEntityId: uuid("linked_entity_id").notNull(),
  pageOrSection: text("page_or_section"),
  purpose: text("purpose"),
  evidenceLevel: evidenceLevelEnum("evidence_level").notNull(),
  propertyId: uuid("property_id").references(() => properties.id),
  departmentId: uuid("department_id").references(() => departments.id),
  reportingPeriod: text("reporting_period"),
  verificationStatus: verificationStatusEnum("verification_status")
    .notNull()
    .default("unverified"),
  verifiedBy: uuid("verified_by").references(() => profiles.id),
  verifiedAt: timestamp("verified_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

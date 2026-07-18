import {
  boolean,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

import {
  causeTypeEnum,
  incidentStatusEnum,
  investigationStatusEnum,
  personTypeEnum,
} from "./_enums";
import { documents } from "./documents";
import { files } from "./files";
import { profiles } from "./identity";
import { departments, properties } from "./reference";

export const incidents = pgTable("incidents", {
  id: uuid("id").primaryKey().defaultRandom(),
  incidentNumber: text("incident_number").notNull().unique(),
  propertyId: uuid("property_id")
    .notNull()
    .references(() => properties.id, { onDelete: "restrict" }),
  departmentId: uuid("department_id")
    .notNull()
    .references(() => departments.id, { onDelete: "restrict" }),
  locationDetail: text("location_detail"),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
  reportedBy: uuid("reported_by")
    .notNull()
    .references(() => profiles.id),
  personType: personTypeEnum("person_type").notNull(),
  incidentType: text("incident_type").notNull(),
  injuryType: text("injury_type"),
  bodyPart: text("body_part"),
  outcome: text("outcome").notNull(),
  actualSeverity: integer("actual_severity").notNull(),
  potentialSeverity: integer("potential_severity").notNull(),
  isHighPotential: boolean("is_high_potential").notNull().default(false),
  treatment: text("treatment"),
  hospitalReferral: boolean("hospital_referral").notNull().default(false),
  lostWorkdays: integer("lost_workdays").notNull().default(0),
  restrictedDutyDays: integer("restricted_duty_days").notNull().default(0),
  incidentCost: numeric("incident_cost", { precision: 12, scale: 2 }).notNull().default("0"),
  currency: text("currency").notNull().default("MUR"),
  businessInterruptionDays: integer("business_interruption_days").notNull().default(0),
  immediateActions: text("immediate_actions"),
  status: incidentStatusEnum("status").notNull().default("reported"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const incidentPersons = pgTable("incident_persons", {
  id: uuid("id").primaryKey().defaultRandom(),
  incidentId: uuid("incident_id")
    .notNull()
    .references(() => incidents.id, { onDelete: "cascade" }),
  personType: personTypeEnum("person_type").notNull(),
  fullName: text("full_name"),
  employeeOrReferenceNo: text("employee_or_reference_no"),
  isPrimary: boolean("is_primary").notNull().default(true),
});

export const incidentNotifications = pgTable("incident_notifications", {
  id: uuid("id").primaryKey().defaultRandom(),
  incidentId: uuid("incident_id")
    .notNull()
    .references(() => incidents.id, { onDelete: "cascade" }),
  notifiedParty: text("notified_party").notNull(),
  method: text("method"),
  notifiedAt: timestamp("notified_at", { withTimezone: true }).notNull().defaultNow(),
  notifiedBy: uuid("notified_by")
    .notNull()
    .references(() => profiles.id),
});

export const incidentAttachments = pgTable("incident_attachments", {
  id: uuid("id").primaryKey().defaultRandom(),
  incidentId: uuid("incident_id")
    .notNull()
    .references(() => incidents.id, { onDelete: "cascade" }),
  fileId: uuid("file_id")
    .notNull()
    .references(() => files.id, { onDelete: "restrict" }),
  isPhoto: boolean("is_photo").notNull().default(false),
  caption: text("caption"),
});

export const investigations = pgTable("investigations", {
  id: uuid("id").primaryKey().defaultRandom(),
  incidentId: uuid("incident_id")
    .notNull()
    .unique()
    .references(() => incidents.id, { onDelete: "cascade" }),
  investigatorId: uuid("investigator_id")
    .notNull()
    .references(() => profiles.id),
  assignedAt: timestamp("assigned_at", { withTimezone: true }).notNull().defaultNow(),
  eventReconstruction: text("event_reconstruction"),
  status: investigationStatusEnum("status").notNull().default("assigned"),
  completedAt: timestamp("completed_at", { withTimezone: true }),
});

export const investigationCauses = pgTable("investigation_causes", {
  id: uuid("id").primaryKey().defaultRandom(),
  investigationId: uuid("investigation_id")
    .notNull()
    .references(() => investigations.id, { onDelete: "cascade" }),
  causeType: causeTypeEnum("cause_type").notNull(),
  category: text("category"),
  description: text("description").notNull(),
});

export const investigationFiveWhys = pgTable("investigation_five_whys", {
  id: uuid("id").primaryKey().defaultRandom(),
  investigationId: uuid("investigation_id")
    .notNull()
    .references(() => investigations.id, { onDelete: "cascade" }),
  sequence: integer("sequence").notNull(),
  question: text("question").notNull(),
  answer: text("answer"),
});

export const investigationWitnesses = pgTable("investigation_witnesses", {
  id: uuid("id").primaryKey().defaultRandom(),
  investigationId: uuid("investigation_id")
    .notNull()
    .references(() => investigations.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  role: text("role"),
  statement: text("statement"),
  contact: text("contact"),
});

export const investigationLinkedProcedures = pgTable("investigation_linked_procedures", {
  investigationId: uuid("investigation_id")
    .notNull()
    .references(() => investigations.id, { onDelete: "cascade" }),
  documentId: uuid("document_id")
    .notNull()
    .references(() => documents.id, { onDelete: "restrict" }),
});

export const investigationApprovals = pgTable("investigation_approvals", {
  id: uuid("id").primaryKey().defaultRandom(),
  investigationId: uuid("investigation_id")
    .notNull()
    .references(() => investigations.id, { onDelete: "cascade" }),
  approverId: uuid("approver_id")
    .notNull()
    .references(() => profiles.id),
  decision: text("decision").notNull(),
  comment: text("comment"),
  decidedAt: timestamp("decided_at", { withTimezone: true }).notNull().defaultNow(),
});

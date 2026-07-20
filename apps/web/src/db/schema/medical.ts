import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { files } from "./files";
import { incidentPersons, incidents } from "./incidents";
import { profiles } from "./identity";

/**
 * Deliberately isolated from `incidents`: never joined into any query path used by
 * non-medical roles. RLS on this table checks `app_auth.has_medical_permission()` only —
 * role is irrelevant, including Super Administrator. See docs/security-model.md §3.3.
 */
export const medicalRecords = pgTable("medical_records", {
  id: uuid("id").primaryKey().defaultRandom(),
  incidentId: uuid("incident_id")
    .notNull()
    .references(() => incidents.id, { onDelete: "cascade" }),
  personReference: uuid("person_reference").references(() => incidentPersons.id),
  clinicalNotes: text("clinical_notes"),
  treatmentDetails: text("treatment_details"),
  practitionerName: text("practitioner_name"),
  createdBy: uuid("created_by")
    .notNull()
    .references(() => profiles.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const medicalAttachments = pgTable("medical_attachments", {
  id: uuid("id").primaryKey().defaultRandom(),
  medicalRecordId: uuid("medical_record_id")
    .notNull()
    .references(() => medicalRecords.id, { onDelete: "cascade" }),
  fileId: uuid("file_id")
    .notNull()
    .references(() => files.id, { onDelete: "restrict" }),
});

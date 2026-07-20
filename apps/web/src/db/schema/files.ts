import { bigint, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { fileAccessActionEnum, fileValidationStatusEnum, storageBucketEnum } from "./_enums";
import { profiles } from "./identity";

export const files = pgTable("files", {
  id: uuid("id").primaryKey().defaultRandom(),
  bucket: storageBucketEnum("bucket").notNull(),
  storagePath: text("storage_path").notNull(),
  originalFilename: text("original_filename").notNull(),
  mimeType: text("mime_type").notNull(),
  sizeBytes: bigint("size_bytes", { mode: "number" }).notNull(),
  checksumSha256: text("checksum_sha256"),
  uploadedBy: uuid("uploaded_by")
    .notNull()
    .references(() => profiles.id),
  uploadedAt: timestamp("uploaded_at", { withTimezone: true }).notNull().defaultNow(),
  validationStatus: fileValidationStatusEnum("validation_status").notNull().default("pending"),
});

export const fileAccessLog = pgTable("file_access_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  fileId: uuid("file_id")
    .notNull()
    .references(() => files.id, { onDelete: "cascade" }),
  accessedBy: uuid("accessed_by")
    .notNull()
    .references(() => profiles.id),
  accessedAt: timestamp("accessed_at", { withTimezone: true }).notNull().defaultNow(),
  action: fileAccessActionEnum("action").notNull(),
  signedUrlExpiresAt: timestamp("signed_url_expires_at", { withTimezone: true }),
});

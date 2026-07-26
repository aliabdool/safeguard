import "server-only";

import { createHash } from "node:crypto";

import { eq } from "drizzle-orm";

import { getDb } from "@/db";
import { fileAccessLog, files } from "@/db/schema";
import { createSupabaseServiceRoleClient } from "@/server/auth/service-role";
import { writeAuditLog } from "@/server/audit-log";

export type StorageBucket =
  | "incident-evidence"
  | "controlled-documents"
  | "audit-evidence"
  | "capa-evidence"
  | "restricted-medical";

/**
 * Per-bucket limits mirrored from the storage.buckets rows created in
 * drizzle/0001_auth_helpers_and_rls.sql §17 — kept here too so the application layer rejects an
 * invalid upload with a clear error *before* burning a signed URL, rather than only relying on
 * Supabase Storage's own bucket-level enforcement (defense in depth, same principle as RLS).
 */
const BUCKET_LIMITS: Record<StorageBucket, { maxBytes: number; mimeTypes: string[] }> = {
  "incident-evidence": {
    maxBytes: 15 * 1024 * 1024,
    mimeTypes: ["image/jpeg", "image/png", "image/webp", "image/heic", "application/pdf"],
  },
  "controlled-documents": {
    maxBytes: 50 * 1024 * 1024,
    mimeTypes: [
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ],
  },
  "audit-evidence": {
    maxBytes: 50 * 1024 * 1024,
    mimeTypes: [
      "application/pdf",
      "image/jpeg",
      "image/png",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ],
  },
  "capa-evidence": {
    maxBytes: 50 * 1024 * 1024,
    mimeTypes: [
      "application/pdf",
      "image/jpeg",
      "image/png",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ],
  },
  "restricted-medical": {
    maxBytes: 15 * 1024 * 1024,
    mimeTypes: ["application/pdf", "image/jpeg", "image/png"],
  },
};

const ALLOWED_EXTENSIONS: Record<string, string[]> = {
  "image/jpeg": [".jpg", ".jpeg"],
  "image/png": [".png"],
  "image/webp": [".webp"],
  "image/heic": [".heic"],
  "application/pdf": [".pdf"],
  "application/msword": [".doc"],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
  "application/vnd.ms-excel": [".xls"],
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"],
};

export class FileValidationError extends Error {}

function assertValidUpload(
  bucket: StorageBucket,
  filename: string,
  mimeType: string,
  sizeBytes: number,
) {
  const limits = BUCKET_LIMITS[bucket];
  if (sizeBytes > limits.maxBytes) {
    throw new FileValidationError(
      `File exceeds the ${limits.maxBytes / (1024 * 1024)}MB limit for this bucket.`,
    );
  }
  if (!limits.mimeTypes.includes(mimeType)) {
    throw new FileValidationError(`File type '${mimeType}' is not allowed in this bucket.`);
  }
  const ext = filename.toLowerCase().slice(filename.lastIndexOf("."));
  const allowedExts = ALLOWED_EXTENSIONS[mimeType] ?? [];
  if (!allowedExts.includes(ext)) {
    throw new FileValidationError(
      `File extension '${ext}' does not match declared type '${mimeType}'.`,
    );
  }
}

export interface CreateUploadUrlResult {
  fileId: string;
  signedUrl: string;
  token: string;
  storagePath: string;
}

/**
 * Mints a signed upload URL for a validated file and registers a `pending` row in `files`.
 * Caller MUST already have run the equivalent permission check for the domain table this file
 * will attach to (incident, CAPA, document, medical record) — this function only validates the
 * file itself, it does not know or care what it's attached to.
 */
export async function createUploadUrl(params: {
  bucket: StorageBucket;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  uploadedBy: string;
}): Promise<CreateUploadUrlResult> {
  assertValidUpload(params.bucket, params.filename, params.mimeType, params.sizeBytes);

  const db = getDb();
  const storagePath = `${params.uploadedBy}/${Date.now()}-${sanitizeFilename(params.filename)}`;

  const [fileRow] = await db
    .insert(files)
    .values({
      bucket: params.bucket,
      storagePath,
      originalFilename: params.filename,
      mimeType: params.mimeType,
      sizeBytes: params.sizeBytes,
      uploadedBy: params.uploadedBy,
      validationStatus: "pending",
    })
    .returning({ id: files.id });

  const admin = createSupabaseServiceRoleClient();
  const { data, error } = await admin.storage
    .from(params.bucket)
    .createSignedUploadUrl(storagePath);

  if (error || !data) {
    throw new Error(
      `Could not create signed upload URL: ${error?.message ?? "unknown error"}`,
    );
  }

  return { fileId: fileRow!.id, signedUrl: data.signedUrl, token: data.token, storagePath };
}

/**
 * Confirms an upload completed, computing the checksum server-side from the object that now
 * exists in Storage (never trusting a client-supplied checksum) and flipping validation_status.
 */
export async function confirmUpload(fileId: string): Promise<void> {
  const db = getDb();
  const [fileRow] = await db.select().from(files).where(eq(files.id, fileId)).limit(1);
  if (!fileRow) {
    throw new Error("Unknown file id.");
  }

  const admin = createSupabaseServiceRoleClient();
  const { data, error } = await admin.storage
    .from(fileRow.bucket)
    .download(fileRow.storagePath);
  if (error || !data) {
    await db.update(files).set({ validationStatus: "rejected" }).where(eq(files.id, fileId));
    throw new Error(`Upload confirmation failed: ${error?.message ?? "object not found"}`);
  }

  const buffer = Buffer.from(await data.arrayBuffer());
  const checksum = createHash("sha256").update(buffer).digest("hex");

  await db
    .update(files)
    .set({ checksumSha256: checksum, validationStatus: "passed" })
    .where(eq(files.id, fileId));
}

/**
 * Short-lived signed download URL. Every issuance is logged to `file_access_log` and
 * `audit_log` — see docs/security-model.md §4.
 */
export async function createDownloadUrl(params: {
  fileId: string;
  accessedBy: string;
  expiresInSeconds?: number;
  auditEventType?: "document_downloaded" | "medical_record_accessed";
}): Promise<string> {
  const db = getDb();
  const [fileRow] = await db.select().from(files).where(eq(files.id, params.fileId)).limit(1);
  if (!fileRow) {
    throw new Error("Unknown file id.");
  }

  const expiresInSeconds = params.expiresInSeconds ?? 300;
  const admin = createSupabaseServiceRoleClient();
  const { data, error } = await admin.storage
    .from(fileRow.bucket)
    .createSignedUrl(fileRow.storagePath, expiresInSeconds);

  if (error || !data) {
    throw new Error(
      `Could not create signed download URL: ${error?.message ?? "unknown error"}`,
    );
  }

  const expiresAt = new Date(Date.now() + expiresInSeconds * 1000);
  await db.insert(fileAccessLog).values({
    fileId: params.fileId,
    accessedBy: params.accessedBy,
    action: "download",
    signedUrlExpiresAt: expiresAt,
  });

  await writeAuditLog({
    actorId: params.accessedBy,
    eventType: params.auditEventType ?? "document_downloaded",
    entityType: "files",
    entityId: params.fileId,
  });

  return data.signedUrl;
}

function sanitizeFilename(filename: string): string {
  return filename.replace(/[^a-zA-Z0-9._-]/g, "_");
}

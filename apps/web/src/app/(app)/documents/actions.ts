"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { z } from "zod";

import type { ActionResult } from "@/app/(auth)/actions";
import { getDb } from "@/db";
import {
  documentApprovalHistory,
  documentDepartmentApplicability,
  documentPropertyApplicability,
  documentVersions,
  documents,
  evidenceLinks,
  scheduledReminders,
} from "@/db/schema";
import { writeAuditLog } from "@/server/audit-log";
import { nextDocumentNumber } from "@/server/documents/number";
import { requireActiveUser, requireRole } from "@/server/permissions";
import { confirmUpload, createUploadUrl, FileValidationError } from "@/server/storage";

const DOCUMENT_ROLES = [
  "PROPERTY_HS_OFFICER",
  "GROUP_HS_ADMIN",
  "SUPER_ADMIN",
  "INTERNAL_AUDITOR",
  "DEPARTMENT_MANAGER",
] as const;

const createSchema = z.object({
  title: z.string().min(1, "Title is required."),
  category: z.string().min(1, "Category is required."),
  confidentialityLevel: z.enum(["public", "internal", "confidential", "restricted"]),
  retentionPeriodMonths: z.coerce.number().int().min(0).optional(),
  propertyIds: z.array(z.string().uuid()),
  departmentIds: z.array(z.string().uuid()),
});

export async function createDocumentAction(
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const ctx = await requireRole([...DOCUMENT_ROLES]);
  const parsed = createSchema.safeParse({
    title: formData.get("title"),
    category: formData.get("category"),
    confidentialityLevel: formData.get("confidentialityLevel"),
    retentionPeriodMonths: formData.get("retentionPeriodMonths") || undefined,
    propertyIds: formData.getAll("propertyIds"),
    departmentIds: formData.getAll("departmentIds"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid document details." };
  }
  const data = parsed.data;

  const db = getDb();
  const documentNumber = await nextDocumentNumber();

  const [created] = await db
    .insert(documents)
    .values({
      documentNumber,
      title: data.title,
      category: data.category,
      ownerId: ctx.userId,
      confidentialityLevel: data.confidentialityLevel,
      retentionPeriodMonths: data.retentionPeriodMonths ?? null,
      status: "draft",
    })
    .returning({ id: documents.id });

  const documentId = created!.id;

  if (data.propertyIds.length > 0) {
    await db
      .insert(documentPropertyApplicability)
      .values(data.propertyIds.map((propertyId) => ({ documentId, propertyId })));
  }
  if (data.departmentIds.length > 0) {
    await db
      .insert(documentDepartmentApplicability)
      .values(data.departmentIds.map((departmentId) => ({ documentId, departmentId })));
  }

  await writeAuditLog({
    actorId: ctx.userId,
    eventType: "record_created",
    entityType: "documents",
    entityId: documentId,
    newValue: { title: data.title, status: "draft" },
  });

  revalidatePath("/documents");
  redirect(`/documents/${documentId}`);
}

export async function requestDocumentVersionUploadAction(input: {
  filename: string;
  mimeType: string;
  sizeBytes: number;
}) {
  const ctx = await requireActiveUser();
  try {
    return await createUploadUrl({
      bucket: "controlled-documents",
      filename: input.filename,
      mimeType: input.mimeType,
      sizeBytes: input.sizeBytes,
      uploadedBy: ctx.userId,
    });
  } catch (err) {
    if (err instanceof FileValidationError) {
      throw new Error(err.message);
    }
    throw err;
  }
}

const confirmVersionSchema = z.object({
  documentId: z.string().uuid(),
  fileId: z.string().uuid(),
  effectiveDate: z.string().optional(),
  reviewDate: z.string().optional(),
  expiryDate: z.string().optional(),
  changeSummary: z.string().optional(),
});

/**
 * Creates a NEW version row — never edits an existing (especially an already-approved) one, so
 * whatever an audit/assessment referenced at the time stays intact. See docs/database-model.md §7.
 */
export async function createDocumentVersionAction(input: {
  documentId: string;
  fileId: string;
  effectiveDate?: string;
  reviewDate?: string;
  expiryDate?: string;
  changeSummary?: string;
}) {
  const ctx = await requireActiveUser();
  const parsed = confirmVersionSchema.parse(input);

  await confirmUpload(parsed.fileId);

  const db = getDb();
  const existingVersions = await db
    .select({ versionNo: documentVersions.versionNo })
    .from(documentVersions)
    .where(eq(documentVersions.documentId, parsed.documentId));
  const nextVersionNo = existingVersions.reduce((max, v) => Math.max(max, v.versionNo), 0) + 1;

  const [version] = await db
    .insert(documentVersions)
    .values({
      documentId: parsed.documentId,
      versionNo: nextVersionNo,
      fileId: parsed.fileId,
      effectiveDate: parsed.effectiveDate || null,
      reviewDate: parsed.reviewDate || null,
      expiryDate: parsed.expiryDate || null,
      uploadedBy: ctx.userId,
      status: "under_review",
      changeSummary: parsed.changeSummary ?? null,
    })
    .returning({ id: documentVersions.id });

  await db
    .update(documents)
    .set({ status: "under_review", updatedAt: new Date() })
    .where(eq(documents.id, parsed.documentId));

  await db.insert(documentApprovalHistory).values({
    documentVersionId: version!.id,
    actorId: ctx.userId,
    action: "submitted",
  });

  await writeAuditLog({
    actorId: ctx.userId,
    eventType: "document_uploaded",
    entityType: "document_versions",
    entityId: version!.id,
  });

  if (parsed.reviewDate) {
    await db.insert(scheduledReminders).values({
      relatedEntityType: "document_versions",
      relatedEntityId: version!.id,
      remindAt: new Date(parsed.reviewDate),
      reminderType: "document_review_due",
    });
  }

  revalidatePath(`/documents/${parsed.documentId}`);
  return version!.id;
}

const approveSchema = z.object({
  documentId: z.string().uuid(),
  versionId: z.string().uuid(),
  comment: z.string().optional(),
});

/** Approver must be distinct from the uploader — same "not the same person" discipline as CAPA. */
export async function approveDocumentVersionAction(
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const ctx = await requireRole(["PROPERTY_HS_OFFICER", "GROUP_HS_ADMIN", "SUPER_ADMIN"]);
  const parsed = approveSchema.safeParse({
    documentId: formData.get("documentId"),
    versionId: formData.get("versionId"),
    comment: formData.get("comment") ?? undefined,
  });
  if (!parsed.success) {
    return { error: "Invalid approval." };
  }

  const db = getDb();
  const [version] = await db
    .select()
    .from(documentVersions)
    .where(eq(documentVersions.id, parsed.data.versionId))
    .limit(1);
  if (!version) {
    return { error: "Unknown document version." };
  }
  if (version.uploadedBy === ctx.userId) {
    return { error: "The uploader cannot also approve their own document version." };
  }

  const now = new Date();
  await db
    .update(documentVersions)
    .set({ status: "approved", approverId: ctx.userId, approvedAt: now })
    .where(eq(documentVersions.id, parsed.data.versionId));

  await db
    .update(documents)
    .set({ status: "approved", currentVersionId: parsed.data.versionId, updatedAt: now })
    .where(eq(documents.id, parsed.data.documentId));

  await db.insert(documentApprovalHistory).values({
    documentVersionId: parsed.data.versionId,
    actorId: ctx.userId,
    action: "approved",
    comment: parsed.data.comment ?? null,
  });

  await writeAuditLog({
    actorId: ctx.userId,
    eventType: "approval",
    entityType: "document_versions",
    entityId: parsed.data.versionId,
  });

  revalidatePath(`/documents/${parsed.data.documentId}`);
  return {};
}

const evidenceLinkSchema = z.object({
  documentVersionId: z.string().uuid(),
  documentId: z.string().uuid(),
  linkedEntityType: z.enum([
    "control_assessment",
    "kpi_definition",
    "audit",
    "audit_finding",
    "capa_action",
    "disclosure",
  ]),
  linkedEntityId: z.string().uuid(),
  evidenceLevel: z.enum(["policy", "procedure", "implementation", "effectiveness"]),
  purpose: z.string().optional(),
  pageOrSection: z.string().optional(),
  reportingPeriod: z.string().optional(),
});

export async function addEvidenceLinkAction(
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const ctx = await requireActiveUser();
  const parsed = evidenceLinkSchema.safeParse({
    documentVersionId: formData.get("documentVersionId"),
    documentId: formData.get("documentId"),
    linkedEntityType: formData.get("linkedEntityType"),
    linkedEntityId: formData.get("linkedEntityId"),
    evidenceLevel: formData.get("evidenceLevel"),
    purpose: formData.get("purpose") ?? undefined,
    pageOrSection: formData.get("pageOrSection") ?? undefined,
    reportingPeriod: formData.get("reportingPeriod") ?? undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid evidence link." };
  }

  const db = getDb();
  await db.insert(evidenceLinks).values({
    documentVersionId: parsed.data.documentVersionId,
    linkedEntityType: parsed.data.linkedEntityType,
    linkedEntityId: parsed.data.linkedEntityId,
    evidenceLevel: parsed.data.evidenceLevel,
    purpose: parsed.data.purpose ?? null,
    pageOrSection: parsed.data.pageOrSection ?? null,
    reportingPeriod: parsed.data.reportingPeriod ?? null,
  });

  await writeAuditLog({
    actorId: ctx.userId,
    eventType: "record_created",
    entityType: "evidence_links",
    newValue: {
      linkedEntityType: parsed.data.linkedEntityType,
      linkedEntityId: parsed.data.linkedEntityId,
    },
  });

  revalidatePath(`/documents/${parsed.data.documentId}`);
  return {};
}

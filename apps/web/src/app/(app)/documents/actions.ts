"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import type { ActionResult } from "@/app/(auth)/actions";
import { catalystAppFromHeaders, type CatalystRow } from "@/lib/catalyst/app";
import { writeAuditLog } from "@/server/audit-log";
import { nextDocumentNumber } from "@/server/documents/number";
import { requireActiveUser, requireRole } from "@/server/permissions";

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
  propertyIds: z.array(z.string()),
  departmentIds: z.array(z.string()),
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

  const catalystApp = catalystAppFromHeaders(await headers());
  const datastore = catalystApp.datastore();
  const documentNumber = await nextDocumentNumber(catalystApp);

  const created = await datastore.table("Documents").insertRow({
    document_number: documentNumber,
    title: data.title,
    category: data.category,
    owner_id: ctx.userId,
    confidentiality_level: data.confidentialityLevel,
    retention_period_months: data.retentionPeriodMonths ?? null,
    status: "draft",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });
  const documentId = String(created.ROWID);

  if (data.propertyIds.length > 0) {
    await Promise.all(
      data.propertyIds.map((propertyId) =>
        datastore.table("DocumentPropertyApplicability").insertRow({
          document_id: documentId,
          property_id: propertyId,
        }),
      ),
    );
  }
  if (data.departmentIds.length > 0) {
    await Promise.all(
      data.departmentIds.map((departmentId) =>
        datastore.table("DocumentDepartmentApplicability").insertRow({
          document_id: documentId,
          department_id: departmentId,
        }),
      ),
    );
  }

  await writeAuditLog({
    actorId: ctx.userId,
    eventType: "record_created",
    entityType: "Documents",
    entityId: documentId,
    newValue: { title: data.title, status: "draft" },
  });

  revalidatePath("/documents");
  redirect(`/documents/${documentId}`);
}

/**
 * TODO(Phase D): file upload still targeted Supabase Storage and a Postgres files.id — that ID
 * can't be stored in Catalyst's DocumentVersions.file_id (which references Catalyst's own File
 * Store once that migrates), and the Postgres files/document_versions tables' relationships no
 * longer resolve now that documents are created in Catalyst, not Postgres. Wiring this up
 * correctly requires the storage migration to Catalyst File Store first; until then this action
 * intentionally errors rather than silently writing a dangling/wrong reference. Signature kept
 * identical to the pre-migration version so version-upload.tsx still typechecks unchanged. See
 * requestIncidentAttachmentUploadAction/confirmIncidentAttachmentAction in
 * app/(app)/incidents/actions.ts for the precedent this mirrors.
 */
export async function requestDocumentVersionUploadAction(_input: {
  filename: string;
  mimeType: string;
  sizeBytes: number;
}): Promise<{ fileId: string; storagePath: string; token: string }> {
  throw new Error(
    "Document upload is temporarily unavailable during the migration to Zoho Catalyst — file storage has not moved over yet.",
  );
}

/**
 * TODO(Phase D): see requestDocumentVersionUploadAction above — creating a version record only
 * makes sense once there's a real, confirmed file behind it. Also note: the pre-migration version
 * of this action scheduled a `document_review_due` row in Postgres' scheduledReminders table when
 * a review date was set. That table (and the cron job that processes it,
 * server/cron/process-reminders.ts) has not moved to Catalyst yet — out of this module's scope —
 * so review-date reminder scheduling is deferred along with the rest of this action until both
 * file storage and notifications have migrated.
 */
export async function createDocumentVersionAction(_input: {
  documentId: string;
  fileId: string;
  effectiveDate?: string;
  reviewDate?: string;
  expiryDate?: string;
  changeSummary?: string;
}): Promise<string> {
  throw new Error(
    "Document upload is temporarily unavailable during the migration to Zoho Catalyst — file storage has not moved over yet.",
  );
}

const approveSchema = z.object({
  documentId: z.string(),
  versionId: z.string(),
  comment: z.string().optional(),
});

interface DocumentVersionRow extends CatalystRow {
  document_id: string;
  uploaded_by: string;
  status: string;
}

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

  const catalystApp = catalystAppFromHeaders(await headers());
  const datastore = catalystApp.datastore();

  const versionRows = (await datastore.table("DocumentVersions").getRows({
    criteria: `DocumentVersions.ROWID = '${parsed.data.versionId}'`,
    maxRows: 1,
  })) as DocumentVersionRow[];
  const version = versionRows[0];
  if (!version) {
    return { error: "Unknown document version." };
  }
  if (version.uploaded_by === ctx.userId) {
    return { error: "The uploader cannot also approve their own document version." };
  }

  await datastore.table("DocumentVersions").updateRow({
    ROWID: parsed.data.versionId,
    status: "approved",
  });

  await datastore.table("Documents").updateRow({
    ROWID: parsed.data.documentId,
    status: "approved",
    current_version_id: parsed.data.versionId,
    updated_at: new Date().toISOString(),
  });

  // The approval DECISION as its own record (DocumentApprovals) — mirrors CAPAVerification /
  // IncidentInvestigation's approvals tables, independent of the status column above.
  await datastore.table("DocumentApprovals").insertRow({
    document_version_id: parsed.data.versionId,
    approver_id: ctx.userId,
    outcome: "approved",
    notes: parsed.data.comment ?? null,
    decided_at: new Date().toISOString(),
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
  documentVersionId: z.string(),
  documentId: z.string(),
  linkedEntityType: z.enum([
    "control_assessment",
    "kpi_definition",
    "audit",
    "audit_finding",
    "capa_action",
    "disclosure",
  ]),
  linkedEntityId: z.string(),
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

  const catalystApp = catalystAppFromHeaders(await headers());
  await catalystApp.datastore().table("DocumentEvidenceLinks").insertRow({
    document_version_id: parsed.data.documentVersionId,
    linked_entity_type: parsed.data.linkedEntityType,
    linked_entity_id: parsed.data.linkedEntityId,
    evidence_level: parsed.data.evidenceLevel,
    purpose: parsed.data.purpose ?? null,
    page_or_section: parsed.data.pageOrSection ?? null,
    reporting_period: parsed.data.reportingPeriod ?? null,
    linked_by: ctx.userId,
    linked_at: new Date().toISOString(),
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

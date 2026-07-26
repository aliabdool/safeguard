"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import type { ActionResult } from "@/app/(auth)/actions";
import { catalystAppFromHeaders } from "@/lib/catalyst/app";
import { writeAuditLog } from "@/server/audit-log";
import { requireMedicalPermission } from "@/server/permissions";

const createSchema = z.object({
  incidentId: z.string(),
  personReference: z.string().optional().or(z.literal("")),
  clinicalNotes: z.string().min(1, "Clinical notes are required."),
  treatmentDetails: z.string().optional(),
  practitionerName: z.string().optional(),
});

/**
 * Every write here requires an explicit medical-data permission grant — see
 * requireMedicalPermission() and docs/security-model.md §3.3. Catalyst's Data Store has no RLS
 * equivalent (see apps/catalyst/data-store-schema/README.md), so this application-layer check is
 * now the sole enforcement layer — there is no independent database-level backstop the way
 * Postgres RLS provided.
 */
export async function createMedicalRecordAction(
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const ctx = await requireMedicalPermission();
  const parsed = createSchema.safeParse({
    incidentId: formData.get("incidentId"),
    personReference: formData.get("personReference") ?? "",
    clinicalNotes: formData.get("clinicalNotes"),
    treatmentDetails: formData.get("treatmentDetails") ?? undefined,
    practitionerName: formData.get("practitionerName") ?? undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid medical record." };
  }

  const catalystApp = catalystAppFromHeaders(await headers());
  await catalystApp.datastore().table("MedicalNotes").insertRow({
    incident_id: parsed.data.incidentId,
    incident_person_id: parsed.data.personReference || null,
    clinical_notes: parsed.data.clinicalNotes,
    treatment_details: parsed.data.treatmentDetails ?? null,
    practitioner_name: parsed.data.practitionerName ?? null,
    created_by: ctx.userId,
  });

  // Deliberately no clinical content in the audit log — only that an access/write event
  // happened, per docs/security-model.md §3.4 ("no medical notes stored in the audit log").
  await writeAuditLog({
    actorId: ctx.userId,
    eventType: "medical_record_accessed",
    entityType: "MedicalNotes",
    entityId: parsed.data.incidentId,
    reason: "created",
  });

  revalidatePath(`/incidents/${parsed.data.incidentId}/medical`);
  return {};
}

"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import type { ActionResult } from "@/app/(auth)/actions";
import { getDb } from "@/db";
import { medicalRecords } from "@/db/schema";
import { writeAuditLog } from "@/server/audit-log";
import { requireMedicalPermission } from "@/server/permissions";

const createSchema = z.object({
  incidentId: z.string().uuid(),
  personReference: z.string().uuid().optional().or(z.literal("")),
  clinicalNotes: z.string().min(1, "Clinical notes are required."),
  treatmentDetails: z.string().optional(),
  practitionerName: z.string().optional(),
});

/**
 * Every write here requires an explicit medical-data permission grant — see
 * requireMedicalPermission() and docs/security-model.md §3.3. RLS independently enforces the
 * same rule at the database layer (medical_records_write policy), so even if this check were
 * ever bypassed the insert would still be rejected.
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

  const db = getDb();
  await db.insert(medicalRecords).values({
    incidentId: parsed.data.incidentId,
    personReference: parsed.data.personReference || null,
    clinicalNotes: parsed.data.clinicalNotes,
    treatmentDetails: parsed.data.treatmentDetails ?? null,
    practitionerName: parsed.data.practitionerName ?? null,
    createdBy: ctx.userId,
  });

  // Deliberately no clinical content in the audit log — only that an access/write event
  // happened, per docs/security-model.md §3.4 ("no medical notes stored in the audit log").
  await writeAuditLog({
    actorId: ctx.userId,
    eventType: "medical_record_accessed",
    entityType: "medical_records",
    entityId: parsed.data.incidentId,
    reason: "created",
  });

  revalidatePath(`/incidents/${parsed.data.incidentId}/medical`);
  return {};
}

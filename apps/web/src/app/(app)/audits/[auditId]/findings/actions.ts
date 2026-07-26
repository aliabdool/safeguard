"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import type { ActionResult } from "@/app/(auth)/actions";
import { getDb } from "@/db";
import { auditFindings } from "@/db/schema";
import { writeAuditLog } from "@/server/audit-log";
import { nextFindingNumber } from "@/server/audits/number";
import { requireActiveUser } from "@/server/permissions";

const schema = z.object({
  auditId: z.string().uuid(),
  controlId: z.string().uuid().optional().or(z.literal("")),
  classification: z.enum(["critical_nc", "major_nc", "minor_nc", "observation", "ofi"]),
  description: z.string().min(1, "Description is required."),
  evidence: z.string().optional(),
});

export async function createFindingAction(
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const ctx = await requireActiveUser();
  const parsed = schema.safeParse({
    auditId: formData.get("auditId"),
    controlId: formData.get("controlId") ?? "",
    classification: formData.get("classification"),
    description: formData.get("description"),
    evidence: formData.get("evidence") ?? undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid finding." };
  }
  const data = parsed.data;

  const db = getDb();
  const findingNumber = await nextFindingNumber();

  const [created] = await db
    .insert(auditFindings)
    .values({
      auditId: data.auditId,
      findingNumber,
      controlId: data.controlId || null,
      classification: data.classification,
      description: data.description,
      evidence: data.evidence ?? null,
      raisedBy: ctx.userId,
      status: "open",
    })
    .returning({ id: auditFindings.id });

  await writeAuditLog({
    actorId: ctx.userId,
    eventType: "record_created",
    entityType: "audit_findings",
    entityId: created!.id,
    newValue: { classification: data.classification, status: "open" },
  });

  revalidatePath(`/audits/${data.auditId}/findings`);
  redirect(`/audits/findings/${created!.id}`);
}

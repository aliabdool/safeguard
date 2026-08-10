"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import type { ActionResult } from "@/app/(auth)/actions";
import { catalystAppFromHeaders } from "@/lib/catalyst/app";
import { toZcqlDateTime } from "@/lib/catalyst/zcql-datetime";
import { writeAuditLog } from "@/server/audit-log";
import { nextFindingNumber } from "@/server/audits/number";
import { requireActiveUser } from "@/server/permissions";

const schema = z.object({
  auditId: z.string(),
  controlId: z.string().optional().or(z.literal("")),
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

  const catalystApp = catalystAppFromHeaders(await headers());
  const datastore = catalystApp.datastore();
  const findingNumber = await nextFindingNumber(catalystApp);

  const created = await datastore.table("AuditFindings").insertRow({
    audit_id: data.auditId,
    finding_number: findingNumber,
    control_id: data.controlId || null,
    classification: data.classification,
    description: data.description,
    evidence: data.evidence ?? null,
    raised_by: ctx.userId,
    raised_at: toZcqlDateTime(new Date()),
    status: "open",
  });
  const findingId = String(created.ROWID);

  await writeAuditLog({
    actorId: ctx.userId,
    eventType: "record_created",
    entityType: "AuditFindings",
    entityId: findingId,
    newValue: { classification: data.classification, status: "open" },
  });

  revalidatePath(`/audits/${data.auditId}/findings`);
  redirect(`/audits/findings/${findingId}`);
}

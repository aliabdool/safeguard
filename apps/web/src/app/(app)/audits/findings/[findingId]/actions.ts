"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";

import type { ActionResult } from "@/app/(auth)/actions";
import { getDb } from "@/db";
import { auditFindings, capaActions } from "@/db/schema";
import { writeAuditLog } from "@/server/audit-log";
import { requireRole } from "@/server/permissions";

const STATUS_ORDER = ["open", "action_assigned", "verified", "closed"] as const;
type FindingStatus = (typeof STATUS_ORDER)[number];

export async function advanceFindingStatusAction(
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const findingId = formData.get("findingId")?.toString();
  const targetStatus = formData.get("targetStatus")?.toString() as FindingStatus | undefined;
  if (!findingId || !targetStatus || !STATUS_ORDER.includes(targetStatus)) {
    return { error: "Invalid request." };
  }

  const ctx = await requireRole(["INTERNAL_AUDITOR", "GROUP_HS_ADMIN", "SUPER_ADMIN"]);
  const db = getDb();
  const [finding] = await db
    .select()
    .from(auditFindings)
    .where(eq(auditFindings.id, findingId))
    .limit(1);
  if (!finding) {
    return { error: "Unknown finding." };
  }

  const currentIndex = STATUS_ORDER.indexOf(finding.status);
  const targetIndex = STATUS_ORDER.indexOf(targetStatus);
  if (targetIndex !== currentIndex + 1) {
    return { error: `Cannot move from '${finding.status}' to '${targetStatus}'.` };
  }

  if (targetStatus === "closed") {
    const linkedCapas = await db
      .select({ status: capaActions.status })
      .from(capaActions)
      .where(
        and(eq(capaActions.sourceType, "audit_finding"), eq(capaActions.sourceId, findingId)),
      );
    const openCapas = linkedCapas.filter((c) => c.status !== "closed");
    if (openCapas.length > 0) {
      return {
        error: "All linked corrective actions must be closed before closing this finding.",
      };
    }
  }

  await db
    .update(auditFindings)
    .set({ status: targetStatus })
    .where(eq(auditFindings.id, findingId));

  await writeAuditLog({
    actorId: ctx.userId,
    eventType: targetStatus === "closed" ? "finding_closed" : "status_changed",
    entityType: "audit_findings",
    entityId: findingId,
    previousValue: { status: finding.status },
    newValue: { status: targetStatus },
  });

  revalidatePath(`/audits/findings/${findingId}`);
  return {};
}

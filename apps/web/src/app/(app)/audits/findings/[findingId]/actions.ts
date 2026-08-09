"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";

import type { ActionResult } from "@/app/(auth)/actions";
import { catalystAppFromHeaders, type CatalystRow } from "@/lib/catalyst/app";
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
  const catalystApp = catalystAppFromHeaders(await headers());
  const datastore = catalystApp.datastore();

  const findingRows = (await datastore.table("AuditFindings").getRows({
    criteria: `AuditFindings.ROWID = '${findingId}'`,
    maxRows: 1,
  })) as Array<CatalystRow & { status: string }>;
  const finding = findingRows[0];
  if (!finding) {
    return { error: "Unknown finding." };
  }

  const currentIndex = STATUS_ORDER.indexOf(finding.status as FindingStatus);
  const targetIndex = STATUS_ORDER.indexOf(targetStatus);
  if (targetIndex !== currentIndex + 1) {
    return { error: `Cannot move from '${finding.status}' to '${targetStatus}'.` };
  }

  if (targetStatus === "closed") {
    const linkedCapaRows = (await datastore.table("CAPA").getRows({
      criteria: `CAPA.source_type = 'audit_finding' and CAPA.source_id = '${findingId}'`,
    })) as Array<CatalystRow & { status: string }>;
    const openCapas = linkedCapaRows.filter((c) => c.status !== "closed");
    if (openCapas.length > 0) {
      return {
        error: "All linked corrective actions must be closed before closing this finding.",
      };
    }
  }

  await datastore.table("AuditFindings").updateRow({
    ROWID: findingId,
    status: targetStatus,
  });

  await writeAuditLog({
    actorId: ctx.userId,
    eventType: targetStatus === "closed" ? "finding_closed" : "status_changed",
    entityType: "AuditFindings",
    entityId: findingId,
    previousValue: { status: finding.status },
    newValue: { status: targetStatus },
  });

  revalidatePath(`/audits/findings/${findingId}`);
  return {};
}

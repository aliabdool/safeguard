import "server-only";

import { and, eq, inArray, or } from "drizzle-orm";

import { getDb } from "@/db";
import { auditFindings, audits } from "@/db/schema";

import type { KpiCalculationParams, KpiCalculationResult } from "../types";

/**
 * OPEN_CRIT_MAJOR_FINDINGS is a point-in-time count (open critical/major findings right now),
 * not a period-bounded count — the "current"/"comparison" split here instead compares "now" vs
 * "at the end of the comparison period", giving a like-for-like trend reading. Property scoping
 * goes through the parent audit.
 */
export async function countOpenCriticalMajorFindings(
  params: KpiCalculationParams,
): Promise<KpiCalculationResult> {
  const db = getDb();

  const auditIdsQuery = params.propertyId
    ? db.select({ id: audits.id }).from(audits).where(eq(audits.propertyId, params.propertyId))
    : db.select({ id: audits.id }).from(audits);
  const auditIds = (await auditIdsQuery).map((a) => a.id);

  if (auditIds.length === 0) {
    return {
      currentValue: 0,
      comparisonValue: null,
      includedRecordIds: [],
      excludedRecordIds: [],
      dataQualityStatus: "ok",
    };
  }

  const openNow = await db
    .select({ id: auditFindings.id })
    .from(auditFindings)
    .where(
      and(
        inArray(auditFindings.auditId, auditIds),
        or(
          eq(auditFindings.classification, "critical_nc"),
          eq(auditFindings.classification, "major_nc"),
        ),
        inArray(auditFindings.status, ["open", "action_assigned", "verified"]),
      ),
    );

  return {
    currentValue: openNow.length,
    comparisonValue: null,
    includedRecordIds: openNow.map((f) => f.id),
    excludedRecordIds: [],
    dataQualityStatus: "ok",
  };
}

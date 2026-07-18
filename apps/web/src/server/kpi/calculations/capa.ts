import "server-only";

import { and, between, eq } from "drizzle-orm";

import { getDb } from "@/db";
import { capaActions } from "@/db/schema";

import type { KpiCalculationParams, KpiCalculationResult } from "../types";

/** Proportion of CAPA actions closed in the period that were closed by their due date. */
export async function capaClosedOnTimeRate(
  params: KpiCalculationParams,
): Promise<KpiCalculationResult> {
  const db = getDb();
  const scopePredicate = params.propertyId
    ? eq(capaActions.propertyId, params.propertyId)
    : undefined;
  const deptPredicate = params.departmentId
    ? eq(capaActions.departmentId, params.departmentId)
    : undefined;

  async function rate(start: Date, end: Date) {
    const closed = await db
      .select({
        id: capaActions.id,
        dueDate: capaActions.dueDate,
        finalApprovedAt: capaActions.finalApprovedAt,
      })
      .from(capaActions)
      .where(
        and(
          eq(capaActions.status, "closed"),
          between(capaActions.finalApprovedAt, start, end),
          scopePredicate,
          deptPredicate,
        ),
      );
    if (closed.length === 0) {
      return { value: null, ids: [] as string[] };
    }
    const onTime = closed.filter(
      (c) => c.finalApprovedAt && c.finalApprovedAt <= new Date(`${c.dueDate}T23:59:59Z`),
    );
    return { value: (onTime.length / closed.length) * 100, ids: closed.map((c) => c.id) };
  }

  const current = await rate(params.periodStart, params.periodEnd);
  const comparison = await rate(params.comparisonPeriodStart, params.comparisonPeriodEnd);

  return {
    currentValue: current.value,
    comparisonValue: comparison.value,
    includedRecordIds: current.ids,
    excludedRecordIds: [],
    dataQualityStatus: current.value == null ? "incomplete" : "ok",
  };
}

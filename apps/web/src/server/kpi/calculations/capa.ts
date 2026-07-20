import "server-only";

import { and, between, eq } from "drizzle-orm";

import { getDb } from "@/db";
import { capaActions, capaVerifications } from "@/db/schema";

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

/**
 * Proportion of CAPA verifications recorded in the period with outcome = effective. Verifier is
 * always a different person from the action owner (enforced at RLS + app layer, see
 * docs/security-model.md) — this KPI is measuring whether that verification found the action
 * actually worked, not just that it was closed on time.
 */
export async function capaEffectivenessRate(
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
    const verifications = await db
      .select({ id: capaVerifications.id, outcome: capaVerifications.outcome })
      .from(capaVerifications)
      .innerJoin(capaActions, eq(capaActions.id, capaVerifications.capaId))
      .where(
        and(between(capaVerifications.verifiedAt, start, end), scopePredicate, deptPredicate),
      );
    if (verifications.length === 0) {
      return { value: null, ids: [] as string[] };
    }
    const effective = verifications.filter((v) => v.outcome === "effective");
    return {
      value: (effective.length / verifications.length) * 100,
      ids: verifications.map((v) => v.id),
    };
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

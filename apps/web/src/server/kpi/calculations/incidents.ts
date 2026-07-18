import "server-only";

import { and, between, eq, gte, lt, type SQL } from "drizzle-orm";

import { getDb } from "@/db";
import { incidents } from "@/db/schema";

import type { KpiCalculationParams, KpiCalculationResult } from "../types";

/**
 * Shared "count incidents matching an extra predicate, for the current and comparison period"
 * shape used by most lagging/leading incident KPIs (TOTAL_INCIDENTS, EMPLOYEE_INCIDENTS,
 * CONTRACTOR_INCIDENTS, GUEST_INCIDENTS, LTI, NEAR_MISSES, UNSAFE_CONDITIONS, HIGH_POTENTIAL).
 * Returns the actual matched incident IDs as `includedRecordIds` so "View calculation" can link
 * straight through to the records that produced the number — never a black-box count.
 */
export async function countIncidentsInPeriod(
  params: KpiCalculationParams,
  extraPredicate?: SQL,
): Promise<KpiCalculationResult> {
  const db = getDb();

  const scopePredicate = params.propertyId
    ? eq(incidents.propertyId, params.propertyId)
    : undefined;
  const deptPredicate = params.departmentId
    ? eq(incidents.departmentId, params.departmentId)
    : undefined;

  const currentRows = await db
    .select({ id: incidents.id })
    .from(incidents)
    .where(
      and(
        between(incidents.occurredAt, params.periodStart, params.periodEnd),
        scopePredicate,
        deptPredicate,
        extraPredicate,
      ),
    );

  const comparisonRows = await db
    .select({ id: incidents.id })
    .from(incidents)
    .where(
      and(
        gte(incidents.occurredAt, params.comparisonPeriodStart),
        lt(incidents.occurredAt, params.comparisonPeriodEnd),
        scopePredicate,
        deptPredicate,
        extraPredicate,
      ),
    );

  return {
    currentValue: currentRows.length,
    comparisonValue: comparisonRows.length,
    includedRecordIds: currentRows.map((r) => r.id),
    excludedRecordIds: [],
    dataQualityStatus: "ok",
  };
}

export async function sumIncidentCostInPeriod(
  params: KpiCalculationParams,
): Promise<KpiCalculationResult> {
  const db = getDb();
  const scopePredicate = params.propertyId
    ? eq(incidents.propertyId, params.propertyId)
    : undefined;
  const deptPredicate = params.departmentId
    ? eq(incidents.departmentId, params.departmentId)
    : undefined;

  const currentRows = await db
    .select({ id: incidents.id, cost: incidents.incidentCost })
    .from(incidents)
    .where(
      and(
        between(incidents.occurredAt, params.periodStart, params.periodEnd),
        scopePredicate,
        deptPredicate,
      ),
    );

  const comparisonRows = await db
    .select({ cost: incidents.incidentCost })
    .from(incidents)
    .where(
      and(
        gte(incidents.occurredAt, params.comparisonPeriodStart),
        lt(incidents.occurredAt, params.comparisonPeriodEnd),
        scopePredicate,
        deptPredicate,
      ),
    );

  return {
    currentValue: currentRows.reduce((sum, r) => sum + Number(r.cost), 0),
    comparisonValue: comparisonRows.reduce((sum, r) => sum + Number(r.cost), 0),
    includedRecordIds: currentRows.map((r) => r.id),
    excludedRecordIds: [],
    dataQualityStatus: "ok",
  };
}

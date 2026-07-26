import "server-only";

import { eq } from "drizzle-orm";

import { getDb } from "@/db";
import {
  controlAssessments,
  controlFrameworkMappings,
  controls,
  frameworks,
  legalRequirementDetails,
} from "@/db/schema";
import { computeFrameworkRollup } from "@/server/framework/maturity";

import type { KpiCalculationParams, KpiCalculationResult } from "../types";

/**
 * ISO45001_READINESS / LEGAL_COMPLIANCE: point-in-time rollup (current state of the master
 * control library, not a period-summed count) — reuses the same pure rollup function the
 * per-framework page renders, so the KPI tile and the framework page can never silently diverge.
 * Score is 0-4; multiplied by 25 for a 0-100 "readiness %" display value.
 */
export async function frameworkReadinessKpi(
  frameworkCode: "ISO45001" | "MU_LEGAL",
  params: KpiCalculationParams,
): Promise<KpiCalculationResult> {
  const db = getDb();
  const [framework] = await db
    .select()
    .from(frameworks)
    .where(eq(frameworks.code, frameworkCode))
    .limit(1);
  if (!framework) {
    return {
      currentValue: null,
      comparisonValue: null,
      includedRecordIds: [],
      excludedRecordIds: [],
      dataQualityStatus: "incomplete",
    };
  }

  const mappedControls = await db
    .select({ controlId: controls.id, isLifeSafetyCritical: controls.isLifeSafetyCritical })
    .from(controlFrameworkMappings)
    .innerJoin(controls, eq(controls.id, controlFrameworkMappings.controlId))
    .where(eq(controlFrameworkMappings.frameworkId, framework.id));

  if (mappedControls.length === 0) {
    return {
      currentValue: null,
      comparisonValue: null,
      includedRecordIds: [],
      excludedRecordIds: [],
      dataQualityStatus: "incomplete",
    };
  }

  const legalControlIds = new Set(
    (
      await db
        .select({ controlId: legalRequirementDetails.controlId })
        .from(legalRequirementDetails)
    ).map((r) => r.controlId),
  );

  const assessmentQuery = params.propertyId
    ? db
        .select()
        .from(controlAssessments)
        .where(eq(controlAssessments.propertyId, params.propertyId))
    : db.select().from(controlAssessments);
  const allAssessments = await assessmentQuery;

  const rollupInputs = mappedControls.map((c) => {
    const latest = new Map<string, number>();
    for (const a of allAssessments) {
      if (a.controlId !== c.controlId) continue;
      if (!latest.has(a.dimension)) latest.set(a.dimension, a.maturityScore);
    }
    return {
      isLifeSafetyCritical: c.isLifeSafetyCritical,
      isLegal: legalControlIds.has(c.controlId),
      scores: {
        policy: latest.get("policy"),
        procedure: latest.get("procedure"),
        implementation: latest.get("implementation"),
        effectiveness: latest.get("effectiveness"),
      },
    };
  });

  const rollup = computeFrameworkRollup(rollupInputs);

  return {
    currentValue: rollup.rollupScore != null ? rollup.rollupScore * 25 : null,
    comparisonValue: null,
    includedRecordIds: mappedControls.map((c) => c.controlId),
    excludedRecordIds: [],
    dataQualityStatus: rollup.isCapped ? "unverified" : "ok",
  };
}

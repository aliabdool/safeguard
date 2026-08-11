import "server-only";

import type { CatalystRow } from "@/lib/catalyst/app";
import { zcqlString } from "@/lib/catalyst/zcql-escape";
import { computeFrameworkRollup } from "@/server/framework/maturity";

import { propertyScopeClause } from "../scope";
import type { KpiCalculationParams, KpiCalculationResult } from "../types";

interface ControlMappingRow {
  Controls: { ROWID: string; is_life_safety_critical: string };
}

interface ControlAssessmentRow extends CatalystRow {
  control_id: string;
  dimension: string;
  maturity_score: string;
}

interface LegalRequirementRow extends CatalystRow {
  control_id: string;
}

const INCOMPLETE_RESULT: KpiCalculationResult = {
  currentValue: null,
  comparisonValue: null,
  includedRecordIds: [],
  excludedRecordIds: [],
  dataQualityStatus: "incomplete",
};

/**
 * ISO45001_READINESS / LEGAL_COMPLIANCE: point-in-time rollup (current state of the master
 * control library, not a period-summed count) — reuses the same pure rollup function
 * (computeFrameworkRollup) the framework/[frameworkCode] page renders, so the two can never
 * silently diverge on the underlying maturity math. Score is 0-4; multiplied by 25 for a 0-100
 * "readiness %" display value.
 *
 * Two schema-driven notes carried over from the pre-migration Postgres version, preserved here
 * exactly even though apps/web/src/app/(app)/framework/[frameworkCode]/page.tsx (a different,
 * already-migrated module, out of this file's scope) made different simplifications for its own
 * display purposes:
 *  - "isLegal" is derived from LegalRequirementDetails row presence per control (now ported to
 *    02-master-data.json), exactly as the original countOpenCriticalMajorFindings-adjacent KPI
 *    formula did — not from Controls.is_legal (a Catalyst-only convenience column the framework
 *    page instead approximates via frameworkCode === 'MU_LEGAL').
 *  - The rollup is computed live from ControlAssessments (optionally scoped to a single
 *    property), matching the exact Postgres formula, rather than reading a precomputed
 *    FrameworkReadinessSnapshots row the way a separate standalone Catalyst client
 *    (apps/catalyst/functions/shared/services/kpi-service.ts) does — that snapshot table isn't
 *    written by apps/web's framework module yet.
 */
export async function frameworkReadinessKpi(
  frameworkCode: string,
  params: KpiCalculationParams,
): Promise<KpiCalculationResult> {
  const datastore = params.catalystApp.datastore();
  const zcql = params.catalystApp.zcql();

  const frameworkRows = await datastore.table("Frameworks").getRows({
    criteria: `Frameworks.code = ${zcqlString(frameworkCode)}`,
    maxRows: 1,
  });
  const framework = frameworkRows[0];
  if (!framework) {
    return INCOMPLETE_RESULT;
  }

  const mappingRows = (await zcql.executeZCQLQuery(
    `select Controls.ROWID, Controls.is_life_safety_critical
     from ControlFrameworkMappings
     left join Controls on ControlFrameworkMappings.control_id = Controls.ROWID
     left join FrameworkRequirements on ControlFrameworkMappings.framework_requirement_id = FrameworkRequirements.ROWID
     where FrameworkRequirements.framework_id = ${zcqlString(framework.ROWID)}`,
  )) as ControlMappingRow[];

  if (mappingRows.length === 0) {
    return INCOMPLETE_RESULT;
  }

  const legalRows = (await datastore
    .table("LegalRequirementDetails")
    .getRows({})) as LegalRequirementRow[];
  const legalControlIds = new Set(legalRows.map((r) => r.control_id));

  const propClause = params.propertyId
    ? `ControlAssessments.property_id = ${zcqlString(params.propertyId)}`
    : propertyScopeClause("ControlAssessments.property_id", params.ctx);
  const assessmentRows = (await datastore.table("ControlAssessments").getRows({
    criteria: propClause,
  })) as ControlAssessmentRow[];

  const rollupInputs = mappingRows.map(({ Controls: c }) => {
    const latest = new Map<string, number>();
    for (const a of assessmentRows) {
      if (a.control_id !== c.ROWID) continue;
      if (!latest.has(a.dimension)) latest.set(a.dimension, Number(a.maturity_score));
    }
    return {
      isLifeSafetyCritical: c.is_life_safety_critical === "true",
      isLegal: legalControlIds.has(c.ROWID),
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
    includedRecordIds: mappingRows.map(({ Controls: c }) => c.ROWID),
    excludedRecordIds: [],
    dataQualityStatus: rollup.isCapped ? "unverified" : "ok",
  };
}

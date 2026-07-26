import "server-only";

import { propertyScopeClause } from "../scope";
import type { KpiCalculationParams, KpiCalculationResult } from "../types";

interface FindingJoinRow {
  AuditFindings: { ROWID: string };
}

/**
 * OPEN_CRIT_MAJOR_FINDINGS is a point-in-time count (open critical/major findings right now), not
 * a period-bounded count — comparisonValue is always null, matching the pre-migration version.
 * Property scoping goes through the parent audit (AuditFindings has no property_id of its own),
 * via a ZCQL join rather than a two-step audit-id-list + inArray fetch — one round trip instead
 * of two, same result.
 */
export async function countOpenCriticalMajorFindings(
  params: KpiCalculationParams,
): Promise<KpiCalculationResult> {
  const zcql = params.catalystApp.zcql();
  const propClause = params.propertyId
    ? `Audits.property_id == '${params.propertyId}'`
    : propertyScopeClause("Audits.property_id", params.ctx);

  const rows = (await zcql.executeZCQLQuery(
    `select AuditFindings.ROWID from AuditFindings
     left join Audits on AuditFindings.audit_id = Audits.ROWID
     where ${propClause} && AuditFindings.classification in ('critical_nc','major_nc')
       && AuditFindings.status in ('open','action_assigned','verified')`,
  )) as FindingJoinRow[];

  return {
    currentValue: rows.length,
    comparisonValue: null,
    includedRecordIds: rows.map((r) => r.AuditFindings.ROWID),
    excludedRecordIds: [],
    dataQualityStatus: "ok",
  };
}

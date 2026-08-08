import "server-only";

import { propertyScopeClause } from "../scope";
import type { KpiCalculationParams, KpiCalculationResult } from "../types";

/**
 * OPEN_CRIT_MAJOR_FINDINGS is a point-in-time count (open critical/major findings right now), not
 * a period-bounded count — comparisonValue is always null, matching the pre-migration version.
 * Property scoping goes through the parent audit (AuditFindings has no property_id of its own).
 * AuditFindings.audit_id is a plain Text column, not a real Lookup/FK to Audits — confirmed live
 * for the same class of column (see UserRoles/Roles fix in server/permissions/index.ts) — so the
 * scoped Audits ROWIDs are resolved first and AuditFindings is filtered by audit_id in application
 * code rather than joined in ZCQL.
 */
export async function countOpenCriticalMajorFindings(
  params: KpiCalculationParams,
): Promise<KpiCalculationResult> {
  const datastore = params.catalystApp.datastore();
  const propClause = params.propertyId
    ? `Audits.property_id = '${params.propertyId}'`
    : propertyScopeClause("Audits.property_id", params.ctx);

  const scopedAuditRows = (await datastore.table("Audits").getRows({
    criteria: propClause,
  })) as unknown as Array<{ ROWID: string }>;
  const auditIds = scopedAuditRows.map((a) => a.ROWID);

  if (auditIds.length === 0) {
    return {
      currentValue: 0,
      comparisonValue: null,
      includedRecordIds: [],
      excludedRecordIds: [],
      dataQualityStatus: "ok",
    };
  }

  const rows = (await datastore.table("AuditFindings").getRows({
    criteria: `AuditFindings.audit_id in (${auditIds.map((id) => `'${id}'`).join(",")}) && AuditFindings.classification in ('critical_nc','major_nc') && AuditFindings.status in ('open','action_assigned','verified')`,
  })) as unknown as Array<{ ROWID: string }>;

  return {
    currentValue: rows.length,
    comparisonValue: null,
    includedRecordIds: rows.map((r) => r.ROWID),
    excludedRecordIds: [],
    dataQualityStatus: "ok",
  };
}

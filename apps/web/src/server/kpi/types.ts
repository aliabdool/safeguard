import type { CatalystApp } from "@/lib/catalyst/app";
import type { AuthContext } from "@/server/permissions";

export interface KpiCalculationParams {
  /** Request-scoped Catalyst app (catalystAppFromHeaders) — every calc function queries Data
   * Store/ZCQL through this rather than Drizzle. */
  catalystApp: CatalystApp;
  /** The caller's auth context — needed here (and not just at the page level) because Catalyst
   * has no RLS backstop: when propertyId is null ("all accessible properties"), the calc function
   * itself must scope to ctx.propertyIds via propertyScopeClause() rather than silently querying
   * every property in the org. See server/kpi/scope.ts. */
  ctx: AuthContext;
  propertyId?: string | null;
  departmentId?: string | null;
  periodStart: Date;
  periodEnd: Date;
  comparisonPeriodStart: Date;
  comparisonPeriodEnd: Date;
}

export interface KpiCalculationResult {
  currentValue: number | null;
  comparisonValue: number | null;
  includedRecordIds: string[];
  excludedRecordIds: string[];
  dataQualityStatus: "ok" | "unverified" | "incomplete";
}

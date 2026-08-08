import "server-only";

import { catalystAdminApp, type CatalystRow } from "@/lib/catalyst/app";
import { REGISTERED_KPI_CODES, calculateKpi } from "@/server/kpi/calculate";
import type { AuthContext } from "@/server/permissions";

/**
 * Called by /api/cron/kpi-refresh on a schedule (docs/system-architecture.md §6) so the default
 * dashboard view is fast — recomputation also happens on-demand when a user opens /kpis, this
 * just keeps the cache warm. Runs group-wide plus once per property.
 *
 * Uses catalystAdminApp() rather than a request-scoped app — Cloudflare Cron Triggers call this
 * route with no browser session at all, only the shared CRON_SECRET header checked in
 * src/server/cron/auth.ts. calculateKpi() also needs an AuthContext (Catalyst has no RLS
 * backstop — see server/kpi/scope.ts) so a synthetic group-wide SYSTEM_CTX stands in for a real
 * session here; this is a scheduled refresh across every property by design, not a
 * user-initiated, permission-scoped read.
 */
const SYSTEM_CTX: AuthContext = {
  userId: "system-cron",
  fullName: "System (cron)",
  status: "active",
  roleCodes: ["SUPER_ADMIN"],
  propertyIds: [],
  departmentAccess: new Map(),
  hasMedicalPermission: false,
};

export async function refreshAllKpiSnapshots(): Promise<{ calculated: number }> {
  const catalystApp = catalystAdminApp();
  const allProperties = (await catalystApp
    .datastore()
    .table("Properties")
    .getRows({})) as CatalystRow[];

  let calculated = 0;

  for (const code of REGISTERED_KPI_CODES) {
    await calculateKpi(catalystApp, SYSTEM_CTX, code, { propertyId: null });
    calculated += 1;
    for (const property of allProperties) {
      await calculateKpi(catalystApp, SYSTEM_CTX, code, { propertyId: property.ROWID });
      calculated += 1;
    }
  }

  return { calculated };
}

import "server-only";

import { getDb } from "@/db";
import { properties } from "@/db/schema";
import { catalystAdminApp } from "@/lib/catalyst/app";
import { REGISTERED_KPI_CODES, calculateKpi } from "@/server/kpi/calculate";
import type { AuthContext } from "@/server/permissions";

/**
 * Called by /api/cron/kpi-refresh on a schedule (docs/system-architecture.md §6) so the default
 * dashboard view is fast — recomputation also happens on-demand when a user opens /kpis, this
 * just keeps the cache warm. Runs group-wide plus once per property.
 *
 * NOTE (out of scope for the KPI/dashboard migration slice — the cron route itself is being
 * migrated separately): this still enumerates `properties` from Postgres/Drizzle, while
 * calculateKpi() now queries Catalyst Data Store — property.id here is a Postgres UUID, not a
 * Catalyst Properties ROWID, so per-property snapshot rows will not match until this file's own
 * migration to Catalyst lands. catalystAdminApp() + the synthetic group-wide SYSTEM_CTX below are
 * only a minimal compatibility shim so this file keeps typechecking against calculateKpi()'s new
 * signature (a system/cron actor has no end-user session — see lib/catalyst/app.ts).
 */
const SYSTEM_CTX: AuthContext = {
  userId: "system-cron",
  status: "active",
  roleCodes: ["SUPER_ADMIN"],
  propertyIds: [],
  departmentAccess: new Map(),
  hasMedicalPermission: false,
};

export async function refreshAllKpiSnapshots(): Promise<{ calculated: number }> {
  const db = getDb();
  const allProperties = await db.select({ id: properties.id }).from(properties);
  const catalystApp = catalystAdminApp();

  let calculated = 0;

  for (const code of REGISTERED_KPI_CODES) {
    await calculateKpi(catalystApp, SYSTEM_CTX, code, { propertyId: null });
    calculated += 1;
    for (const property of allProperties) {
      await calculateKpi(catalystApp, SYSTEM_CTX, code, { propertyId: property.id });
      calculated += 1;
    }
  }

  return { calculated };
}

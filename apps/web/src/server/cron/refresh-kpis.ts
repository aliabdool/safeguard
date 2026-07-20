import "server-only";

import { getDb } from "@/db";
import { properties } from "@/db/schema";
import { REGISTERED_KPI_CODES, calculateKpi } from "@/server/kpi/calculate";

/**
 * Called by /api/cron/kpi-refresh on a schedule (docs/system-architecture.md §6) so the default
 * dashboard view is fast — recomputation also happens on-demand when a user opens /kpis, this
 * just keeps the cache warm. Runs group-wide plus once per property.
 */
export async function refreshAllKpiSnapshots(): Promise<{ calculated: number }> {
  const db = getDb();
  const allProperties = await db.select({ id: properties.id }).from(properties);

  let calculated = 0;

  for (const code of REGISTERED_KPI_CODES) {
    await calculateKpi(code, { propertyId: null });
    calculated += 1;
    for (const property of allProperties) {
      await calculateKpi(code, { propertyId: property.id });
      calculated += 1;
    }
  }

  return { calculated };
}

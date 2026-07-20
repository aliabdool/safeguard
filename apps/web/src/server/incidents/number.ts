import "server-only";

import { and, count, eq, gte, lt } from "drizzle-orm";

import { getDb } from "@/db";
import { incidents } from "@/db/schema";

/**
 * `INC-{PROPERTY_CODE}-{YEAR}-{seq}`. Computed from a same-year count rather than a DB
 * sequence — acceptable for v1 volume (a handful of incidents per property per day at most);
 * the UNIQUE constraint on `incident_number` is the actual integrity backstop, and callers
 * retry once on a unique-violation race (see createIncidentAction).
 */
export async function nextIncidentNumber(
  propertyCode: string,
  propertyId: string,
): Promise<string> {
  const db = getDb();
  const year = new Date().getFullYear();
  const yearStart = new Date(Date.UTC(year, 0, 1));
  const yearEnd = new Date(Date.UTC(year + 1, 0, 1));

  const [row] = await db
    .select({ total: count() })
    .from(incidents)
    .where(
      and(
        eq(incidents.propertyId, propertyId),
        gte(incidents.createdAt, yearStart),
        lt(incidents.createdAt, yearEnd),
      ),
    );

  const seq = (row?.total ?? 0) + 1;
  return `INC-${propertyCode}-${year}-${String(seq).padStart(4, "0")}`;
}

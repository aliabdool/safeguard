import "server-only";

import { and, count, gte, lt } from "drizzle-orm";

import { getDb } from "@/db";
import { capaActions } from "@/db/schema";

/** `CAPA-{YEAR}-{seq}` — global sequence, not per-property (see docs/database-model.md §4). */
export async function nextCapaActionNumber(): Promise<string> {
  const db = getDb();
  const year = new Date().getFullYear();
  const yearStart = new Date(Date.UTC(year, 0, 1));
  const yearEnd = new Date(Date.UTC(year + 1, 0, 1));

  const [row] = await db
    .select({ total: count() })
    .from(capaActions)
    .where(and(gte(capaActions.createdAt, yearStart), lt(capaActions.createdAt, yearEnd)));

  const seq = (row?.total ?? 0) + 1;
  return `CAPA-${year}-${String(seq).padStart(4, "0")}`;
}

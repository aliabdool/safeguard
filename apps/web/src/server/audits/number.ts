import "server-only";

import { and, count, gte, lt } from "drizzle-orm";

import { getDb } from "@/db";
import { auditFindings, audits } from "@/db/schema";

export async function nextAuditReference(): Promise<string> {
  const db = getDb();
  const year = new Date().getFullYear();
  const yearStart = new Date(Date.UTC(year, 0, 1));
  const yearEnd = new Date(Date.UTC(year + 1, 0, 1));

  const [row] = await db
    .select({ total: count() })
    .from(audits)
    .where(and(gte(audits.createdAt, yearStart), lt(audits.createdAt, yearEnd)));

  const seq = (row?.total ?? 0) + 1;
  return `AUD-${year}-${String(seq).padStart(4, "0")}`;
}

export async function nextFindingNumber(): Promise<string> {
  const db = getDb();
  const year = new Date().getFullYear();
  const yearStart = new Date(Date.UTC(year, 0, 1));
  const yearEnd = new Date(Date.UTC(year + 1, 0, 1));

  const [row] = await db
    .select({ total: count() })
    .from(auditFindings)
    .where(and(gte(auditFindings.raisedAt, yearStart), lt(auditFindings.raisedAt, yearEnd)));

  const seq = (row?.total ?? 0) + 1;
  return `FND-${year}-${String(seq).padStart(4, "0")}`;
}

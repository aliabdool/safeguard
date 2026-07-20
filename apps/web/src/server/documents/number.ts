import "server-only";

import { count } from "drizzle-orm";

import { getDb } from "@/db";
import { documents } from "@/db/schema";

/** `DOC-{seq}` — global sequence across all document categories. */
export async function nextDocumentNumber(): Promise<string> {
  const db = getDb();
  const [row] = await db.select({ total: count() }).from(documents);
  const seq = (row?.total ?? 0) + 1;
  return `DOC-${String(seq).padStart(5, "0")}`;
}

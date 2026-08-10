import "server-only";

import type { CatalystApp } from "@/lib/catalyst/app";

/**
 * `DOC-{seq}` — global sequence across all document categories, computed from a live count
 * rather than a DB sequence (same trade-off/precedent as nextIncidentNumber() in
 * server/incidents/number.ts). Documents.document_number's `unique` constraint
 * (05-documents.json) is the actual integrity backstop.
 */
export async function nextDocumentNumber(catalystApp: CatalystApp): Promise<string> {
  // No "as n" alias: confirmed live (see chat) that ZCQL aggregate results are keyed by the
  // column name INSIDE the function, not the SQL alias — reading `.Documents.n` silently returned
  // undefined -> 0 every time, so this always allocated sequence 1.
  const rows = (await catalystApp
    .zcql()
    .executeZCQLQuery(`select count(Documents.ROWID) from Documents`)) as Array<{
    Documents: { ROWID: string };
  }>;

  const seq = Number(rows[0]?.Documents.ROWID ?? "0") + 1;
  return `DOC-${String(seq).padStart(5, "0")}`;
}

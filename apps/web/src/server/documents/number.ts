import "server-only";

import type { CatalystApp } from "@/lib/catalyst/app";

/**
 * `DOC-{seq}` — global sequence across all document categories, computed from a live count
 * rather than a DB sequence (same trade-off/precedent as nextIncidentNumber() in
 * server/incidents/number.ts). Documents.document_number's `unique` constraint
 * (05-documents.json) is the actual integrity backstop.
 */
export async function nextDocumentNumber(catalystApp: CatalystApp): Promise<string> {
  const rows = (await catalystApp
    .zcql()
    .executeZCQLQuery(`select count(Documents.ROWID) as n from Documents`)) as Array<{
    Documents: { n: string };
  }>;

  const seq = Number(rows[0]?.Documents.n ?? "0") + 1;
  return `DOC-${String(seq).padStart(5, "0")}`;
}

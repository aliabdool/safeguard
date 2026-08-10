import "server-only";

import type { CatalystApp } from "@/lib/catalyst/app";

const MAX_ALLOCATION_ATTEMPTS = 6;
const SEQUENCE_DIGITS = 8;

export interface AllocatedIncidentNumber {
  incidentNumber: string;
  incidentPrefix: string;
  referenceYear: string;
  incidentSequence: number;
}

function formatIncidentNumber(
  incidentPrefix: string,
  referenceYear: string,
  sequence: number,
): string {
  return `${incidentPrefix}-${referenceYear}-${String(sequence).padStart(SEQUENCE_DIGITS, "0")}`;
}

/**
 * The next sequence number to try for `${incidentPrefix}-${referenceYear}` — NOT itself a
 * correctness guarantee (see allocateIncidentNumber's doc comment). Derived as
 * max(advisory hint, highest already-committed Incidents.incident_sequence for this business
 * unit + year) + 1, so a stale or regressed hint (see chat: two concurrent requests can each
 * update the hint with their own value, in either commit order, moving it backwards) can never
 * cause a candidate below what's actually been committed — only the committed rows in Incidents
 * are authoritative for "what's taken".
 */
async function nextCandidateSequence(
  catalystApp: CatalystApp,
  incidentPrefix: string,
  referenceYear: string,
  sequenceKey: string,
): Promise<number> {
  const datastore = catalystApp.datastore();
  const zcql = catalystApp.zcql();

  const [hintRows, committedRows] = await Promise.all([
    datastore.table("IncidentSequence").getRows({
      criteria: `IncidentSequence.sequence_name = '${sequenceKey}'`,
      maxRows: 1,
    }),
    // No "as maxseq" alias: confirmed live against the deployed project (see chat) that ZCQL
    // aggregate results are keyed by the column name INSIDE the function, not the SQL alias — a
    // max() query written with an alias returns the value under Incidents.incident_sequence, never
    // under the alias name. An alias here would silently read as undefined and this whole safety
    // mechanism would collapse to "always trust the advisory hint," exactly the failure mode this
    // design exists to avoid.
    zcql.executeZCQLQuery(
      `select max(Incidents.incident_sequence) from Incidents where Incidents.incident_prefix = '${incidentPrefix}' and Incidents.reference_year = '${referenceYear}'`,
    ) as Promise<Array<{ Incidents: { incident_sequence: string | null } }>>,
  ]);

  const hint = hintRows[0] as (Record<string, string> & { current_value: string }) | undefined;
  const hintValue = hint ? Number(hint.current_value) : 0;
  const committedMax = Number(committedRows[0]?.Incidents.incident_sequence ?? 0);

  return Math.max(hintValue, committedMax) + 1;
}

/** Best-effort — never allowed to affect correctness (see nextCandidateSequence). */
async function bumpSequenceHint(
  catalystApp: CatalystApp,
  sequenceKey: string,
  value: number,
): Promise<void> {
  const datastore = catalystApp.datastore();
  const existing = (await datastore.table("IncidentSequence").getRows({
    criteria: `IncidentSequence.sequence_name = '${sequenceKey}'`,
    maxRows: 1,
  })) as Array<Record<string, string> & { ROWID: string; current_value: string }>;

  if (existing[0]) {
    if (Number(existing[0].current_value) < value) {
      await datastore
        .table("IncidentSequence")
        .updateRow({ ROWID: existing[0].ROWID, current_value: value });
    }
  } else {
    await datastore.table("IncidentSequence").insertRow({
      sequence_name: sequenceKey,
      current_value: value,
    });
  }
}

/**
 * Allocates the next incident reference for a business unit's `incident_prefix` (Properties.
 * incident_prefix — a short public-numbering code kept deliberately separate from
 * Properties.code, the pre-existing legacy/system code other logic may depend on — see chat) and
 * calendar year, e.g. "LP-2026-00000001". Concurrency-safe WITHOUT relying on any atomic increment
 * primitive (Catalyst's Data Store and SDK expose none — confirmed by inspecting
 * zcatalyst-sdk-node's Table type and the full Datastore tool surface, see chat).
 *
 * Incidents.incident_sequence deliberately has NO unique constraint (per chat: logical uniqueness
 * is property/prefix + reference_year + incident_sequence, which Catalyst has no composite-unique
 * primitive for) — the actual duplicate-prevention backstop is the storage-level UNIQUE constraint
 * that already exists on Incidents.incident_number (the full formatted string), which two
 * candidates sharing the same prefix+year+sequence will always collide on identically. A losing
 * request never reuses its own candidate; nextCandidateSequence() is called fresh on every
 * attempt, so it picks up the winner's just-committed row via the live MAX() query, scoped to this
 * prefix + year only — other business units and other years allocate independently. Gaps in the
 * sequence are an accepted, explicit trade-off (see chat) — duplicates are not possible as long as
 * the incident_number UNIQUE constraint is present in the deployed schema.
 */
export async function allocateIncidentNumber(
  catalystApp: CatalystApp,
  incidentPrefix: string,
  referenceYear: string,
  insertIncident: (allocation: AllocatedIncidentNumber) => Promise<string>,
): Promise<string> {
  const sequenceKey = `${incidentPrefix}-${referenceYear}`;

  let lastError: unknown;
  for (let attempt = 0; attempt < MAX_ALLOCATION_ATTEMPTS; attempt++) {
    const candidate = await nextCandidateSequence(
      catalystApp,
      incidentPrefix,
      referenceYear,
      sequenceKey,
    );
    const allocation: AllocatedIncidentNumber = {
      incidentNumber: formatIncidentNumber(incidentPrefix, referenceYear, candidate),
      incidentPrefix,
      referenceYear,
      incidentSequence: candidate,
    };

    try {
      const incidentId = await insertIncident(allocation);
      await bumpSequenceHint(catalystApp, sequenceKey, candidate);
      return incidentId;
    } catch (err) {
      lastError = err;
      if (attempt === MAX_ALLOCATION_ATTEMPTS - 1) throw err;
      // Small jittered delay so a burst of concurrent retries doesn't immediately re-collide.
      await new Promise((resolve) => setTimeout(resolve, 20 + Math.floor(Math.random() * 60)));
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error("Could not allocate an incident number.");
}

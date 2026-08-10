import { describe, expect, it, vi } from "vitest";

import type { CatalystApp } from "@/lib/catalyst/app";

import { allocateIncidentNumber } from "./number";

/**
 * A faithful-enough fake of the two calls allocateIncidentNumber makes: the IncidentSequence
 * advisory hint (a single row per sequence_name) and a ZCQL MAX(incident_sequence) query scoped
 * by business_unit_code + reference_year, parsed out of the query text so cross-scope independence
 * is actually exercised rather than assumed.
 */
function createMockCatalystApp(committedByScope: Record<string, number[]> = {}) {
  const committed = new Map(
    Object.entries(committedByScope).map(([key, values]) => [key, new Set(values)]),
  );
  const hints = new Map<string, number>();

  function scopeKey(businessUnitCode: string, referenceYear: string): string {
    return `${businessUnitCode}-${referenceYear}`;
  }

  const app = {
    datastore: () => ({
      table: (name: string) => {
        if (name !== "IncidentSequence") {
          throw new Error(`Unexpected table access in test mock: ${name}`);
        }
        return {
          getRows: async ({ criteria }: { criteria?: string; maxRows?: number } = {}) => {
            const match = criteria?.match(/sequence_name = '([^']+)'/);
            const key = match?.[1];
            if (!key || !hints.has(key)) return [];
            return [{ ROWID: `seq-${key}`, sequence_name: key, current_value: String(hints.get(key)) }];
          },
          insertRow: async (row: Record<string, unknown>) => {
            hints.set(String(row.sequence_name), Number(row.current_value));
            return { ROWID: `seq-${row.sequence_name}`, ...row };
          },
          updateRow: async (row: Record<string, unknown> & { ROWID: string }) => {
            const key = row.ROWID.replace(/^seq-/, "");
            hints.set(key, Number(row.current_value));
            return row;
          },
        };
      },
    }),
    zcql: () => ({
      executeZCQLQuery: async (query: string) => {
        const codeMatch = query.match(/business_unit_code = '([^']+)'/);
        const yearMatch = query.match(/reference_year = '([^']+)'/);
        const key = `${codeMatch?.[1]}-${yearMatch?.[1]}`;
        const set = committed.get(key);
        const max = set && set.size > 0 ? Math.max(...set) : null;
        return [{ Incidents: { maxseq: max === null ? null : String(max) } }];
      },
    }),
  } as unknown as CatalystApp;

  return {
    app,
    commit: (businessUnitCode: string, referenceYear: string, sequence: number) => {
      const key = scopeKey(businessUnitCode, referenceYear);
      if (!committed.has(key)) committed.set(key, new Set());
      committed.get(key)!.add(sequence);
    },
  };
}

describe("allocateIncidentNumber", () => {
  it("allocates 00000001 for a business unit + year with no prior incidents", async () => {
    const { app, commit } = createMockCatalystApp();
    const insertIncident = vi.fn(async (allocation) => {
      commit(allocation.businessUnitCode, allocation.referenceYear, allocation.incidentSequence);
      return "incident-1";
    });

    const id = await allocateIncidentNumber(app, "LP", "2026", insertIncident);

    expect(id).toBe("incident-1");
    expect(insertIncident).toHaveBeenCalledTimes(1);
    expect(insertIncident.mock.calls[0]![0]).toEqual({
      incidentNumber: "LP-2026-00000001",
      businessUnitCode: "LP",
      referenceYear: "2026",
      incidentSequence: 1,
    });
  });

  it("continues from the highest already-committed sequence, not the count of rows", async () => {
    const { app, commit } = createMockCatalystApp({ "LP-2026": [1, 2, 3] });
    const insertIncident = vi.fn(async (allocation) => {
      commit(allocation.businessUnitCode, allocation.referenceYear, allocation.incidentSequence);
      return "incident-4";
    });

    await allocateIncidentNumber(app, "LP", "2026", insertIncident);

    expect(insertIncident.mock.calls[0]![0].incidentNumber).toBe("LP-2026-00000004");
  });

  it("scopes sequences independently per business unit and per calendar year", async () => {
    const { app, commit } = createMockCatalystApp({
      "LP-2026": [1, 2],
      "SB-2026": [1],
      "LP-2027": [],
    });
    const insertIncident = vi.fn(async (allocation) => {
      commit(allocation.businessUnitCode, allocation.referenceYear, allocation.incidentSequence);
      return `incident-${allocation.incidentNumber}`;
    });

    expect((await allocateIncidentNumber(app, "LP", "2026", insertIncident)) && insertIncident.mock.calls.at(-1)![0].incidentNumber).toBe(
      "LP-2026-00000003",
    );
    expect(
      (await allocateIncidentNumber(app, "SB", "2026", insertIncident)) &&
        insertIncident.mock.calls.at(-1)![0].incidentNumber,
    ).toBe("SB-2026-00000002");
    expect(
      (await allocateIncidentNumber(app, "LP", "2027", insertIncident)) &&
        insertIncident.mock.calls.at(-1)![0].incidentNumber,
    ).toBe("LP-2027-00000001");
  });

  it("retries past a unique-constraint collision without ever returning a duplicate number", async () => {
    const { app, commit } = createMockCatalystApp({ "LP-2026": [1] });
    let firstAttempt = true;
    const seenNumbers: string[] = [];

    const insertIncident = vi.fn(async (allocation) => {
      seenNumbers.push(allocation.incidentNumber);
      if (allocation.incidentSequence === 2 && firstAttempt) {
        firstAttempt = false;
        // A concurrent request "wins" candidate 2 first, then this attempt loses the race.
        commit("LP", "2026", 2);
        throw new Error("ZCQL query failed: unique constraint violation on incident_sequence");
      }
      commit(allocation.businessUnitCode, allocation.referenceYear, allocation.incidentSequence);
      return `incident-${allocation.incidentSequence}`;
    });

    const id = await allocateIncidentNumber(app, "LP", "2026", insertIncident);

    expect(id).toBe("incident-3");
    expect(seenNumbers).toEqual(["LP-2026-00000002", "LP-2026-00000003"]);
    expect(new Set(seenNumbers).size).toBe(seenNumbers.length);
  });

  it("throws after exhausting retries rather than allocating forever", async () => {
    const { app } = createMockCatalystApp({ "LP-2026": [1] });
    const insertIncident = vi.fn(async () => {
      throw new Error("simulated persistent collision");
    });

    await expect(allocateIncidentNumber(app, "LP", "2026", insertIncident)).rejects.toThrow(
      "simulated persistent collision",
    );
    expect(insertIncident.mock.calls.length).toBeGreaterThan(1);
  });

  it("zero-pads the sequence to 8 digits", async () => {
    const { app, commit } = createMockCatalystApp({ "AM-2026": [99] });
    const insertIncident = vi.fn(async (allocation) => {
      commit(allocation.businessUnitCode, allocation.referenceYear, allocation.incidentSequence);
      return "incident-100";
    });

    await allocateIncidentNumber(app, "AM", "2026", insertIncident);

    expect(insertIncident.mock.calls[0]![0].incidentNumber).toBe("AM-2026-00000100");
  });
});

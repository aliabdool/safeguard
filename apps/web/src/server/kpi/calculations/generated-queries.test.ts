import { describe, expect, it } from "vitest";

import type { CatalystApp, CatalystRow } from "@/lib/catalyst/app";
import { assertZcqlSafe } from "@/lib/testing/zcql-assertions";
import type { AuthContext } from "@/server/permissions/pure";

import { capaClosedOnTimeRate, capaEffectivenessRate } from "./capa";
import { countOpenCriticalMajorFindings } from "./findings";
import { frameworkReadinessKpi } from "./framework";
import {
  countIncidentsInPeriod,
  countReportableOshCasesInPeriod,
  sumIncidentCostInPeriod,
} from "./incidents";
import { computeDataQuality } from "../../dashboard/data-quality";
import type { KpiCalculationParams } from "../types";

/**
 * Exercises the real calculation functions used by the dashboard, incidents, KPI, CAPA, audits,
 * and reports modules against a recording fake CatalystApp, then runs the *actual* runtime query
 * strings they build through the same ZCQL-safety checks as the static contract test
 * (src/server/zcql-contract.test.ts). The static test can only see literal source text; several
 * of these query fragments are entirely interpolated (e.g. propertyScopeClause's return value is
 * the whole criteria string, not a substring the static scanner can anchor on), so only actually
 * calling the functions with representative AuthContexts — admin, a normal user with granted
 * properties, and a user with none — reliably catches the bug class this suite exists for.
 */

function createRecordingCatalystApp(rows: CatalystRow[] = []): {
  app: CatalystApp;
  queries: string[];
} {
  const queries: string[] = [];
  const app = {
    userManagement: () => {
      throw new Error("not exercised by these tests");
    },
    datastore: () => ({
      table: () => ({
        getRows: async ({ criteria }: { criteria?: string; maxRows?: number } = {}) => {
          if (criteria) queries.push(criteria);
          return rows;
        },
        insertRow: async (row: Record<string, unknown>) => row,
        updateRow: async (row: Record<string, unknown> & { ROWID: string }) => row,
      }),
    }),
    zcql: () => ({
      executeZCQLQuery: async (query: string) => {
        queries.push(query);
        return [];
      },
    }),
  } as unknown as CatalystApp;
  return { app, queries };
}

const adminCtx: AuthContext = {
  userId: "admin-1",
  fullName: "Admin",
  status: "active",
  roleCodes: ["SUPER_ADMIN"],
  propertyIds: [],
  departmentAccess: new Map(),
  hasMedicalPermission: true,
};

const restrictedCtx: AuthContext = {
  userId: "user-1",
  fullName: "Duty Manager",
  status: "active",
  roleCodes: ["DUTY_MANAGER"],
  propertyIds: ["property-1", "property-2"],
  departmentAccess: new Map(),
  hasMedicalPermission: false,
};

const noAccessCtx: AuthContext = {
  userId: "user-2",
  fullName: "Nobody",
  status: "active",
  roleCodes: ["INCIDENT_REPORTER"],
  propertyIds: [],
  departmentAccess: new Map(),
  hasMedicalPermission: false,
};

const CONTEXTS: Array<[string, AuthContext]> = [
  ["admin (unconditional scope)", adminCtx],
  ["restricted to granted properties", restrictedCtx],
  ["no properties granted", noAccessCtx],
];

const periodStart = new Date("2026-04-01T00:00:00.000Z");
const periodEnd = new Date("2027-03-31T23:59:59.999Z");
const comparisonPeriodStart = new Date("2025-04-01T00:00:00.000Z");
const comparisonPeriodEnd = new Date("2026-03-31T23:59:59.999Z");

function baseParams(app: CatalystApp, ctx: AuthContext): KpiCalculationParams {
  return {
    catalystApp: app,
    ctx,
    propertyId: null,
    periodStart,
    periodEnd,
    comparisonPeriodStart,
    comparisonPeriodEnd,
  };
}

describe.each(CONTEXTS)("generated ZCQL queries for %s", (_label, ctx) => {
  it("countIncidentsInPeriod", async () => {
    const { app, queries } = createRecordingCatalystApp([]);
    await countIncidentsInPeriod(baseParams(app, ctx));
    expect(queries.length).toBeGreaterThan(0);
    queries.forEach((q, i) => assertZcqlSafe(q, `countIncidentsInPeriod query #${i}`));
  });

  it("countReportableOshCasesInPeriod", async () => {
    const { app, queries } = createRecordingCatalystApp([{ ROWID: "1" }]);
    await countReportableOshCasesInPeriod(baseParams(app, ctx));
    expect(queries.length).toBeGreaterThan(0);
    queries.forEach((q, i) => assertZcqlSafe(q, `countReportableOshCasesInPeriod query #${i}`));
  });

  it("sumIncidentCostInPeriod", async () => {
    const { app, queries } = createRecordingCatalystApp([]);
    await sumIncidentCostInPeriod(baseParams(app, ctx));
    expect(queries.length).toBeGreaterThan(0);
    queries.forEach((q, i) => assertZcqlSafe(q, `sumIncidentCostInPeriod query #${i}`));
  });

  it("capaClosedOnTimeRate", async () => {
    const { app, queries } = createRecordingCatalystApp([]);
    await capaClosedOnTimeRate(baseParams(app, ctx));
    expect(queries.length).toBeGreaterThan(0);
    queries.forEach((q, i) => assertZcqlSafe(q, `capaClosedOnTimeRate query #${i}`));
  });

  it("capaEffectivenessRate", async () => {
    const { app, queries } = createRecordingCatalystApp([{ ROWID: "capa-1" }]);
    await capaEffectivenessRate(baseParams(app, ctx));
    expect(queries.length).toBeGreaterThan(0);
    queries.forEach((q, i) => assertZcqlSafe(q, `capaEffectivenessRate query #${i}`));
  });

  it("countOpenCriticalMajorFindings", async () => {
    const { app, queries } = createRecordingCatalystApp([{ ROWID: "audit-1" }]);
    await countOpenCriticalMajorFindings(baseParams(app, ctx));
    expect(queries.length).toBeGreaterThan(0);
    queries.forEach((q, i) => assertZcqlSafe(q, `countOpenCriticalMajorFindings query #${i}`));
  });

  it("frameworkReadinessKpi", async () => {
    const { app, queries } = createRecordingCatalystApp([{ ROWID: "1", code: "ISO45001" }]);
    await frameworkReadinessKpi("ISO45001", baseParams(app, ctx));
    expect(queries.length).toBeGreaterThan(0);
    queries.forEach((q, i) => assertZcqlSafe(q, `frameworkReadinessKpi query #${i}`));
  });

  it("computeDataQuality", async () => {
    const { app, queries } = createRecordingCatalystApp([]);
    await computeDataQuality({
      catalystApp: app,
      ctx,
      propertyId: null,
      periodStart,
      periodEnd,
    });
    expect(queries.length).toBeGreaterThan(0);
    queries.forEach((q, i) => assertZcqlSafe(q, `computeDataQuality query #${i}`));
  });
});

// gatherAssurancePackInput (server/reporting/gather.ts) is not exercised here: it internally
// calls catalystAdminApp(), which reads real CATALYST_PROJECT_ID/KEY/SECRET_KEY env vars rather
// than accepting the injected app for its gatherKpis() sub-call, so it can't be driven through
// the recording fake without either stubbing those env vars (and then making real network calls
// through the SDK) or refactoring gather.ts's dependency injection — out of scope for this ZCQL
// audit. Its own CriticalGaps/AuditFindings/CAPA query literals are still covered by the static
// source-scanning contract test (src/server/zcql-contract.test.ts).

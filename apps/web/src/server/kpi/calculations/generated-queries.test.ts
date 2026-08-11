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
import { calculateKpi } from "../calculate";
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

// The suite above always drives propertyId/departmentId through the CTX-SCOPED branch
// (baseParams hardcodes propertyId: null), so it never actually exercises the explicit
// params.propertyId / params.departmentId branch each function also has — the exact branch that
// carried the raw '${value}' interpolation bug class this ZCQL-safety audit fixed (see chat: the
// CEO's "no user-controlled string may be concatenated raw into ZCQL" input-minimisation rule).
// Every one of these values is now routed through zcqlString() at its call site; this block proves
// that live for a representative cross-section of the audited functions using values a browser
// could genuinely submit — a selected Business Unit/department whose id happens to contain a
// quote, or a kpiCode/frameworkCode straight off a URL path segment — and additionally verifies
// the escaped literal round-trips (the value isn't silently dropped or mangled), not just that it
// fails to blow up the query syntax.
describe("explicit propertyId/departmentId/kpiCode/frameworkCode are escaped, not just ctx-scoped values", () => {
  const maliciousPropertyId = "prop' or '1'='1";
  const maliciousDepartmentId = "dept' or '1'='1";
  const maliciousKpiCode = "kpi' or '1'='1";
  const maliciousFrameworkCode = "fw' or '1'='1";

  it("countIncidentsInPeriod escapes an explicit propertyId and departmentId", async () => {
    const { app, queries } = createRecordingCatalystApp([]);
    await countIncidentsInPeriod({
      ...baseParams(app, adminCtx),
      propertyId: maliciousPropertyId,
      departmentId: maliciousDepartmentId,
    });
    expect(queries.length).toBeGreaterThan(0);
    queries.forEach((q, i) => {
      assertZcqlSafe(q, `countIncidentsInPeriod (explicit scope) query #${i}`);
      expect(q).toContain("prop'' or ''1''=''1");
      expect(q).toContain("dept'' or ''1''=''1");
    });
  });

  it("capaClosedOnTimeRate/capaEffectivenessRate escape an explicit propertyId and departmentId", async () => {
    const { app, queries } = createRecordingCatalystApp([{ ROWID: "capa-1" }]);
    await capaClosedOnTimeRate({
      ...baseParams(app, adminCtx),
      propertyId: maliciousPropertyId,
      departmentId: maliciousDepartmentId,
    });
    await capaEffectivenessRate({
      ...baseParams(app, adminCtx),
      propertyId: maliciousPropertyId,
      departmentId: maliciousDepartmentId,
    });
    expect(queries.length).toBeGreaterThan(0);
    queries.forEach((q, i) => assertZcqlSafe(q, `capa query #${i}`));
    // Only the CAPA property/department scope query carries these literals directly — the
    // CAPAVerification follow-up query is scoped by resolved capa_id ROWIDs instead — so this
    // checks that the escaped value appears somewhere in the sequence, not in every query.
    expect(queries.some((q) => q.includes("prop'' or ''1''=''1"))).toBe(true);
    expect(queries.some((q) => q.includes("dept'' or ''1''=''1"))).toBe(true);
  });

  it("countOpenCriticalMajorFindings escapes an explicit propertyId", async () => {
    const { app, queries } = createRecordingCatalystApp([{ ROWID: "audit-1" }]);
    await countOpenCriticalMajorFindings({
      ...baseParams(app, adminCtx),
      propertyId: maliciousPropertyId,
    });
    expect(queries.length).toBeGreaterThan(0);
    queries.forEach((q, i) => assertZcqlSafe(q, `countOpenCriticalMajorFindings query #${i}`));
    // Only the Audits scope query carries the propertyId directly — the AuditFindings follow-up
    // is scoped by resolved audit_id ROWIDs instead.
    expect(queries.some((q) => q.includes("prop'' or ''1''=''1"))).toBe(true);
  });

  it("frameworkReadinessKpi escapes both frameworkCode and an explicit propertyId", async () => {
    const { app, queries } = createRecordingCatalystApp([{ ROWID: "1", code: maliciousFrameworkCode }]);
    await frameworkReadinessKpi(maliciousFrameworkCode, {
      ...baseParams(app, adminCtx),
      propertyId: maliciousPropertyId,
    });
    expect(queries.length).toBeGreaterThan(0);
    queries.forEach((q, i) => assertZcqlSafe(q, `frameworkReadinessKpi query #${i}`));
    expect(queries[0]).toContain("fw'' or ''1''=''1");
  });

  it("computeDataQuality escapes an explicit propertyId", async () => {
    const { app, queries } = createRecordingCatalystApp([]);
    await computeDataQuality({
      catalystApp: app,
      ctx: adminCtx,
      propertyId: maliciousPropertyId,
      periodStart,
      periodEnd,
    });
    expect(queries.length).toBeGreaterThan(0);
    queries.forEach((q, i) => {
      assertZcqlSafe(q, `computeDataQuality (explicit scope) query #${i}`);
    });
    expect(queries[0]).toContain("prop'' or ''1''=''1");
  });

  it("calculateKpi escapes a kpiCode taken straight from a URL path segment", async () => {
    const { app, queries } = createRecordingCatalystApp([]);
    await calculateKpi(app, adminCtx, maliciousKpiCode, {});
    expect(queries.length).toBeGreaterThan(0);
    assertZcqlSafe(queries[0]!, "calculateKpi KPIDefinitions lookup");
    expect(queries[0]).toContain("kpi'' or ''1''=''1");
  });
});

// gatherAssurancePackInput (server/reporting/gather.ts) is not exercised here: it internally
// calls catalystAdminApp(), which reads real CATALYST_PROJECT_ID/KEY/SECRET_KEY env vars rather
// than accepting the injected app for its gatherKpis() sub-call, so it can't be driven through
// the recording fake without either stubbing those env vars (and then making real network calls
// through the SDK) or refactoring gather.ts's dependency injection — out of scope for this ZCQL
// audit. Its own CriticalGaps/AuditFindings/CAPA query literals are still covered by the static
// source-scanning contract test (src/server/zcql-contract.test.ts).

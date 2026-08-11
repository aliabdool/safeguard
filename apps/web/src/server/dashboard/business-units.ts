import "server-only";

import type { CatalystApp, CatalystRow } from "@/lib/catalyst/app";
import { zcqlString } from "@/lib/catalyst/zcql-escape";
import { toZcqlDateTime } from "@/lib/catalyst/zcql-datetime";
import { mapWithConcurrency } from "@/lib/concurrency";
import { computeDataQuality } from "@/server/dashboard/data-quality";
import { calculateKpi } from "@/server/kpi/calculate";
import type { AuthContext } from "@/server/permissions";

import type { BusinessUnit } from "./scope";

const COMPARISON_KPI_CODES = [
  "TOTAL_INCIDENTS",
  "FATALITIES",
  "LTI",
  "HIGH_POTENTIAL",
  "LOST_WORKDAYS",
  "HOSPITAL_REFERRALS",
  "REPORTABLE_OSH_CASES",
  "OPEN_CRIT_MAJOR_FINDINGS",
  "ISO45001_READINESS",
  "LEGAL_COMPLIANCE",
] as const;

export type AssuranceStatus = "satisfactory" | "attention" | "exception" | "not_assessed";

export interface BusinessUnitComparisonRow {
  businessUnitId: string | null;
  businessUnitName: string;
  isGroupTotal: boolean;
  totalIncidents: number | null;
  fatalities: number | null;
  lti: number | null;
  highPotential: number | null;
  lostDays: number | null;
  hospitalReferrals: number | null;
  oshReportable: number | null;
  openInvestigations: number | null;
  openCapa: number | null;
  overdueCapa: number | null;
  criticalMajorFindings: number | null;
  dataCompletenessPct: number | null;
  assuranceStatus: AssuranceStatus;
}

interface CapaCountRow extends CatalystRow {
  status: string;
  due_date: string;
}

interface InvestigationRow extends CatalystRow {
  incident_id: string;
  status: string;
}

async function countOpenInvestigations(
  catalystApp: CatalystApp,
  propertyId: string,
): Promise<number> {
  const datastore = catalystApp.datastore();
  const incidentRows = (await datastore.table("Incidents").getRows({
    criteria: `Incidents.property_id = ${zcqlString(propertyId)}`,
  })) as unknown as Array<{ ROWID: string }>;
  if (incidentRows.length === 0) return 0;
  const incidentIds = incidentRows.map((r) => r.ROWID);
  // IncidentInvestigation.incident_id is a plain Text column, not a real Lookup/FK to Incidents in
  // every case that's been checked in this app (see server/permissions/index.ts, server/dashboard/
  // data-quality.ts) — resolve in-scope incident ROWIDs first and filter application-side rather
  // than risk a ZCQL join on a column that may not actually be a relationship.
  const investigationRows = (await datastore.table("IncidentInvestigation").getRows({
    criteria: `IncidentInvestigation.incident_id in (${incidentIds.map((id) => zcqlString(id)).join(",")}) and IncidentInvestigation.status not in ('completed','approved')`,
  })) as InvestigationRow[];
  return investigationRows.length;
}

async function countCapa(
  catalystApp: CatalystApp,
  propertyId: string,
): Promise<{ open: number; overdue: number }> {
  const today = toZcqlDateTime(new Date()).slice(0, 10);
  const rows = (await catalystApp.datastore().table("CAPA").getRows({
    criteria: `CAPA.property_id = ${zcqlString(propertyId)} and CAPA.status not in ('closed','verified')`,
  })) as CapaCountRow[];
  const overdue = rows.filter((r) => r.due_date < today).length;
  return { open: rows.length, overdue };
}

function deriveAssuranceStatus(
  iso45001Rag: string | undefined,
  legalRag: string | undefined,
  overdueCapa: number,
  criticalMajorFindings: number,
): AssuranceStatus {
  if (iso45001Rag === undefined && legalRag === undefined) return "not_assessed";
  if (legalRag === "red" || criticalMajorFindings > 0) return "exception";
  if (iso45001Rag === "red" || iso45001Rag === "amber" || legalRag === "amber" || overdueCapa > 0) {
    return "attention";
  }
  if (iso45001Rag === "green" && (legalRag === "green" || legalRag === undefined)) {
    return "satisfactory";
  }
  return "not_assessed";
}

/**
 * One comparison row per Business Unit plus a Group total row (see chat, CEO dashboard §6). The
 * Group row's incident-count/sum KPIs reuse the exact same scoped-null-propertyId path every other
 * group aggregate in this dashboard uses (calculateKpi with propertyId: null, scoped via
 * groupScopeClause for an executive caller) — never a client-side sum of the per-Business-Unit
 * rows, so the two can never silently disagree (dashboard acceptance test #7: "Group totals equal
 * underlying scoped records").
 */
export async function computeBusinessUnitComparison(
  catalystApp: CatalystApp,
  ctx: AuthContext,
  businessUnits: BusinessUnit[],
  asOf: Date,
): Promise<BusinessUnitComparisonRow[]> {
  const scopes: Array<{ id: string | null; name: string; isGroup: boolean }> = [
    { id: null, name: "Sunlife Group", isGroup: true },
    ...businessUnits.map((bu) => ({ id: bu.id, name: bu.name, isGroup: false })),
  ];

  // Flattened (scope × KPI code) list so the per-scope, per-KPI fan-out shares one concurrency
  // budget rather than nesting two separate mapWithConcurrency calls (which could otherwise burst
  // past Catalyst's per-project concurrency limit — see lib/concurrency.ts).
  const kpiJobs = scopes.flatMap((scope) =>
    COMPARISON_KPI_CODES.map((code) => ({ scope, code })),
  );
  const kpiResults = await mapWithConcurrency(kpiJobs, 4, ({ scope, code }) =>
    calculateKpi(catalystApp, ctx, code, { propertyId: scope.id, asOf }),
  );
  const kpiByScope = new Map<string, Map<string, Awaited<ReturnType<typeof calculateKpi>>>>();
  kpiJobs.forEach((job, i) => {
    const key = job.scope.id ?? "group";
    const inner = kpiByScope.get(key) ?? new Map();
    inner.set(job.code, kpiResults[i]);
    kpiByScope.set(key, inner);
  });

  const extras = await mapWithConcurrency(scopes, 3, async (scope) => {
    if (scope.isGroup) {
      // Group open-investigations/CAPA/data-completeness are summed from the per-Business-Unit
      // figures below once those are computed, not queried unscoped a second time here.
      return null;
    }
    const propertyId = scope.id!;
    const [investigations, capa, dataQuality] = await Promise.all([
      countOpenInvestigations(catalystApp, propertyId),
      countCapa(catalystApp, propertyId),
      computeDataQuality({
        catalystApp,
        ctx,
        propertyId,
        periodStart: new Date(asOf.getFullYear() - 1, asOf.getMonth(), asOf.getDate()),
        periodEnd: asOf,
      }),
    ]);
    return { investigations, capa, dataQuality };
  });

  const rows: BusinessUnitComparisonRow[] = scopes.map((scope, i) => {
    const key = scope.id ?? "group";
    const kpis = kpiByScope.get(key)!;
    const get = (code: string) => kpis.get(code)?.currentValue ?? null;
    const extra = extras[i];

    const totalDataQualityIssues = extra
      ? extra.dataQuality.reduce((sum, r) => sum + r.count, 0)
      : null;
    const totalIncidents = get("TOTAL_INCIDENTS");
    const dataCompletenessPct =
      extra && totalIncidents != null && totalIncidents > 0
        ? Math.max(0, 100 - (totalDataQualityIssues! / totalIncidents) * 100)
        : null;

    return {
      businessUnitId: scope.id,
      businessUnitName: scope.name,
      isGroupTotal: scope.isGroup,
      totalIncidents,
      fatalities: get("FATALITIES"),
      lti: get("LTI"),
      highPotential: get("HIGH_POTENTIAL"),
      lostDays: get("LOST_WORKDAYS"),
      hospitalReferrals: get("HOSPITAL_REFERRALS"),
      oshReportable: get("REPORTABLE_OSH_CASES"),
      openInvestigations: extra?.investigations ?? null,
      openCapa: extra?.capa.open ?? null,
      overdueCapa: extra?.capa.overdue ?? null,
      criticalMajorFindings: get("OPEN_CRIT_MAJOR_FINDINGS"),
      dataCompletenessPct,
      assuranceStatus: deriveAssuranceStatus(
        kpis.get("ISO45001_READINESS")?.ragStatus,
        kpis.get("LEGAL_COMPLIANCE")?.ragStatus,
        extra?.capa.overdue ?? 0,
        get("OPEN_CRIT_MAJOR_FINDINGS") ?? 0,
      ),
    };
  });

  // Fill in the Group row's investigation/CAPA/data-completeness figures as the sum of the
  // per-Business-Unit rows (never a separate unscoped query) — keeps the Group total honest and
  // reconcilable to the visible Business Unit rows above it.
  const groupRow = rows.find((r) => r.isGroupTotal);
  if (groupRow) {
    const buRows = rows.filter((r) => !r.isGroupTotal);
    groupRow.openInvestigations = buRows.reduce((s, r) => s + (r.openInvestigations ?? 0), 0);
    groupRow.openCapa = buRows.reduce((s, r) => s + (r.openCapa ?? 0), 0);
    groupRow.overdueCapa = buRows.reduce((s, r) => s + (r.overdueCapa ?? 0), 0);
    const withCompleteness = buRows.filter((r) => r.dataCompletenessPct != null);
    groupRow.dataCompletenessPct =
      withCompleteness.length > 0
        ? withCompleteness.reduce((s, r) => s + r.dataCompletenessPct!, 0) / withCompleteness.length
        : null;
  }

  return rows;
}

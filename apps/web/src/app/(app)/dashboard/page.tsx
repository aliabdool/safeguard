import { headers } from "next/headers";
import Link from "next/link";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { catalystAppFromHeaders } from "@/lib/catalyst/app";
import { mapWithConcurrency } from "@/lib/concurrency";
import { logDebugError } from "@/lib/debug-log";
import { computeAssuranceHeatmap } from "@/server/dashboard/assurance-heatmap";
import type { HeatmapRow } from "@/server/dashboard/assurance-heatmap";
import { computeBusinessUnitComparison } from "@/server/dashboard/business-units";
import type { BusinessUnitComparisonRow } from "@/server/dashboard/business-units";
import { computeDataQuality } from "@/server/dashboard/data-quality";
import type { DataQualityRow } from "@/server/dashboard/data-quality";
import { computeAllFrameworkReadiness, computeOverallMaturity } from "@/server/dashboard/frameworks";
import type { FrameworkReadinessRow } from "@/server/dashboard/frameworks";
import { computeManagementAttention } from "@/server/dashboard/management-attention";
import type { ManagementAttentionItem } from "@/server/dashboard/management-attention";
import { generateExecutiveNarrative } from "@/server/dashboard/narrative";
import type { ExecutiveNarrative } from "@/server/dashboard/narrative";
import { computeSafetyPerformance } from "@/server/dashboard/safety-performance";
import type { SafetyPerformanceData } from "@/server/dashboard/safety-performance";
import {
  DASHBOARD_ROLES,
  GROUP_SCOPE_PARAM,
  resolveDashboardScope,
} from "@/server/dashboard/scope";
import type { BusinessUnit, DashboardScope } from "@/server/dashboard/scope";
import { calculateKpi } from "@/server/kpi/calculate";
import {
  financialYearFor,
  previousFinancialYear,
  recentFinancialYears,
  sameperiodYtdComparison,
} from "@/server/kpi/period";
import { getAuthContext } from "@/server/permissions";

import {
  AssuranceHeatmapPanel,
  BusinessUnitTable,
  DataQualityPanel,
  ExecutiveKpiStrip,
  FrameworkReadinessPanel,
  ManagementAttentionPanel,
  NarrativePanel,
  SafetyPerformancePanel,
  type ExecTile,
} from "./sections";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ bu?: string; fy?: string }>;
}) {
  const ctx = await getAuthContext();

  if (!ctx) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="text-2xl font-semibold tracking-tight">
          Sunlife Group H&amp;S Assurance &amp; Readiness
        </h1>
        <Card>
          <CardHeader>
            <CardTitle>Sign in required</CardTitle>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const hasDashboardAccess = ctx.roleCodes.some((r) =>
    (DASHBOARD_ROLES as readonly string[]).includes(r),
  );
  if (!hasDashboardAccess) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="text-2xl font-semibold tracking-tight">
          Sunlife Group H&amp;S Assurance &amp; Readiness
        </h1>
        <Card>
          <CardHeader>
            <CardTitle>Executive access required</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground text-sm">
              This view is scoped to Group Executive/Admin roles (Group H&amp;S Admin, Super Admin,
              or Executive Read-Only). Your current roles: {ctx.roleCodes.join(", ") || "none"}.
              Ask an administrator to grant executive-reporting access if this is incorrect.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { bu, fy } = await searchParams;
  const catalystApp = catalystAppFromHeaders(await headers());

  let scope: DashboardScope;
  let businessUnits: BusinessUnit[];
  let fyOptions: ReturnType<typeof recentFinancialYears>;
  let selectedFy: ReturnType<typeof recentFinancialYears>[number];
  let fyLabel: string;
  let asOf: Date;
  let managementAttention: ManagementAttentionItem[];
  let businessUnitRows: BusinessUnitComparisonRow[];
  let frameworkReadiness: FrameworkReadinessRow[];
  let heatmapRows: HeatmapRow[];
  let safetyPerformance: SafetyPerformanceData;
  let dataQuality: DataQualityRow[];
  let execTiles: ExecTile[];
  let narrative: ExecutiveNarrative;
  let scopedRow: BusinessUnitComparisonRow | undefined;
  let overallMaturity: Awaited<ReturnType<typeof computeOverallMaturity>>;

  // TEMPORARY: explicit console.error so the real error is visible in AppSail logs — Next.js
  // redacts Server Component error messages by default in production (see the equivalent comment
  // on the original operational dashboard, and the audit-log datetime bug this exact pattern
  // caught earlier — see chat). Remove once this dashboard is confirmed working end-to-end.
  try {
    const resolved = await resolveDashboardScope(catalystApp, bu);
    scope = resolved.scope;
    businessUnits = resolved.businessUnits;
    const propertyNameById = new Map(businessUnits.map((b) => [b.id, b.name]));

    fyOptions = recentFinancialYears(new Date());
    selectedFy = fyOptions.find((o) => o.label === fy) ?? fyOptions[0]!;
    asOf = selectedFy.asOfAnchor;
    const { fyLabel: resolvedFyLabel, period: currentPeriod } = financialYearFor(asOf);
    fyLabel = resolvedFyLabel;
    const comparisonPeriodFull = previousFinancialYear(currentPeriod);
    const { comparisonEnd } = sameperiodYtdComparison(currentPeriod, comparisonPeriodFull, asOf);

    // Sequential, not Promise.all — confirmed live (see chat) that firing all of these at once,
    // each of which independently issues its own burst of Catalyst queries (some already
    // internally concurrency-limited, some not), sums past Catalyst's per-project concurrency cap
    // and produces a 429 "Concurrency limit reached for the feature COMPONENT" that crashed this
    // exact page in Development. A CEO dashboard is not a hot-path, high-frequency page — trading
    // a few extra seconds of load time for zero 429s is the right tradeoff here, matching
    // lib/concurrency.ts's own reasoning for why the original dashboard needed the same treatment.
    managementAttention = await computeManagementAttention(catalystApp, ctx, scope, propertyNameById);
    businessUnitRows = await computeBusinessUnitComparison(catalystApp, ctx, businessUnits, asOf);
    frameworkReadiness = await computeAllFrameworkReadiness(catalystApp, scope, ctx);
    overallMaturity = await computeOverallMaturity(catalystApp, scope, ctx);
    heatmapRows = await computeAssuranceHeatmap(catalystApp, ctx, businessUnits, {
      start: currentPeriod.start,
      end: currentPeriod.end,
      comparisonStart: comparisonPeriodFull.start,
      comparisonEnd,
    });
    safetyPerformance = await computeSafetyPerformance(catalystApp, ctx, scope.propertyId, asOf);
    dataQuality = await computeDataQuality({
      catalystApp,
      ctx,
      propertyId: scope.propertyId,
      periodStart: currentPeriod.start,
      periodEnd: asOf < currentPeriod.end ? asOf : currentPeriod.end,
    });

    const execKpiCodes = [
      "LEGAL_COMPLIANCE",
      "ISO45001_READINESS",
      "GRI403_READINESS",
      "IFRS_S1_READINESS",
      "IFRS_S2_READINESS",
      "HIGH_POTENTIAL",
      "OPEN_CRIT_MAJOR_FINDINGS",
    ] as const;
    const execKpiResults = await mapWithConcurrency([...execKpiCodes], 3, (code) =>
      calculateKpi(catalystApp, ctx, code, { propertyId: scope.propertyId, asOf }),
    );
    const execKpiByCode = new Map(execKpiCodes.map((code, i) => [code, execKpiResults[i]!]));
    const legalKpi = execKpiByCode.get("LEGAL_COMPLIANCE")!;
    const iso45001Kpi = execKpiByCode.get("ISO45001_READINESS")!;
    const gri403Kpi = execKpiByCode.get("GRI403_READINESS")!;
    const ifrsS1Kpi = execKpiByCode.get("IFRS_S1_READINESS")!;
    const ifrsS2Kpi = execKpiByCode.get("IFRS_S2_READINESS")!;
    const highPotentialKpi = execKpiByCode.get("HIGH_POTENTIAL")!;
    const critMajorKpi = execKpiByCode.get("OPEN_CRIT_MAJOR_FINDINGS")!;

    scopedRow =
      businessUnitRows.find(
        (r) => (scope.kind === "group" && r.isGroupTotal) || r.businessUnitId === scope.propertyId,
      ) ?? businessUnitRows[0];

    execTiles = [
      {
        code: "OVERALL_MATURITY",
        label: "Overall H&S system maturity",
        result:
          overallMaturity.readinessPct != null
            ? {
                currentValue: overallMaturity.readinessPct,
                comparisonValue: null,
                ragStatus: overallMaturity.ragStatus,
                unit: "%",
              }
            : null,
        linkHref: null,
      },
      {
        code: "LEGAL_COMPLIANCE",
        label: "Legal compliance status",
        result: legalKpi,
        linkHref: `/kpis/LEGAL_COMPLIANCE${scope.propertyId ? `?propertyId=${scope.propertyId}` : ""}`,
      },
      {
        code: "ISO45001_READINESS",
        label: "ISO 45001 readiness",
        result: iso45001Kpi,
        linkHref: `/kpis/ISO45001_READINESS${scope.propertyId ? `?propertyId=${scope.propertyId}` : ""}`,
      },
      {
        code: "GRI403_READINESS",
        label: "GRI 403 readiness",
        result: gri403Kpi,
        linkHref: gri403Kpi
          ? `/kpis/GRI403_READINESS${scope.propertyId ? `?propertyId=${scope.propertyId}` : ""}`
          : null,
      },
      {
        code: "IFRS_S1_READINESS",
        label: "ISSB / IFRS S1 evidence readiness",
        result: ifrsS1Kpi,
        linkHref: ifrsS1Kpi
          ? `/kpis/IFRS_S1_READINESS${scope.propertyId ? `?propertyId=${scope.propertyId}` : ""}`
          : null,
      },
      {
        code: "IFRS_S2_READINESS",
        label: "ISSB / IFRS S2 evidence readiness",
        result: ifrsS2Kpi,
        linkHref: ifrsS2Kpi
          ? `/kpis/IFRS_S2_READINESS${scope.propertyId ? `?propertyId=${scope.propertyId}` : ""}`
          : null,
      },
      {
        code: "OPEN_CRIT_MAJOR_FINDINGS",
        label: "Critical + Major findings",
        result: critMajorKpi,
        linkHref: `/kpis/OPEN_CRIT_MAJOR_FINDINGS${scope.propertyId ? `?propertyId=${scope.propertyId}` : ""}`,
      },
      {
        code: "OVERDUE_CAPA",
        label: "Overdue CAPA",
        result: scopedRow
          ? {
              currentValue: scopedRow.overdueCapa,
              comparisonValue: null,
              ragStatus: (scopedRow.overdueCapa ?? 0) > 0 ? "amber" : "green",
              unit: "count",
            }
          : null,
        linkHref: "/capa",
      },
      {
        code: "HIGH_POTENTIAL",
        label: "High-potential incidents",
        result: highPotentialKpi,
        linkHref: `/kpis/HIGH_POTENTIAL${scope.propertyId ? `?propertyId=${scope.propertyId}` : ""}`,
      },
    ];

    narrative = generateExecutiveNarrative({
      scopeLabel: scope.label,
      fyLabel,
      totalIncidentsCurrent: scopedRow?.totalIncidents ?? null,
      totalIncidentsComparison: null,
      highPotentialCurrent: highPotentialKpi?.currentValue ?? null,
      managementAttention,
      businessUnitRows,
      frameworkReadiness,
      dataQuality,
    });
  } catch (err) {
    logDebugError("CEO_DASHBOARD_DEBUG_ERROR:", err);
    throw err;
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">
          Sunlife Group H&amp;S Assurance &amp; Readiness
        </h1>
        <p className="text-muted-foreground text-sm">
          {scope.label} · {fyLabel} · Data through {asOf.toLocaleDateString()} · Data completeness{" "}
          {scopedRow?.dataCompletenessPct != null ? `${scopedRow.dataCompletenessPct.toFixed(0)}%` : "—"}{" "}
          · Records included {scopedRow?.totalIncidents ?? "—"}
        </p>
      </div>

      <form className="flex flex-wrap items-end gap-3" action="/dashboard" method="get">
        <div className="grid gap-1">
          <label className="text-muted-foreground text-xs">Financial year</label>
          <Select name="fy" defaultValue={selectedFy.label}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {fyOptions.map((o) => (
                <SelectItem key={o.label} value={o.label}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1">
          <label className="text-muted-foreground text-xs">Business Unit</label>
          <Select name="bu" defaultValue={scope.propertyId ?? GROUP_SCOPE_PARAM}>
            <SelectTrigger className="w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={GROUP_SCOPE_PARAM}>Sunlife Group</SelectItem>
              {businessUnits.map((b) => (
                <SelectItem key={b.id} value={b.id}>
                  {b.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <button
          type="submit"
          className="bg-primary text-primary-foreground hover:bg-primary/90 rounded-md px-4 py-2 text-sm font-medium"
        >
          Apply
        </button>
        <div className="ml-auto flex flex-wrap items-center gap-3">
          <Link
            href={`/reports/export?fy=${encodeURIComponent(fyLabel)}${scope.propertyId ? `&propertyId=${scope.propertyId}` : ""}`}
            className="text-primary text-sm underline"
          >
            Generate Board Pack →
          </Link>
          <Link href="/kpis" className="text-primary text-sm underline">
            View Calculations →
          </Link>
          <Link href="/reports/export" className="text-primary text-sm underline">
            Reports &amp; Exports →
          </Link>
        </div>
      </form>

      <ManagementAttentionPanel items={managementAttention} />

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold tracking-tight">Executive assurance</h2>
        <ExecutiveKpiStrip tiles={execTiles} />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold tracking-tight">
          Framework &amp; disclosure readiness
        </h2>
        <FrameworkReadinessPanel rows={frameworkReadiness} />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold tracking-tight">Business Unit comparison</h2>
        <Card>
          <CardContent className="p-4">
            <BusinessUnitTable rows={businessUnitRows} fy={selectedFy.label} />
          </CardContent>
        </Card>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold tracking-tight">Assurance heatmap</h2>
        <Card>
          <CardContent className="p-4">
            <AssuranceHeatmapPanel rows={heatmapRows} />
          </CardContent>
        </Card>
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold tracking-tight">Safety performance</h2>
          <Link href="/kpis" className="text-primary text-sm underline">
            Full analytics →
          </Link>
        </div>
        <SafetyPerformancePanel data={safetyPerformance} />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold tracking-tight">
          Data quality &amp; disclosure confidence
        </h2>
        <Card>
          <CardContent className="p-4">
            <DataQualityPanel rows={dataQuality} />
          </CardContent>
        </Card>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold tracking-tight">Executive narrative</h2>
        <Card>
          <CardContent className="p-4">
            <NarrativePanel narrative={narrative} />
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

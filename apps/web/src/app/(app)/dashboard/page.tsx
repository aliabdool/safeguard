import { headers } from "next/headers";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { catalystAppFromHeaders, type CatalystRow } from "@/lib/catalyst/app";
import { computeDataQuality } from "@/server/dashboard/data-quality";
import { calculateKpi } from "@/server/kpi/calculate";
import { financialYearFor, recentFinancialYears } from "@/server/kpi/period";
import { propertyScopeClause } from "@/server/kpi/scope";
import { getAuthContext, hasPropertyAccess } from "@/server/permissions";

import { IncidentBarChart } from "./incident-bar-chart";
import { KpiTile } from "../kpis/kpi-tile";

const HEADLINE_KPI_CODES = [
  "TOTAL_INCIDENTS",
  "EMPLOYEE_INCIDENTS",
  "TRAINEE_INCIDENTS",
  "CONTRACTOR_INCIDENTS",
  "GUEST_INCIDENTS",
  "FATALITIES",
  "LTI",
  "LOST_WORKDAYS",
  "RESTRICTED_DUTY_DAYS",
  "MTC",
  "HOSPITAL_REFERRALS",
  "RECORDABLE_INJURIES",
  "REPORTABLE_OSH_CASES",
  "HIGH_POTENTIAL",
  "NEAR_MISSES",
  "INCIDENT_COST",
  "OPEN_CRIT_MAJOR_FINDINGS",
  "CAPA_EFFECTIVENESS",
];

interface PropertyRow extends CatalystRow {
  name: string;
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ propertyId?: string; fy?: string }>;
}) {
  const { propertyId, fy } = await searchParams;
  const ctx = await getAuthContext();

  if (!ctx || (ctx.propertyIds.length === 0 && !ctx.roleCodes.length)) {
    return (
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground text-sm">
            Roles: {ctx?.roleCodes.join(", ") || "none assigned yet"} · Properties:{" "}
            {ctx?.propertyIds.length ?? 0}
          </p>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>No access assigned yet</CardTitle>
            <CardDescription>
              An administrator needs to grant you a role and at least one property before
              incident, audit, document or KPI data becomes visible.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const catalystApp = catalystAppFromHeaders(await headers());
  const datastore = catalystApp.datastore();
  const zcql = catalystApp.zcql();

  let allProperties: PropertyRow[];
  let availableProperties: PropertyRow[];
  let fyOptions: ReturnType<typeof recentFinancialYears>;
  let selectedFy: ReturnType<typeof recentFinancialYears>[number];
  let selectedPeriod: ReturnType<typeof financialYearFor>["period"];
  let tiles: Awaited<ReturnType<typeof calculateKpi>>[];
  let byType: Array<{ label: string; count: number }>;
  let byDept: Array<{ label: string; count: number }>;
  let dataQuality: Awaited<ReturnType<typeof computeDataQuality>>;
  let selectedPropertyId: string | null;

  // TEMPORARY: explicit console.error so the real error is visible in AppSail logs — Next.js
  // redacts Server Component error messages by default in production, even from the documented
  // instrumentation.ts onRequestError hook (per its own docs: "error instance might not be the
  // original error instance ... if encountered during Server Components rendering"). Remove once
  // the dashboard is confirmed working end-to-end (see chat).
  try {
    allProperties = (await datastore.table("Properties").getRows({ maxRows: 200 })) as PropertyRow[];
    availableProperties = allProperties.filter((p) => hasPropertyAccess(ctx, p.ROWID));
    selectedPropertyId =
      propertyId && availableProperties.some((p) => p.ROWID === propertyId) ? propertyId : null;

    fyOptions = recentFinancialYears(new Date());
    selectedFy = fyOptions.find((o) => o.label === fy) ?? fyOptions[0]!;
    selectedPeriod = financialYearFor(selectedFy.asOfAnchor).period;

    tiles = await Promise.all(
      HEADLINE_KPI_CODES.map((code) =>
        calculateKpi(catalystApp, ctx, code, {
          propertyId: selectedPropertyId,
          asOf: selectedFy.asOfAnchor,
        }),
      ),
    );

    const incidentScope = selectedPropertyId
      ? `Incidents.property_id == '${selectedPropertyId}'`
      : propertyScopeClause("Incidents.property_id", ctx);
    const periodClause = `Incidents.occurred_at between '${selectedPeriod.start.toISOString()}' and '${selectedPeriod.end.toISOString()}'`;

    const [byTypeRows, byDeptRows] = (await Promise.all([
      zcql.executeZCQLQuery(
        `select Incidents.incident_type, count(Incidents.ROWID) as n from Incidents
         where ${incidentScope} && ${periodClause}
         group by Incidents.incident_type`,
      ),
      zcql.executeZCQLQuery(
        `select Departments.name, count(Incidents.ROWID) as n from Incidents
         left join Departments on Incidents.department_id = Departments.ROWID
         where ${incidentScope} && ${periodClause}
         group by Departments.name`,
      ),
    ])) as [
      Array<{ Incidents: { incident_type: string; n: string } }>,
      Array<{ Departments: { name: string }; Incidents: { n: string } }>,
    ];

    byType = byTypeRows
      .map((r) => ({ label: r.Incidents.incident_type, count: Number(r.Incidents.n) }))
      .sort((a, b) => b.count - a.count);
    byDept = byDeptRows
      .map((r) => ({ label: r.Departments.name, count: Number(r.Incidents.n) }))
      .sort((a, b) => b.count - a.count);

    // Data-quality panel — real checks against this FY/property's own records, not fabricated.
    dataQuality = await computeDataQuality({
      catalystApp,
      ctx,
      propertyId: selectedPropertyId,
      periodStart: selectedPeriod.start,
      periodEnd: selectedPeriod.end,
    });
  } catch (err) {
    console.error("DASHBOARD_DEBUG_REAL_ERROR:", err instanceof Error ? err.stack : err);
    throw err;
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Board &amp; management dashboard
        </h1>
        <p className="text-muted-foreground text-sm">
          {selectedFy.label} · every figure computed live from Catalyst Data Store records — never
          hard-coded. Click a tile for the full &ldquo;View calculation&rdquo; breakdown.
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
          <label className="text-muted-foreground text-xs">Property</label>
          <Select name="propertyId" defaultValue={selectedPropertyId ?? "all"}>
            <SelectTrigger className="w-64">
              <SelectValue placeholder="All accessible properties" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All accessible properties</SelectItem>
              {availableProperties.map((p) => (
                <SelectItem key={p.ROWID} value={p.ROWID}>
                  {p.name}
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
        <Link
          href={`/reports/export?fy=${encodeURIComponent(selectedFy.label)}${selectedPropertyId ? `&propertyId=${selectedPropertyId}` : ""}`}
          className="text-primary ml-auto self-center text-sm underline"
        >
          Board narrative &amp; assurance pack →
        </Link>
        <Link href="/kpis" className="text-primary self-center text-sm underline">
          Full KPI catalogue →
        </Link>
      </form>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
        {tiles.map((kpi) => (kpi ? <KpiTile key={kpi.kpiCode} kpi={kpi} /> : null))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Incidents by type</CardTitle>
            <CardDescription>{selectedFy.label}</CardDescription>
          </CardHeader>
          <CardContent>
            <IncidentBarChart data={byType.map((r) => ({ label: r.label, count: r.count }))} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Incidents by department</CardTitle>
            <CardDescription>{selectedFy.label}</CardDescription>
          </CardHeader>
          <CardContent>
            <IncidentBarChart
              data={byDept.map((r) => ({ label: r.label, count: r.count }))}
              color="var(--color-warning)"
            />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Data quality</CardTitle>
          <CardDescription>
            Gaps in this period&rsquo;s own records — the same checks a board pack should be
            reconciled against before publication.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {dataQuality.map((row) => (
            <div key={row.label} className="flex items-center justify-between text-sm">
              <span>{row.label}</span>
              <Badge variant={row.count > 0 ? "warning" : "success"}>{row.count}</Badge>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

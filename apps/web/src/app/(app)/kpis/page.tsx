import { headers } from "next/headers";

import {
  INCIDENT_TYPE_OPTIONS,
  OUTCOME_OPTIONS,
  PERSON_TYPE_OPTIONS,
} from "@/app/(app)/incidents/new/wizard-constants";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { IncidentBarChart } from "@/app/(app)/dashboard/incident-bar-chart";
import { catalystAppFromHeaders, type CatalystRow } from "@/lib/catalyst/app";
import { mapWithConcurrency } from "@/lib/concurrency";
import { computeSafetyAnalytics } from "@/server/dashboard/analytics";
import { listDepartments } from "@/server/identity/catalyst-identity";
import { calculateKpi, isKpiImplemented } from "@/server/kpi/calculate";
import { recentFinancialYears } from "@/server/kpi/period";
import { getAuthContext, hasPropertyAccess } from "@/server/permissions";

import { DepartmentAnalysisTable } from "./department-analysis-table";
import { DepartmentFyHeatmap } from "./department-fy-heatmap";
import { FyHistoryChart } from "./fy-history-chart";
import { KpiSummaryStrip } from "./kpi-summary-strip";
import { MonthlyTrendChart } from "./monthly-trend-chart";

interface PropertyRow extends CatalystRow {
  name: string;
}

interface KpiDefinitionListRow extends CatalystRow {
  kpi_code: string;
}

const SUMMARY_KPI_CODES = [
  "TOTAL_INCIDENTS",
  "EMPLOYEE_INCIDENTS",
  "GUEST_INCIDENTS",
  "FATALITIES",
  "LTI",
  "LTIFR",
  "SEVERITY_RATE",
  "HIGH_POTENTIAL",
  "HOSPITAL_REFERRALS",
  "REPORTABLE_OSH_CASES",
  "LOST_WORKDAYS",
  "RESTRICTED_DUTY_DAYS",
] as const;

const INCIDENT_TYPE_LABELS = Object.fromEntries(INCIDENT_TYPE_OPTIONS) as Record<
  string,
  string
>;
const OUTCOME_LABELS = Object.fromEntries(OUTCOME_OPTIONS) as Record<string, string>;
const PERSON_TYPE_LABELS = Object.fromEntries(PERSON_TYPE_OPTIONS) as Record<string, string>;

function formatPct(value: number | null): string {
  if (value == null) return "n/a (no comparison-period incidents)";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}%`;
}

export default async function KpisPage({
  searchParams,
}: {
  searchParams: Promise<{
    propertyId?: string;
    departmentId?: string;
    incidentType?: string;
    personEventType?: string;
    fy?: string;
  }>;
}) {
  const { propertyId, departmentId, incidentType, personEventType, fy } = await searchParams;
  const ctx = await getAuthContext();
  const catalystApp = catalystAppFromHeaders(await headers());
  const datastore = catalystApp.datastore();

  if (!ctx) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Not signed in</AlertTitle>
        <AlertDescription>Sign in to view Safety Performance Analytics.</AlertDescription>
      </Alert>
    );
  }

  const allProperties = (await datastore
    .table("Properties")
    .getRows({ maxRows: 200 })) as PropertyRow[];
  const availableProperties = allProperties.filter((p) => hasPropertyAccess(ctx, p.ROWID));
  const selectedPropertyId =
    propertyId && availableProperties.some((p) => p.ROWID === propertyId) ? propertyId : null;

  const departments = await listDepartments(catalystApp);
  const selectedDepartmentId =
    departmentId && departments.some((d) => d.id === departmentId) ? departmentId : null;

  const fyOptions = recentFinancialYears(new Date());
  const fyIndex = fy ? fyOptions.findIndex((o) => o.label === fy) : 0;
  const asOf = fyOptions[fyIndex >= 0 ? fyIndex : 0]?.asOfAnchor ?? new Date();

  const definitions = (
    (await datastore
      .table("KPIDefinitions")
      .getRows({ maxRows: 200 })) as KpiDefinitionListRow[]
  ).sort((a, b) => a.kpi_code.localeCompare(b.kpi_code));
  const notYetImplemented = definitions.filter((d) => !isKpiImplemented(d.kpi_code));

  const summaryTiles = await mapWithConcurrency([...SUMMARY_KPI_CODES], 4, (code) =>
    calculateKpi(catalystApp, ctx, code, {
      propertyId: selectedPropertyId,
      departmentId: selectedDepartmentId,
      asOf,
    }),
  );

  const selectedIncidentType = incidentType && incidentType !== "all" ? incidentType : null;
  const selectedPersonEventType =
    personEventType && personEventType !== "all" ? personEventType : null;

  const analytics = await computeSafetyAnalytics(
    catalystApp,
    ctx,
    {
      propertyId: selectedPropertyId,
      departmentId: selectedDepartmentId,
      incidentType: selectedIncidentType,
      personEventType: selectedPersonEventType,
    },
    asOf,
    departments,
    4,
    {
      incidentType: (v) => INCIDENT_TYPE_LABELS[v] ?? v,
      outcome: (v) => OUTCOME_LABELS[v] ?? v,
      personType: (v) => PERSON_TYPE_LABELS[v] ?? v,
    },
  );

  const majorCurrent = analytics.currentRecords.filter((r) => r.isMajor).length;
  const majorComparison = analytics.comparisonRecords.filter((r) => r.isMajor).length;
  const totalCurrent = analytics.currentRecords.length;
  const totalComparison = analytics.comparisonRecords.length;
  const yoyChangePct =
    totalComparison > 0 ? ((totalCurrent - totalComparison) / totalComparison) * 100 : null;

  const fyLabels = analytics.fyHistory.map((h) => h.fyLabel);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Safety Performance Analytics</h1>
        <p className="text-muted-foreground text-sm">
          Every figure below is computed live from Catalyst Data Store records at page-load
          time — never hard-coded from a reference spreadsheet. Comparing{" "}
          <span className="font-medium">{analytics.currentFyLabel}</span> against{" "}
          <span className="font-medium">{analytics.comparisonFyLabel}</span>.
        </p>
      </div>

      <form className="flex flex-wrap items-end gap-3" action="/kpis" method="get">
        <div className="grid gap-1">
          <label className="text-muted-foreground text-xs">Financial year</label>
          <Select name="fy" defaultValue={fyOptions[fyIndex >= 0 ? fyIndex : 0]?.label}>
            <SelectTrigger className="w-36">
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
          <Select name="propertyId" defaultValue={selectedPropertyId ?? "all"}>
            <SelectTrigger className="w-56">
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
        <div className="grid gap-1">
          <label className="text-muted-foreground text-xs">Department</label>
          <Select name="departmentId" defaultValue={selectedDepartmentId ?? "all"}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="All departments" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All departments</SelectItem>
              {departments.map((d) => (
                <SelectItem key={d.id} value={d.id}>
                  {d.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1">
          <label className="text-muted-foreground text-xs">Incident type</label>
          <Select name="incidentType" defaultValue={incidentType ?? "all"}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="All types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              {INCIDENT_TYPE_OPTIONS.map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1">
          <label className="text-muted-foreground text-xs">Person type</label>
          <Select name="personEventType" defaultValue={personEventType ?? "all"}>
            <SelectTrigger className="w-44">
              <SelectValue placeholder="All person types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All person types</SelectItem>
              {PERSON_TYPE_OPTIONS.map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <button
          type="submit"
          className="bg-primary text-primary-foreground h-9 rounded-md px-4 text-sm font-medium"
        >
          Apply
        </button>
      </form>

      <KpiSummaryStrip
        tiles={summaryTiles}
        majorCurrent={majorCurrent}
        majorComparison={majorComparison}
        yoyChangePct={yoyChangePct}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Monthly trend — {analytics.currentFyLabel} vs {analytics.comparisonFyLabel}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <MonthlyTrendChart
              data={analytics.monthlyTrend}
              currentLabel={analytics.currentFyLabel}
              comparisonLabel={analytics.comparisonFyLabel}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Incident history by financial year</CardTitle>
          </CardHeader>
          <CardContent>
            <FyHistoryChart data={analytics.fyHistory} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Department analysis</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          <div>
            <h3 className="mb-2 text-sm font-medium">Top 5 departments this period</h3>
            <DepartmentAnalysisTable rows={analytics.departmentAnalysis} limit={5} />
          </div>
          <div>
            <h3 className="mb-2 text-sm font-medium">All departments</h3>
            <DepartmentAnalysisTable rows={analytics.departmentAnalysis} />
          </div>
          <div>
            <h3 className="mb-2 text-sm font-medium">
              Department × financial year (incident count)
            </h3>
            <DepartmentFyHeatmap rows={analytics.departmentFyHeatmap} fyLabels={fyLabels} />
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">By incident type</CardTitle>
          </CardHeader>
          <CardContent>
            <BreakdownBars items={analytics.breakdowns.byIncidentType} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">By outcome</CardTitle>
          </CardHeader>
          <CardContent>
            <BreakdownBars items={analytics.breakdowns.byOutcome} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">By person type</CardTitle>
          </CardHeader>
          <CardContent>
            <BreakdownBars items={analytics.breakdowns.byPersonType} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">By body part / location</CardTitle>
          </CardHeader>
          <CardContent>
            <BreakdownBars items={analytics.breakdowns.byBodyPart} />
          </CardContent>
        </Card>
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">By day of week</CardTitle>
          </CardHeader>
          <CardContent>
            <BreakdownBars items={analytics.breakdowns.byDayOfWeek} />
          </CardContent>
        </Card>
      </div>

      {notYetImplemented.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Catalogued, calculation not yet implemented
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Alert>
              <AlertTitle>
                {notYetImplemented.length} KPIs are registered but not wired to live data yet
              </AlertTitle>
              <AlertDescription>
                Their definitions (formula, thresholds, evidence requirements) are in the
                catalogue below — extending the calculation engine to cover them is tracked in
                docs/implementation-plan.md, not silently hidden.
              </AlertDescription>
            </Alert>
            <div className="mt-3 flex flex-wrap gap-2">
              {notYetImplemented.map((d) => (
                <Badge key={d.kpi_code} variant="outline">
                  {d.kpi_code}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : null}

      <p className="text-muted-foreground text-xs">
        Year-over-year total incidents change: {formatPct(yoyChangePct)}.
      </p>
    </div>
  );
}

function BreakdownBars({
  items,
}: {
  items: { label: string; count: number; pct: number | null }[];
}) {
  if (items.length === 0 || items.every((i) => i.count === 0)) {
    return <p className="text-muted-foreground text-sm">No incidents in this period.</p>;
  }
  return (
    <IncidentBarChart
      data={items.map((i) => ({ label: `${i.label} (${i.count})`, count: i.count }))}
    />
  );
}

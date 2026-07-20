import { and, between, eq, isNull, lt, ne, notInArray, sql } from "drizzle-orm";
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
import { getDb } from "@/db";
import {
  capaActions,
  departments,
  incidents,
  investigationCauses,
  investigations,
  properties,
} from "@/db/schema";
import { calculateKpi } from "@/server/kpi/calculate";
import { financialYearFor, previousFinancialYear } from "@/server/kpi/period";
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

/** Last 4 financial years, most recent first — matches the FY selector on the real board Excel. */
function recentFinancialYears(asOf: Date) {
  const years: { label: string; asOfAnchor: Date }[] = [];
  let { fyLabel, period } = financialYearFor(asOf);
  for (let i = 0; i < 4; i++) {
    years.push({ label: fyLabel, asOfAnchor: new Date(period.end.getTime() - 1) });
    const prev = previousFinancialYear(period);
    const relabelled = financialYearFor(new Date(prev.end.getTime() - 1));
    fyLabel = relabelled.fyLabel;
    period = prev;
  }
  return years;
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ propertyId?: string; fy?: string }>;
}) {
  const { propertyId, fy } = await searchParams;
  const ctx = await getAuthContext();
  const db = getDb();

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

  const allProperties = await db
    .select({ id: properties.id, name: properties.name })
    .from(properties);
  const availableProperties = allProperties.filter((p) => hasPropertyAccess(ctx, p.id));
  const selectedPropertyId =
    propertyId && availableProperties.some((p) => p.id === propertyId) ? propertyId : null;

  const fyOptions = recentFinancialYears(new Date());
  const selectedFy = fyOptions.find((o) => o.label === fy) ?? fyOptions[0]!;
  const { period: selectedPeriod } = financialYearFor(selectedFy.asOfAnchor);

  const tiles = await Promise.all(
    HEADLINE_KPI_CODES.map((code) =>
      calculateKpi(code, { propertyId: selectedPropertyId, asOf: selectedFy.asOfAnchor }),
    ),
  );

  const scopePredicate = selectedPropertyId
    ? eq(incidents.propertyId, selectedPropertyId)
    : undefined;
  const periodPredicate = between(
    incidents.occurredAt,
    selectedPeriod.start,
    selectedPeriod.end,
  );

  const [byType, byDept] = await Promise.all([
    db
      .select({ label: incidents.incidentType, count: sql<number>`count(*)::int` })
      .from(incidents)
      .where(and(periodPredicate, scopePredicate))
      .groupBy(incidents.incidentType)
      .orderBy(sql`count(*) desc`),
    db
      .select({ label: departments.name, count: sql<number>`count(*)::int` })
      .from(incidents)
      .innerJoin(departments, eq(departments.id, incidents.departmentId))
      .where(and(periodPredicate, scopePredicate))
      .groupBy(departments.name)
      .orderBy(sql`count(*) desc`),
  ]);

  // Data-quality panel — real checks against this FY/property's own records, not fabricated.
  const inScopeIncidents = await db
    .select({ id: incidents.id, status: incidents.status })
    .from(incidents)
    .where(and(periodPredicate, scopePredicate));
  const needingInvestigation = inScopeIncidents.filter((i) => i.status !== "reported");

  const rootCauseIncidentIds =
    needingInvestigation.length === 0
      ? new Set<string>()
      : new Set(
          (
            await db
              .select({ incidentId: investigations.incidentId })
              .from(investigationCauses)
              .innerJoin(
                investigations,
                eq(investigations.id, investigationCauses.investigationId),
              )
              .where(eq(investigationCauses.causeType, "root"))
          ).map((r) => r.incidentId),
        );
  const missingRootCause = needingInvestigation.filter(
    (i) => !rootCauseIncidentIds.has(i.id),
  ).length;

  const [missingInjuryMechanism] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(incidents)
    .where(
      and(
        periodPredicate,
        scopePredicate,
        isNull(incidents.injuryMechanism),
        ne(incidents.outcome, "no_injury"),
      ),
    );

  const [pendingReportableDetermination] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(incidents)
    .where(
      and(
        periodPredicate,
        scopePredicate,
        eq(incidents.reportableStatus, "pending_determination"),
      ),
    );

  const capaScopePredicate = selectedPropertyId
    ? eq(capaActions.propertyId, selectedPropertyId)
    : undefined;
  const [overdueCapa] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(capaActions)
    .where(
      and(
        capaScopePredicate,
        lt(capaActions.dueDate, new Date().toISOString().slice(0, 10)),
        notInArray(capaActions.status, ["closed", "verified"]),
      ),
    );

  const dataQuality = [
    { label: "Missing root cause (investigated incidents)", count: missingRootCause },
    {
      label: "Missing injury mechanism (injury outcomes)",
      count: missingInjuryMechanism?.n ?? 0,
    },
    {
      label: "OSH-reportable status not yet determined",
      count: pendingReportableDetermination?.n ?? 0,
    },
    { label: "Corrective actions overdue", count: overdueCapa?.n ?? 0 },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Board &amp; management dashboard
        </h1>
        <p className="text-muted-foreground text-sm">
          {selectedFy.label} · every figure computed live from Supabase records — never
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
                <SelectItem key={p.id} value={p.id}>
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
        <Link href="/kpis" className="text-primary ml-auto self-center text-sm underline">
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

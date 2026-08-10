import Link from "next/link";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { HeatmapRow } from "@/server/dashboard/assurance-heatmap";
import { ASSURANCE_AREAS } from "@/server/dashboard/assurance-heatmap";
import type { AssuranceStatus, BusinessUnitComparisonRow } from "@/server/dashboard/business-units";
import type { DataQualityRow } from "@/server/dashboard/data-quality";
import type { FrameworkReadinessRow } from "@/server/dashboard/frameworks";
import type { ManagementAttentionItem } from "@/server/dashboard/management-attention";
import type { ExecutiveNarrative } from "@/server/dashboard/narrative";
import type { SafetyPerformanceData } from "@/server/dashboard/safety-performance";
import { GROUP_SCOPE_PARAM } from "@/server/dashboard/scope";

import { formatDelta, formatKpiValue, heatmapRagClasses, heatmapRagLabel, RagBadge } from "./rag";

// ---------------------------------------------------------------------------
// §3 Management attention / legal override
// ---------------------------------------------------------------------------

export function ManagementAttentionPanel({ items }: { items: ManagementAttentionItem[] }) {
  const criticalCount = items.filter((i) => i.severity === "critical").length;

  if (items.length === 0) {
    return (
      <Alert>
        <AlertTitle>Management attention</AlertTitle>
        <AlertDescription>
          No critical management exceptions identified for the selected scope.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <Alert variant="destructive">
      <AlertTitle>
        Management attention — {criticalCount} matter{criticalCount === 1 ? "" : "s"} require
        {criticalCount === 1 ? "s" : ""} executive action
      </AlertTitle>
      <AlertDescription>
        <ul className="mt-2 flex flex-col gap-1">
          {items.slice(0, 8).map((item, i) => (
            <li key={i} className="flex items-start gap-2">
              <Badge variant={item.severity === "critical" ? "destructive" : "warning"}>
                {item.severity === "critical" ? "Critical" : "High"}
              </Badge>
              <span>
                <span className="font-medium">{item.businessUnitName}</span> — {item.message}
              </span>
            </li>
          ))}
        </ul>
        {items.length > 8 ? (
          <p className="mt-2 text-xs opacity-80">+{items.length - 8} more exception(s).</p>
        ) : null}
      </AlertDescription>
    </Alert>
  );
}

// ---------------------------------------------------------------------------
// §4 Executive KPI strip
// ---------------------------------------------------------------------------

export interface ExecTile {
  code: string;
  label: string;
  result: { currentValue: number | null; comparisonValue: number | null; ragStatus: import("@/server/kpi/rag").RagStatus; unit: string } | null;
  linkHref: string | null;
}

export function ExecutiveKpiStrip({ tiles }: { tiles: ExecTile[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
      {tiles.map((tile) => {
        const content = (
          <Card className="h-full transition-shadow hover:shadow-md">
            <CardContent className="flex flex-col gap-1 p-4">
              <p className="text-muted-foreground text-xs font-medium">{tile.label}</p>
              <p className="text-2xl font-semibold tracking-tight">
                {tile.result ? formatKpiValue(tile.result.currentValue, tile.result.unit) : "Not assessed"}
              </p>
              <div className="flex items-center justify-between">
                {tile.result ? <RagBadge status={tile.result.ragStatus} /> : <RagBadge status="unknown" />}
                {tile.result ? (
                  <span className="text-muted-foreground text-[11px]">
                    {formatDelta(tile.result.currentValue, tile.result.comparisonValue) ?? "—"}
                  </span>
                ) : null}
              </div>
            </CardContent>
          </Card>
        );
        return tile.linkHref ? (
          <Link key={tile.code} href={tile.linkHref}>
            {content}
          </Link>
        ) : (
          <div key={tile.code}>{content}</div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// §5 Framework / disclosure readiness
// ---------------------------------------------------------------------------

export function FrameworkReadinessPanel({ rows }: { rows: FrameworkReadinessRow[] }) {
  return (
    <div className="flex flex-col gap-3">
      {rows.map((fw) => (
        <Card key={fw.code}>
          <CardContent className="flex flex-col gap-2 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-medium">{fw.displayName}</span>
              <div className="flex items-center gap-2">
                {fw.status === "assessed" ? (
                  <>
                    <span className="text-lg font-semibold">{fw.readinessPct?.toFixed(0)}%</span>
                    <RagBadge status={fw.ragStatus} />
                  </>
                ) : fw.status === "not_applicable" ? (
                  <Badge variant="secondary">Not applicable</Badge>
                ) : (
                  <Badge variant="secondary">Assessment incomplete</Badge>
                )}
              </div>
            </div>
            {fw.status === "assessed" ? (
              <div className="text-muted-foreground grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-4">
                <span>Evidence {fw.evidenceCompletenessPct}%</span>
                <span>
                  {fw.openGapsCount} open gap{fw.openGapsCount === 1 ? "" : "s"}
                </span>
                <span>
                  {fw.mappedControlCount} control{fw.mappedControlCount === 1 ? "" : "s"} mapped
                </span>
                <span>{fw.nextAction}</span>
              </div>
            ) : (
              <p className="text-muted-foreground text-xs">{fw.mainBlocker}</p>
            )}
            {fw.mainBlocker && fw.status === "assessed" ? (
              <p className="text-muted-foreground text-xs">
                <span className="font-medium">Main blocker:</span> {fw.mainBlocker}
              </p>
            ) : null}
            {fw.status !== "not_applicable" ? (
              <Link
                href={`/framework/${fw.code}`}
                className="text-primary self-start text-xs underline underline-offset-4"
              >
                View readiness →
              </Link>
            ) : null}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// §6 Business Unit comparison
// ---------------------------------------------------------------------------

function assuranceStatusBadge(status: AssuranceStatus) {
  const map: Record<AssuranceStatus, { label: string; variant: "destructive" | "warning" | "success" | "secondary" }> = {
    exception: { label: "Exception", variant: "destructive" },
    attention: { label: "Attention", variant: "warning" },
    satisfactory: { label: "Satisfactory", variant: "success" },
    not_assessed: { label: "Not assessed", variant: "secondary" },
  };
  const { label, variant } = map[status];
  return <Badge variant={variant}>{label}</Badge>;
}

export function BusinessUnitTable({
  rows,
  fy,
}: {
  rows: BusinessUnitComparisonRow[];
  fy: string;
}) {
  const mostAttention = rows
    .filter((r) => !r.isGroupTotal)
    .reduce<BusinessUnitComparisonRow | null>((worst, r) => {
      const score = (x: BusinessUnitComparisonRow) =>
        (x.criticalMajorFindings ?? 0) * 10 + (x.overdueCapa ?? 0) * 3 + (x.fatalities ?? 0) * 100;
      if (!worst) return r;
      return score(r) > score(worst) ? r : worst;
    }, null);

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Business Unit</TableHead>
            <TableHead className="text-right">Incidents</TableHead>
            <TableHead className="text-right">Fatalities</TableHead>
            <TableHead className="text-right">LTI</TableHead>
            <TableHead className="text-right">High-potential</TableHead>
            <TableHead className="text-right">Lost days</TableHead>
            <TableHead className="text-right">Hospital referrals</TableHead>
            <TableHead className="text-right">OSH-reportable</TableHead>
            <TableHead className="text-right">Open investigations</TableHead>
            <TableHead className="text-right">Open CAPA</TableHead>
            <TableHead className="text-right">Overdue CAPA</TableHead>
            <TableHead className="text-right">Crit/Major findings</TableHead>
            <TableHead className="text-right">Data completeness</TableHead>
            <TableHead>Assurance</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.businessUnitId ?? "group"} className={r.isGroupTotal ? "bg-muted/40 font-medium" : ""}>
              <TableCell>
                <Link
                  href={`/dashboard?bu=${r.businessUnitId ?? GROUP_SCOPE_PARAM}&fy=${fy}`}
                  className="underline-offset-4 hover:underline"
                >
                  {r.businessUnitName}
                  {mostAttention && r.businessUnitId === mostAttention.businessUnitId ? (
                    <Badge variant="warning" className="ml-2">
                      Attention
                    </Badge>
                  ) : null}
                </Link>
              </TableCell>
              <TableCell className="text-right">{r.totalIncidents ?? "—"}</TableCell>
              <TableCell className="text-right">{r.fatalities ?? "—"}</TableCell>
              <TableCell className="text-right">{r.lti ?? "—"}</TableCell>
              <TableCell className="text-right">{r.highPotential ?? "—"}</TableCell>
              <TableCell className="text-right">{r.lostDays ?? "—"}</TableCell>
              <TableCell className="text-right">{r.hospitalReferrals ?? "—"}</TableCell>
              <TableCell className="text-right">{r.oshReportable ?? "—"}</TableCell>
              <TableCell className="text-right">{r.openInvestigations ?? "—"}</TableCell>
              <TableCell className="text-right">{r.openCapa ?? "—"}</TableCell>
              <TableCell className="text-right">{r.overdueCapa ?? "—"}</TableCell>
              <TableCell className="text-right">{r.criticalMajorFindings ?? "—"}</TableCell>
              <TableCell className="text-right">
                {r.dataCompletenessPct != null ? `${r.dataCompletenessPct.toFixed(0)}%` : "—"}
              </TableCell>
              <TableCell>{assuranceStatusBadge(r.assuranceStatus)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// §7 Assurance heatmap
// ---------------------------------------------------------------------------

export function AssuranceHeatmapPanel({ rows }: { rows: HeatmapRow[] }) {
  if (rows.length === 0) {
    return <p className="text-muted-foreground text-sm">No Business Units in scope.</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-separate border-spacing-1 text-xs">
        <thead>
          <tr>
            <th className="text-left font-medium">Business Unit</th>
            {ASSURANCE_AREAS.map((a) => (
              <th key={a.code} className="text-muted-foreground min-w-[64px] px-1 py-1 text-center font-medium">
                {a.label.split(" ")[0]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.businessUnitId}>
              <td className="pr-2 font-medium whitespace-nowrap">{row.businessUnitName}</td>
              {row.cells.map((cell) => (
                <td key={cell.areaCode} className="p-0.5">
                  <div
                    title={`${ASSURANCE_AREAS.find((a) => a.code === cell.areaCode)?.label} — ${heatmapRagLabel(cell.rag)}`}
                    className={`flex h-9 items-center justify-center rounded ${heatmapRagClasses(cell.rag)}`}
                  >
                    {cell.assessedControlCount > 0 ? cell.assessedControlCount : ""}
                  </div>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="text-muted-foreground mt-3 flex flex-wrap gap-4 text-xs">
        <span className="flex items-center gap-1">
          <span className="bg-destructive/60 inline-block size-3 rounded" /> Significant exception
        </span>
        <span className="flex items-center gap-1">
          <span className="bg-warning/60 inline-block size-3 rounded" /> Management attention
        </span>
        <span className="flex items-center gap-1">
          <span className="bg-success/60 inline-block size-3 rounded" /> Satisfactory
        </span>
        <span className="flex items-center gap-1">
          <span className="bg-muted inline-block size-3 rounded" /> Not assessed
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// §10 Safety performance
// ---------------------------------------------------------------------------

const SAFETY_LABELS: Record<string, string> = {
  FATALITIES: "Fatalities",
  LTI: "Lost-time injuries",
  LTIFR: "LTIFR",
  SEVERITY_RATE: "Severity rate",
  RECORDABLE_INJURIES: "Recordables",
  TRIR: "TRIR",
  HIGH_POTENTIAL: "High-potential incidents",
  NEAR_MISSES: "Near misses",
  UNSAFE_CONDITIONS: "Unsafe conditions",
  LOST_WORKDAYS: "Lost days",
  RESTRICTED_DUTY_DAYS: "Restricted-duty days",
  INCIDENT_COST: "Incident cost",
  GUEST_INC_PER_1000_RN: "Guest incidents / 1,000 room nights",
};

export function SafetyPerformancePanel({ data }: { data: SafetyPerformanceData }) {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      {data.tiles.map(({ kpiCode, result }) => (
        <Card key={kpiCode}>
          <CardContent className="flex flex-col gap-1 p-3">
            <p className="text-muted-foreground text-xs font-medium">
              {SAFETY_LABELS[kpiCode] ?? kpiCode}
            </p>
            <p className="text-xl font-semibold">
              {result
                ? result.dataQualityStatus === "incomplete" && result.currentValue == null
                  ? "Cannot calculate — denominator unavailable"
                  : formatKpiValue(result.currentValue, result.unit)
                : "Not assessed"}
            </p>
            <span className="text-muted-foreground text-[11px]">
              {result ? (formatDelta(result.currentValue, result.comparisonValue) ?? "—") : "—"}
            </span>
          </CardContent>
        </Card>
      ))}
      <Card>
        <CardContent className="flex flex-col gap-1 p-3">
          <p className="text-muted-foreground text-xs font-medium">Climate/weather-related events</p>
          <p className="text-xl font-semibold">{data.climateEventsCurrent}</p>
          <span className="text-muted-foreground text-[11px]">
            {data.climateEventsComparison} in comparison FY
          </span>
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// §13 Data quality
// ---------------------------------------------------------------------------

export function DataQualityPanel({ rows }: { rows: DataQualityRow[] }) {
  const withIssues = rows.filter((r) => r.count > 0);
  if (withIssues.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        No data-quality gaps detected for this scope/period.
      </p>
    );
  }
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {withIssues.map((row) => (
        <div key={row.label} className="flex items-center justify-between gap-3 rounded-md border p-2 text-sm">
          <span>{row.label}</span>
          <div className="flex items-center gap-2">
            {row.sampleIncidentIds.length > 0 ? (
              <div className="flex gap-1">
                {row.sampleIncidentIds.slice(0, 3).map((id) => (
                  <Link
                    key={id}
                    href={`/incidents/${id}`}
                    className="text-primary text-xs underline underline-offset-4"
                  >
                    view
                  </Link>
                ))}
              </div>
            ) : null}
            <Badge variant={row.count > 5 ? "destructive" : "warning"}>{row.count}</Badge>
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// §15 Executive narrative
// ---------------------------------------------------------------------------

export function NarrativePanel({ narrative }: { narrative: ExecutiveNarrative }) {
  return (
    <div className="flex flex-col gap-3 text-sm">
      <p>{narrative.managementSummary}</p>
      <p>{narrative.keyChange}</p>
      <p>{narrative.mainExposure}</p>
      <p>{narrative.businessUnitRequiringAttention}</p>
      <p>{narrative.assuranceBlockers}</p>
      <div>
        <p className="font-medium">Management attention is required on:</p>
        <ol className="mt-1 list-inside list-decimal">
          {narrative.requiredDecisions.map((d, i) => (
            <li key={i}>{d}</li>
          ))}
        </ol>
      </div>
    </div>
  );
}

export { Card, CardContent, CardHeader, CardTitle };

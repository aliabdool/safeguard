import type { KpiTileResult } from "@/server/kpi/calculate";

import { KpiTile } from "./kpi-tile";

/** A plain stat card for figures that aren't in the KPIDefinitions catalogue (major cases, YoY
 * change) — deliberately not a KpiTile (no RAG status/"View calculation" link applies to these,
 * they're derived directly from the same Incidents records the tiles above are computed from). */
function StatCard({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail?: string;
}) {
  return (
    <div className="bg-card flex h-full flex-col gap-2.5 rounded-lg border p-4 shadow-sm">
      <span className="text-muted-foreground text-[11.5px] leading-tight font-medium">
        {label}
      </span>
      <p className="font-display text-[26px] leading-none font-bold">{value}</p>
      {detail ? <p className="text-muted-foreground text-xs">{detail}</p> : null}
    </div>
  );
}

/**
 * KPI summary strip for the Safety Performance Analytics page (see chat §K): every registered KPI
 * tile plus two derived stats (Major cases, YoY change) that aren't part of the KPIDefinitions
 * catalogue but are still real, live-computed figures from the same Incidents records.
 */
export function KpiSummaryStrip({
  tiles,
  majorCurrent,
  majorComparison,
  yoyChangePct,
}: {
  tiles: Array<KpiTileResult | null>;
  majorCurrent: number;
  majorComparison: number;
  yoyChangePct: number | null;
}) {
  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
      <StatCard
        label="Major cases"
        value={String(majorCurrent)}
        detail={`vs ${majorComparison} comparison FY`}
      />
      <StatCard
        label="Total incidents — YoY change"
        value={
          yoyChangePct == null
            ? "—"
            : `${yoyChangePct > 0 ? "+" : ""}${yoyChangePct.toFixed(1)}%`
        }
        detail={yoyChangePct == null ? "No comparison-period incidents" : undefined}
      />
      {tiles.map((kpi) => (kpi ? <KpiTile key={kpi.kpiCode} kpi={kpi} /> : null))}
    </div>
  );
}

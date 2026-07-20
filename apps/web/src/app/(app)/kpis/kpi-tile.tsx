import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import type { KpiTileResult } from "@/server/kpi/calculate";
import { cn } from "@/lib/utils";

const RAG_VARIANT: Record<string, "success" | "warning" | "destructive" | "secondary"> = {
  green: "success",
  amber: "warning",
  red: "destructive",
  unknown: "secondary",
};

const RAG_BORDER: Record<string, string> = {
  green: "border-t-sev1",
  amber: "border-t-sun",
  red: "border-t-sev4",
  unknown: "border-t-border",
};

export function KpiTile({ kpi }: { kpi: KpiTileResult }) {
  return (
    <Link
      href={`/kpis/${kpi.kpiCode}`}
      className={cn(
        "bg-card flex h-full flex-col gap-2.5 rounded-lg border border-t-4 p-4 shadow-sm transition-shadow hover:shadow-md",
        RAG_BORDER[kpi.ragStatus],
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-muted-foreground text-[11.5px] leading-tight font-medium">
          {kpi.name}
        </span>
        <Badge variant={RAG_VARIANT[kpi.ragStatus]} className="shrink-0">
          {kpi.ragStatus}
        </Badge>
      </div>
      <p className="font-display text-[26px] leading-none font-bold">
        {kpi.currentValue != null ? kpi.currentValue.toFixed(kpi.unit === "%" ? 1 : 0) : "—"}
        <span className="text-muted-foreground ml-1 text-sm font-normal">{kpi.unit}</span>
      </p>
      <p className="text-muted-foreground text-xs">
        {kpi.fyLabel}
        {kpi.isYtdClipped ? " (YTD)" : ""} vs{" "}
        {kpi.comparisonValue != null ? kpi.comparisonValue.toFixed(1) : "—"}
        {kpi.variancePct != null
          ? ` (${kpi.variancePct > 0 ? "+" : ""}${kpi.variancePct.toFixed(1)}%)`
          : ""}
      </p>
      {kpi.dataQualityStatus !== "ok" ? (
        <p className="text-warning-foreground text-xs">
          Data quality: {kpi.dataQualityStatus}
        </p>
      ) : null}
    </Link>
  );
}

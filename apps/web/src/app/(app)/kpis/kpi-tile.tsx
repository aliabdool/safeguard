import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { KpiTileResult } from "@/server/kpi/calculate";

const RAG_VARIANT: Record<string, "success" | "warning" | "destructive" | "secondary"> = {
  green: "success",
  amber: "warning",
  red: "destructive",
  unknown: "secondary",
};

export function KpiTile({ kpi }: { kpi: KpiTileResult }) {
  return (
    <Link href={`/kpis/${kpi.kpiCode}`}>
      <Card className="hover:bg-accent/50 h-full">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium">{kpi.name}</CardTitle>
            <Badge variant={RAG_VARIANT[kpi.ragStatus]}>{kpi.ragStatus}</Badge>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-2xl font-semibold">
            {kpi.currentValue != null
              ? kpi.currentValue.toFixed(kpi.unit === "%" ? 1 : 0)
              : "—"}
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
            <p className="text-warning-foreground mt-1 text-xs">
              Data quality: {kpi.dataQualityStatus}
            </p>
          ) : null}
        </CardContent>
      </Card>
    </Link>
  );
}

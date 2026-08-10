import { Badge } from "@/components/ui/badge";
import type { RagStatus } from "@/server/kpi/rag";
import type { HeatmapRag } from "@/server/dashboard/assurance-areas";

/**
 * The dashboard's one and only RAG→colour mapping (see chat: "red only for genuine exceptions,
 * amber for management attention, green only for verified satisfactory status") — every RAG-ish
 * badge on this page goes through this so red/amber/green never drift in meaning between sections.
 */
export function RagBadge({ status, label }: { status: RagStatus; label?: string }) {
  const text = label ?? { red: "Red", amber: "Amber", green: "Green", unknown: "Not assessed" }[status];
  const variant =
    status === "red"
      ? "destructive"
      : status === "amber"
        ? "warning"
        : status === "green"
          ? "success"
          : "secondary";
  return <Badge variant={variant}>{text}</Badge>;
}

export function heatmapRagClasses(rag: HeatmapRag): string {
  switch (rag) {
    case "red":
      return "bg-destructive/15 text-destructive";
    case "amber":
      return "bg-warning/20 text-warning-foreground";
    case "green":
      return "bg-success/15 text-success";
    case "grey":
      return "bg-muted text-muted-foreground";
  }
}

export function heatmapRagLabel(rag: HeatmapRag): string {
  switch (rag) {
    case "red":
      return "Significant exception";
    case "amber":
      return "Management attention";
    case "green":
      return "Satisfactory";
    case "grey":
      return "Not assessed";
  }
}

export function formatKpiValue(value: number | null, unit: string): string {
  if (value == null) return "Not assessed";
  if (unit === "%") return `${value.toFixed(0)}%`;
  if (unit === "count") return value.toFixed(0);
  if (unit === "MUR" || unit === "currency") return `MUR ${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  return value.toFixed(2);
}

export function formatDelta(current: number | null, comparison: number | null): string | null {
  if (current == null || comparison == null) return null;
  const delta = current - comparison;
  if (delta === 0) return "No change";
  const sign = delta > 0 ? "+" : "";
  return `${sign}${delta.toFixed(1)} vs comparison FY`;
}

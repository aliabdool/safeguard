import { ArrowDown, ArrowRight, ArrowUp } from "lucide-react";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { DepartmentAnalysisRow } from "@/server/dashboard/analytics-pure";

function TrendIcon({ trend }: { trend: DepartmentAnalysisRow["trend"] }) {
  if (trend === "up") return <ArrowUp className="text-destructive inline size-3.5" />;
  if (trend === "down") return <ArrowDown className="text-success inline size-3.5" />;
  return <ArrowRight className="text-muted-foreground inline size-3.5" />;
}

function formatPct(value: number | null): string {
  return value == null ? "—" : `${value.toFixed(1)}%`;
}

function formatDelta(value: number | null): string {
  if (value == null) return "n/a (no comparison-period incidents)";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(0)}%`;
}

/**
 * Full department breakdown table (see chat §K) — every row is a department, including ones with
 * zero incidents this period (an explicit fact, not an omission). `limit` lets the caller render
 * only the Top 5 alongside the full table without a second data fetch.
 */
export function DepartmentAnalysisTable({
  rows,
  limit,
}: {
  rows: DepartmentAnalysisRow[];
  limit?: number;
}) {
  const visible = limit ? rows.slice(0, limit) : rows;

  if (visible.length === 0) {
    return <p className="text-muted-foreground text-sm">No departments to display.</p>;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Department</TableHead>
          <TableHead className="text-right">Total</TableHead>
          <TableHead className="text-right">Major</TableHead>
          <TableHead className="text-right">Hospital</TableHead>
          <TableHead className="text-right">Reportable</TableHead>
          <TableHead className="text-right">Lost days</TableHead>
          <TableHead className="text-right">% share</TableHead>
          <TableHead className="text-right">Delta</TableHead>
          <TableHead className="text-center">Trend</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {visible.map((row) => (
          <TableRow key={row.departmentId}>
            <TableCell className="font-medium">{row.departmentName}</TableCell>
            <TableCell className="text-right">{row.total}</TableCell>
            <TableCell className="text-right">{row.major}</TableCell>
            <TableCell className="text-right">{row.hospitalReferrals}</TableCell>
            <TableCell className="text-right">{row.oshReportable}</TableCell>
            <TableCell className="text-right">{row.lostDays}</TableCell>
            <TableCell className="text-right">{formatPct(row.sharePct)}</TableCell>
            <TableCell className="text-muted-foreground text-right text-xs">
              {formatDelta(row.deltaPct)}
            </TableCell>
            <TableCell className="text-center">
              <TrendIcon trend={row.trend} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

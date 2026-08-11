import { cn } from "@/lib/utils";
import type { DepartmentFyHeatmapRow } from "@/server/dashboard/analytics-pure";

/** Sequential (not RAG) intensity scale for a raw incident-count heatmap — deliberately distinct
 * from the dashboard's red/amber/green assurance heatmap (see rag.tsx): a high incident count
 * here is a volume fact to investigate, not automatically a "compliance failure" judgement. */
function intensityClasses(count: number, maxInRow: number): string {
  if (count === 0) return "bg-muted/40 text-muted-foreground";
  if (maxInRow === 0) return "bg-muted/40 text-muted-foreground";
  const ratio = count / maxInRow;
  if (ratio >= 0.75) return "bg-primary/70 text-primary-foreground";
  if (ratio >= 0.4) return "bg-primary/40 text-foreground";
  return "bg-primary/15 text-foreground";
}

/** Department x FY incident-count grid (see chat §K "department x FY heatmaps"). Every cell
 * renders — a genuine 0 looks visually distinct from a populated cell, but is never blank. */
export function DepartmentFyHeatmap({
  rows,
  fyLabels,
}: {
  rows: DepartmentFyHeatmapRow[];
  fyLabels: string[];
}) {
  if (rows.length === 0) {
    return <p className="text-muted-foreground text-sm">No departments to display.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[480px] border-separate border-spacing-1 text-xs">
        <thead>
          <tr>
            <th className="text-muted-foreground sticky left-0 bg-inherit p-1.5 text-left font-medium">
              Department
            </th>
            {fyLabels.map((fy) => (
              <th key={fy} className="text-muted-foreground p-1.5 text-center font-medium">
                {fy}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const maxInRow = Math.max(...fyLabels.map((fy) => row.countsByFy[fy] ?? 0), 0);
            return (
              <tr key={row.departmentId}>
                <td className="p-1.5 font-medium whitespace-nowrap">{row.departmentName}</td>
                {fyLabels.map((fy) => {
                  const count = row.countsByFy[fy] ?? 0;
                  return (
                    <td key={fy} className="p-0 text-center">
                      <div
                        className={cn(
                          "flex h-9 w-full min-w-11 items-center justify-center rounded font-semibold",
                          intensityClasses(count, maxInRow),
                        )}
                        title={`${row.departmentName} — ${fy}: ${count} incident${count === 1 ? "" : "s"}`}
                      >
                        {count}
                      </div>
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

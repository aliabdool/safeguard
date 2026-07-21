export interface HeatCell {
  label: string;
  count: number;
  severity: "red" | "amber" | "green";
}

/** Row 4 — property or department heatmap. */
export function Heatmap({ cells }: { cells: HeatCell[] }) {
  if (cells.length === 0) {
    return <div className="sg-empty">No breakdown available for this scope.</div>;
  }
  const bg = { red: "var(--sg-red-bg)", amber: "var(--sg-amber-bg)", green: "var(--sg-green-bg)" } as const;
  const fg = { red: "var(--sg-red)", amber: "var(--sg-amber)", green: "var(--sg-green)" } as const;
  return (
    <div className="sg-heatmap">
      {cells.map((c) => (
        <div className="sg-heat-cell" style={{ background: bg[c.severity] }} key={c.label}>
          <div className="name">{c.label}</div>
          <div className="count" style={{ color: fg[c.severity] }}>{c.count}</div>
        </div>
      ))}
    </div>
  );
}

export interface FrameworkGaugeData {
  code: string;
  label: string;
  /** Exact labeling rules from docs/2026-07-zoho-catalyst-access-and-dashboard-model.md §4 —
   * never "certification compliance" for anything but ISO 45001. */
  readinessLabel: string;
  valuePct: number | null;
  scored: boolean; // false for SASB/UNGC — "indirect alignment" / "alignment", not a scored %
}

/** Row 3 of every dashboard except the H&S Officer workbench — the framework readiness strip.
 * ISO 45001 = certification readiness, GRI 403 = disclosure readiness, Mauritius OSH = legal
 * readiness, IFRS S1 = financial materiality readiness, IFRS S2 = climate-related H&S risk
 * readiness (never ordinary incidents), SASB = indirect alignment only, UNGC/ILO-OSH = alignment. */
export function FrameworkStrip({ gauges }: { gauges: FrameworkGaugeData[] }) {
  return (
    <div className="sg-gauges">
      {gauges.map((g) => (
        <div className="sg-gauge" key={g.code}>
          <div className="sg-gauge-label">{g.label}</div>
          <div className="sg-gauge-sublabel">{g.readinessLabel}</div>
          {g.scored ? (
            <>
              <div className="sg-gauge-track">
                <div
                  className="sg-gauge-fill"
                  style={{
                    width: `${g.valuePct ?? 0}%`,
                    background: g.valuePct == null ? "var(--sg-unknown)" : g.valuePct >= 75 ? "var(--sg-green)" : g.valuePct >= 40 ? "var(--sg-amber)" : "var(--sg-red)",
                  }}
                />
              </div>
              <div className="sg-gauge-value">{g.valuePct == null ? "Not yet calculable" : `${Math.round(g.valuePct)}%`}</div>
            </>
          ) : (
            <div className="sg-gauge-value">Reference only — not scored</div>
          )}
        </div>
      ))}
    </div>
  );
}

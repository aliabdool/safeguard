import type { KpiTile } from "../lib/types";
import { RagBadge } from "./RagBadge";

function formatValue(tile: KpiTile): string {
  if (tile.currentValue == null) return "Not yet calculable";
  const rounded = Number.isInteger(tile.currentValue) ? tile.currentValue : Math.round(tile.currentValue * 10) / 10;
  return tile.unit === "%" ? `${rounded}%` : rounded.toLocaleString();
}

/** Row 2 of every dashboard — KPI cards. Never renders a fabricated 0: a null currentValue always
 * reads "Not yet calculable", distinct in style from a genuine calculated 0. */
export function KpiCards({ tiles, onDrillDown }: { tiles: KpiTile[]; onDrillDown?: (kpiCode: string) => void }) {
  if (tiles.length === 0) {
    return <div className="sg-empty">No KPI tiles available for this scope yet.</div>;
  }
  return (
    <div className="sg-cards">
      {tiles.map((tile) => (
        <div className="sg-card" key={tile.kpiCode}>
          <div className="sg-card-label">{tile.name}</div>
          <div className={`sg-card-value${tile.currentValue == null ? " not-calculable" : ""}`}>{formatValue(tile)}</div>
          {tile.comparisonValue != null && tile.variancePct != null && (
            <div className="sg-card-sub">
              {tile.variancePct > 0 ? "▲" : tile.variancePct < 0 ? "▼" : "—"} {Math.abs(tile.variancePct).toFixed(1)}% vs prior year
            </div>
          )}
          {tile.dataQualityStatus !== "ok" && (
            <div className="sg-card-sub" style={{ color: "var(--sg-amber)" }}>
              Data quality: {tile.dataQualityStatus}
            </div>
          )}
          <div className="sg-card-footer">
            <RagBadge status={tile.ragStatus} />
            {onDrillDown && (
              <button className="sg-link-btn" onClick={() => onDrillDown(tile.kpiCode)}>
                View calculation
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

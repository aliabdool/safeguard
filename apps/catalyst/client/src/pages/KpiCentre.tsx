import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useApi } from "../lib/useApi";
import type { KpiTile } from "../lib/types";
import { Row, Loading } from "../components/Row";
import { RagBadge } from "../components/RagBadge";

const KPI_CODES = [
  "TOTAL_INCIDENTS", "EMPLOYEE_INCIDENTS", "CONTRACTOR_INCIDENTS", "GUEST_INCIDENTS", "NEAR_MISSES",
  "UNSAFE_CONDITIONS", "TRAINEE_INCIDENTS", "HIGH_POTENTIAL", "HOSPITAL_REFERRALS", "REPORTABLE_OSH_CASES",
  "FATALITIES", "LTI", "MTC", "RECORDABLE_INJURIES", "LOST_WORKDAYS", "RESTRICTED_DUTY_DAYS",
  "INCIDENT_COST", "CAPA_ON_TIME", "CAPA_EFFECTIVENESS", "OPEN_CRIT_MAJOR_FINDINGS",
  "ISO45001_READINESS", "LEGAL_COMPLIANCE",
];

/** KPI Centre with "View calculation" — the full 22-KPI catalogue, each on-demand via GET
 * /kpi/:code (lazy-loaded, never called in a loop). */
export function KpiCentre() {
  const [params, setParams] = useSearchParams();
  const selected = params.get("code") ?? "FATALITIES";
  const { data, loading, error, offline } = useApi<KpiTile>("api-kpi", `/kpi/${selected}`);

  return (
    <div>
      <h1>KPI Centre</h1>
      <div className="sg-filters">
        <select value={selected} onChange={(e) => setParams({ code: e.target.value })}>
          {KPI_CODES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      {loading && <Loading />}
      {error && <div className="sg-alert critical">{error}</div>}
      {offline && <div className="sg-empty">Not connected — no KPI data to show.</div>}

      {data && (
        <Row title={data.name}>
          <div className="sg-card" style={{ maxWidth: 520 }}>
            <div className="sg-card-label">Current value ({data.fyLabel})</div>
            <div className={`sg-card-value${data.currentValue == null ? " not-calculable" : ""}`}>
              {data.currentValue == null ? "Not yet calculable" : `${data.currentValue}${data.unit === "%" ? "%" : ""}`}
            </div>
            <div className="sg-card-sub">
              Comparison (prior year): {data.comparisonValue == null ? "n/a" : data.comparisonValue}
              {data.variancePct != null && ` (${data.variancePct > 0 ? "+" : ""}${data.variancePct.toFixed(1)}%)`}
            </div>
            <div className="sg-card-sub">Target: {data.target ?? "not set"}</div>
            <div className="sg-card-sub">Data quality: {data.dataQualityStatus}</div>
            <div className="sg-card-sub">Source records included: {data.includedRecordIds.length}</div>
            <div className="sg-card-sub">Calculated through: {new Date(data.dataThroughDate).toLocaleDateString()}</div>
            <div className="sg-card-sub">Implemented: {data.isImplemented ? "Yes" : "No — not yet in the 22-KPI live registry"}</div>
            <div className="sg-card-footer"><RagBadge status={data.ragStatus} /></div>
          </div>
        </Row>
      )}
    </div>
  );
}

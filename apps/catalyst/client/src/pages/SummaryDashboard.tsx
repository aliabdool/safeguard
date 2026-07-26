import { useState } from "react";
import { useApi } from "../lib/useApi";
import { useAuth } from "../lib/auth";
import type { DashboardSummary } from "../lib/types";
import { Row, Loading, ErrorState } from "../components/Row";
import { AlertList } from "../components/AlertList";
import { KpiCards } from "../components/KpiCards";
import { FrameworkStrip } from "../components/FrameworkStrip";
import { Heatmap } from "../components/Heatmap";
import { DataTable } from "../components/DataTable";
import { buildFrameworkGauges } from "../lib/frameworkGauges";
import { useNavigate } from "react-router-dom";

/**
 * Shared shell for the Group H&S / Hotel GM / Board / Super Admin dashboards — all four read the
 * same GET /dashboard/summary batch endpoint (Improvement 1: one request, not one per tile), just
 * scoped differently. This is exactly the "group-summary"/"hotel-summary"/"board-summary" mapping
 * documented in docs/2026-07-zoho-catalyst-access-and-dashboard-model.md §3.
 */
export function SummaryDashboard({
  title,
  requirePropertySelector,
  hideEditing,
}: {
  title: string;
  requirePropertySelector: boolean;
  hideEditing?: boolean;
}) {
  const { me } = useAuth();
  const [propertyId, setPropertyId] = useState<string>(requirePropertySelector ? me?.propertyIds[0] ?? "" : "");
  const navigate = useNavigate();

  const path = propertyId ? `/dashboard/summary?propertyId=${propertyId}` : "/dashboard/summary";
  const { data, loading, error, offline } = useApi<DashboardSummary>("api-dashboard-summary", path);

  return (
    <div>
      <h1>{title}</h1>
      {requirePropertySelector && me && me.propertyIds.length > 1 && (
        <div className="sg-filters">
          <select value={propertyId} onChange={(e) => setPropertyId(e.target.value)}>
            {me.propertyIds.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>
      )}

      {loading && <Loading />}
      {error && <ErrorState message={error} />}
      {offline && <EmptyShell hideEditing={hideEditing} />}

      {data && (
        <>
          <Row title="Critical alerts">
            <AlertList
              alerts={data.boardAlerts.map((a) => ({ severity: a.severity, message: a.message }))}
            />
          </Row>

          <Row
            title="KPI cards"
            action={
              <button className="sg-link-btn" onClick={() => navigate("/kpis")}>
                Open KPI Centre →
              </button>
            }
          >
            <KpiCards tiles={data.kpiOverview.tiles} onDrillDown={(code) => navigate(`/kpis?code=${code}`)} />
            {data.kpiOverview.notYetCalculableCount > 0 && (
              <div className="sg-card-sub" style={{ marginTop: 8 }}>
                {data.kpiOverview.notYetCalculableCount} additional KPI(s) not yet calculable for this scope.
              </div>
            )}
          </Row>

          <Row title="Framework readiness">
            <FrameworkStrip gauges={buildFrameworkGauges(data.kpiOverview.tiles)} />
          </Row>

          <Row title="Property risk heatmap">
            <Heatmap
              cells={[
                { label: "Fatalities", count: data.safetyStatus.fatalities, severity: data.safetyStatus.fatalities > 0 ? "red" : "green" },
                { label: "Serious incidents", count: data.safetyStatus.seriousIncidents, severity: data.safetyStatus.seriousIncidents > 0 ? "amber" : "green" },
                { label: "Statutory reportable", count: data.safetyStatus.statutoryReportable, severity: data.safetyStatus.statutoryReportable > 0 ? "amber" : "green" },
                { label: "Critical gaps", count: data.criticalGaps.length, severity: data.criticalGaps.length > 0 ? "red" : "green" },
                { label: "Overdue CAPA", count: data.capaStatus.overdue, severity: data.capaStatus.overdue > 0 ? "amber" : "green" },
              ]}
            />
          </Row>

          <Row title="Actions requiring attention">
            <DataTable<DashboardSummary["criticalGaps"][number]>
              rowKey={(r) => r.id}
              emptyMessage="No open critical control gaps."
              columns={[
                { key: "reason", header: "Critical gap", render: (r) => r.reason },
                { key: "property", header: "Property", render: (r) => r.propertyId },
                { key: "identified", header: "Identified", render: (r) => new Date(r.identifiedAt).toLocaleDateString() },
                { key: "rag", header: "RAG", render: () => <span className="sg-badge red"><span className="dot" />Red</span> },
              ]}
              rows={data.criticalGaps}
            />
          </Row>

          <Row title="Data quality & assurance blockers">
            <div className="sg-cards">
              <div className="sg-card">
                <div className="sg-card-label">Evidence completeness</div>
                <div className="sg-card-value">{data.assuranceReadiness.evidenceCompletenessPct}%</div>
              </div>
              <div className="sg-card">
                <div className="sg-card-label">Open data-quality exceptions</div>
                <div className="sg-card-value">{data.assuranceReadiness.dataQualityExceptionCount}</div>
              </div>
              <div className="sg-card">
                <div className="sg-card-label">Open assurance blockers</div>
                <div className="sg-card-value">{data.assuranceReadiness.openAssuranceBlockers}</div>
              </div>
            </div>
          </Row>
        </>
      )}
    </div>
  );
}

function EmptyShell({ hideEditing }: { hideEditing?: boolean }) {
  return (
    <>
      <Row title="Critical alerts"><AlertList alerts={[]} /></Row>
      <Row title="KPI cards"><KpiCards tiles={[]} /></Row>
      <Row title="Framework readiness"><FrameworkStrip gauges={buildFrameworkGauges([])} /></Row>
      <Row title="Property risk heatmap"><Heatmap cells={[]} /></Row>
      {!hideEditing && <Row title="Actions requiring attention"><div className="sg-empty">Not connected.</div></Row>}
      <Row title="Data quality & assurance blockers"><div className="sg-empty">Not connected.</div></Row>
    </>
  );
}

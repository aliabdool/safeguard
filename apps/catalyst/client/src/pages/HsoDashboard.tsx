import { useNavigate } from "react-router-dom";
import { useApi } from "../lib/useApi";
import type { CapaRow, IncidentRow } from "../lib/types";
import { Row, Loading } from "../components/Row";
import { DataTable } from "../components/DataTable";

/** Daily workbench — work-queue shaped, not KPI-tile shaped, per the access/dashboard doc. No
 * framework readiness strip here by design. */
export function HsoDashboard() {
  const navigate = useNavigate();
  const incidents = useApi<IncidentRow[]>("api-incidents", "/incidents");
  const capas = useApi<CapaRow[]>("api-capa", "/capa");

  const awaitingInvestigation = (incidents.data ?? []).filter((i) => i.status === "reported");
  const investigating = (incidents.data ?? []).filter((i) => i.status === "investigating");
  const overdueCapa = (capas.data ?? []).filter((c) => c.status !== "closed" && c.status !== "verified" && new Date(c.dueDate) < new Date());
  const pendingVerification = (capas.data ?? []).filter((c) => c.status === "pending_verification");

  return (
    <div>
      <h1>H&S Officer Workbench</h1>

      {(incidents.loading || capas.loading) && <Loading />}

      <Row title="Incidents awaiting investigation">
        <DataTable<IncidentRow>
          rowKey={(r) => r.id}
          emptyMessage="Nothing awaiting investigation."
          rows={awaitingInvestigation}
          columns={[
            { key: "number", header: "Incident #", render: (r) => r.incidentNumber },
            { key: "type", header: "Type", render: (r) => r.incidentType },
            { key: "occurred", header: "Occurred", render: (r) => new Date(r.occurredAt).toLocaleDateString() },
            { key: "action", header: "", render: (r) => <button className="sg-link-btn" onClick={() => navigate(`/incidents/${r.id}`)}>Open →</button> },
          ]}
        />
      </Row>

      <Row title="Root-cause reviews in progress">
        <DataTable<IncidentRow>
          rowKey={(r) => r.id}
          emptyMessage="No investigations currently in progress."
          rows={investigating}
          columns={[
            { key: "number", header: "Incident #", render: (r) => r.incidentNumber },
            { key: "type", header: "Type", render: (r) => r.incidentType },
            { key: "action", header: "", render: (r) => <button className="sg-link-btn" onClick={() => navigate(`/incidents/${r.id}`)}>Open →</button> },
          ]}
        />
      </Row>

      <Row title="CAPA awaiting verification">
        <DataTable<CapaRow>
          rowKey={(r) => r.id}
          emptyMessage="No corrective actions awaiting verification."
          rows={pendingVerification}
          columns={[
            { key: "number", header: "CAPA #", render: (r) => r.capaNumber },
            { key: "title", header: "Title", render: (r) => r.title },
            { key: "due", header: "Due", render: (r) => r.dueDate },
            { key: "action", header: "", render: (r) => <button className="sg-link-btn" onClick={() => navigate(`/capa/${r.id}`)}>Open →</button> },
          ]}
        />
      </Row>

      <Row title="Overdue CAPA">
        <DataTable<CapaRow>
          rowKey={(r) => r.id}
          emptyMessage="No overdue corrective actions."
          rows={overdueCapa}
          columns={[
            { key: "number", header: "CAPA #", render: (r) => r.capaNumber },
            { key: "title", header: "Title", render: (r) => r.title },
            { key: "due", header: "Due", render: (r) => r.dueDate },
            { key: "status", header: "Status", render: (r) => r.status },
            { key: "action", header: "", render: (r) => <button className="sg-link-btn" onClick={() => navigate(`/capa/${r.id}`)}>Open →</button> },
          ]}
        />
      </Row>
    </div>
  );
}

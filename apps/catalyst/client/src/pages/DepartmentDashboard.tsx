import { useNavigate } from "react-router-dom";
import { useApi } from "../lib/useApi";
import { useAuth } from "../lib/auth";
import type { CapaRow, IncidentRow } from "../lib/types";
import { Row, Loading } from "../components/Row";
import { DataTable } from "../components/DataTable";

export function DepartmentDashboard() {
  const navigate = useNavigate();
  const { me } = useAuth();
  const myDepartments = new Set(Object.values(me?.departmentAccess ?? {}).flat());

  const incidents = useApi<IncidentRow[]>("api-incidents", "/incidents");
  const capas = useApi<CapaRow[]>("api-capa", "/capa");

  const deptIncidents = (incidents.data ?? []).filter((i) => myDepartments.size === 0 || myDepartments.has(i.departmentId));
  const deptCapa = (capas.data ?? []).filter((c) => myDepartments.size === 0 || (c.departmentId && myDepartments.has(c.departmentId)));
  const overdue = deptCapa.filter((c) => c.status !== "closed" && c.status !== "verified" && new Date(c.dueDate) < new Date());

  return (
    <div>
      <h1>Department Manager Dashboard</h1>
      {(incidents.loading || capas.loading) && <Loading />}

      <Row title="Department incidents">
        <DataTable<IncidentRow>
          rowKey={(r) => r.id}
          emptyMessage="No incidents recorded for your department."
          rows={deptIncidents}
          columns={[
            { key: "number", header: "Incident #", render: (r) => r.incidentNumber },
            { key: "type", header: "Type", render: (r) => r.incidentType },
            { key: "status", header: "Status", render: (r) => r.status },
            { key: "action", header: "", render: (r) => <button className="sg-link-btn" onClick={() => navigate(`/incidents/${r.id}`)}>Open →</button> },
          ]}
        />
      </Row>

      <Row title="Assigned CAPA">
        <DataTable<CapaRow>
          rowKey={(r) => r.id}
          emptyMessage="No corrective actions assigned to your department."
          rows={deptCapa}
          columns={[
            { key: "number", header: "CAPA #", render: (r) => r.capaNumber },
            { key: "title", header: "Title", render: (r) => r.title },
            { key: "owner", header: "Owner", render: (r) => r.ownerId },
            { key: "due", header: "Due date", render: (r) => r.dueDate },
            { key: "status", header: "Status", render: (r) => r.status },
            { key: "action", header: "", render: (r) => <button className="sg-link-btn" onClick={() => navigate(`/capa/${r.id}`)}>Open →</button> },
          ]}
        />
      </Row>

      <Row title="Overdue actions">
        <DataTable<CapaRow>
          rowKey={(r) => r.id}
          emptyMessage="Nothing overdue."
          rows={overdue}
          columns={[
            { key: "number", header: "CAPA #", render: (r) => r.capaNumber },
            { key: "due", header: "Due date", render: (r) => r.dueDate },
          ]}
        />
      </Row>
    </div>
  );
}

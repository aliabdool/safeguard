import { useNavigate } from "react-router-dom";
import { useApi } from "../lib/useApi";
import { useAuth } from "../lib/auth";
import type { IncidentRow } from "../lib/types";
import { Row, Loading } from "../components/Row";
import { DataTable } from "../components/DataTable";
import { MedicalLock } from "../components/MedicalLock";

/** Restricted medical follow-up dashboard. Every incident listed here is a candidate for
 * follow-up (hospital referral); clicking through to an incident's medical notes still requires
 * the explicit view_medical_notes grant — this dashboard does not bypass that, even though the
 * user is on the Nurse/Medical dashboard by role. */
export function MedicalDashboard() {
  const navigate = useNavigate();
  const { me } = useAuth();
  const canView = me?.medicalPermissions.includes("view") ?? false;
  const incidents = useApi<IncidentRow[]>("api-incidents", "/incidents");
  const referrals = (incidents.data ?? []).filter((i) => i.hospitalReferral);

  return (
    <div>
      <h1>Nurse / Medical Dashboard</h1>
      {!canView && <MedicalLock action="view" />}
      {canView && (
        <>
          {incidents.loading && <Loading />}
          <Row title="Cases requiring follow-up (hospital referral)">
            <DataTable<IncidentRow>
              rowKey={(r) => r.id}
              emptyMessage="No hospital-referral cases outstanding."
              rows={referrals}
              columns={[
                { key: "number", header: "Incident #", render: (r) => r.incidentNumber },
                { key: "type", header: "Person type", render: (r) => r.personEventType },
                { key: "occurred", header: "Occurred", render: (r) => new Date(r.occurredAt).toLocaleDateString() },
                { key: "action", header: "", render: (r) => <button className="sg-link-btn" onClick={() => navigate(`/incidents/${r.id}`)}>Open medical notes →</button> },
              ]}
            />
          </Row>
          <Row title="Medical access audit log">
            <div className="sg-empty">Every access to this dashboard's underlying records is audit-logged — see Reports &amp; Exports for the full AuditTrail export.</div>
          </Row>
        </>
      )}
    </div>
  );
}

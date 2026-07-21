import { useState } from "react";
import { useParams } from "react-router-dom";
import { useApi } from "../lib/useApi";
import { useAuth } from "../lib/auth";
import { api, ApiError } from "../lib/api";
import type { IncidentRow } from "../lib/types";
import { Row, Loading } from "../components/Row";
import { MedicalLock } from "../components/MedicalLock";

interface MedicalNote {
  id: string;
  incidentId: string;
  clinicalNotes: string;
  createdBy: string;
  createdAt: string;
}

export function IncidentDetail() {
  const { id } = useParams();
  const { me } = useAuth();
  const { data: incident, loading, error } = useApi<IncidentRow>("api-incidents", id ? `/incidents/${id}` : null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [notes, setNotes] = useState<MedicalNote[] | null>(null);
  const [medicalError, setMedicalError] = useState<string | null>(null);

  async function startInvestigation() {
    if (!id) return;
    setBusy(true);
    try {
      await api.post("api-incidents", `/incidents/${id}/investigation`, {});
      setMsg("Investigation started.");
    } catch (ex) {
      setMsg(ex instanceof Error ? ex.message : "Failed.");
    } finally {
      setBusy(false);
    }
  }

  async function loadMedicalNotes() {
    if (!id) return;
    try {
      const result = await api.get<MedicalNote[]>("api-incidents", `/incidents/${id}/medical`);
      setNotes(result);
      setMedicalError(null);
    } catch (ex) {
      if (ex instanceof ApiError && ex.status === 403) {
        setMedicalError("forbidden");
      } else {
        setMedicalError(ex instanceof Error ? ex.message : "Failed to load medical notes.");
      }
    }
  }

  if (loading) return <Loading />;
  if (error) return <div className="sg-alert critical">{error}</div>;
  if (!incident) return <div className="sg-empty">Incident not found.</div>;

  return (
    <div>
      <h1>Incident {incident.incidentNumber}</h1>
      <Row title="Summary">
        <div className="sg-table-wrap">
          <table className="sg-table">
            <tbody>
              <tr><td>Property</td><td>{incident.propertyId}</td></tr>
              <tr><td>Department</td><td>{incident.departmentId}</td></tr>
              <tr><td>Occurred</td><td>{new Date(incident.occurredAt).toLocaleString()}</td></tr>
              <tr><td>Person/event type</td><td>{incident.personEventType}</td></tr>
              <tr><td>Incident type</td><td>{incident.incidentType}</td></tr>
              <tr><td>Outcome</td><td>{incident.outcome}</td></tr>
              <tr><td>Hospital referral</td><td>{incident.hospitalReferral ? "Yes" : "No"}</td></tr>
              <tr><td>Status</td><td>{incident.status}</td></tr>
            </tbody>
          </table>
        </div>
      </Row>

      <Row title="Investigation">
        {incident.status === "reported" ? (
          <button className="sg-btn" onClick={startInvestigation} disabled={busy}>Start investigation</button>
        ) : (
          <div className="sg-empty">Status: {incident.status}</div>
        )}
        {msg && <div className="sg-card-sub" style={{ marginTop: 8 }}>{msg}</div>}
      </Row>

      <Row title="Medical notes" action={!notes && <button className="sg-link-btn" onClick={loadMedicalNotes}>Load →</button>}>
        {medicalError === "forbidden" && <MedicalLock action="view" />}
        {medicalError && medicalError !== "forbidden" && <div className="sg-alert critical">{medicalError}</div>}
        {notes && notes.length === 0 && <div className="sg-empty">No medical notes recorded.</div>}
        {notes && notes.length > 0 && (
          <div className="sg-table-wrap">
            <table className="sg-table">
              <thead><tr><th>Note</th><th>By</th><th>At</th></tr></thead>
              <tbody>
                {notes.map((n) => (
                  <tr key={n.id}><td>{n.clinicalNotes}</td><td>{n.createdBy}</td><td>{new Date(n.createdAt).toLocaleString()}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {!me?.medicalPermissions.length && !notes && !medicalError && (
          <div className="sg-card-sub">You have no explicit medical permission grant — loading will likely be denied and logged.</div>
        )}
      </Row>
    </div>
  );
}

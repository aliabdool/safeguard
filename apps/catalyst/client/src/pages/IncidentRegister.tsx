import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useApi } from "../lib/useApi";
import { api } from "../lib/api";
import type { IncidentRow } from "../lib/types";
import { Row, Loading } from "../components/Row";
import { DataTable } from "../components/DataTable";

const PERSON_EVENT_TYPES = ["employee", "trainee", "guest", "contractor", "near_miss", "unsafe_condition"];

export function IncidentRegister() {
  const navigate = useNavigate();
  const { data, loading, error, offline } = useApi<IncidentRow[]>("api-incidents", "/incidents");
  const [showForm, setShowForm] = useState(false);

  return (
    <div>
      <h1>Incident Register</h1>
      <div className="sg-filters">
        <button className="sg-btn" onClick={() => setShowForm((v) => !v)}>{showForm ? "Cancel" : "+ Report incident"}</button>
      </div>

      {showForm && <NewIncidentForm onDone={() => setShowForm(false)} />}
      {loading && <Loading />}
      {error && <div className="sg-alert critical">{error}</div>}
      {offline && <div className="sg-empty">Not connected — no incidents to show.</div>}

      {data && (
        <Row title={`${data.length} incident(s)`}>
          <DataTable<IncidentRow>
            rowKey={(r) => r.id}
            rows={data}
            emptyMessage="No incidents recorded for your scope yet."
            columns={[
              { key: "number", header: "Incident #", render: (r) => r.incidentNumber },
              { key: "occurred", header: "Occurred", render: (r) => new Date(r.occurredAt).toLocaleDateString() },
              { key: "type", header: "Person/event type", render: (r) => r.personEventType },
              { key: "outcome", header: "Outcome", render: (r) => r.outcome },
              { key: "hospital", header: "Hospital referral", render: (r) => (r.hospitalReferral ? "Yes" : "No") },
              { key: "status", header: "Status", render: (r) => r.status },
              { key: "action", header: "", render: (r) => <button className="sg-link-btn" onClick={() => navigate(`/incidents/${r.id}`)}>Open →</button> },
            ]}
          />
        </Row>
      )}
    </div>
  );
}

function NewIncidentForm({ onDone }: { onDone: () => void }) {
  const [form, setForm] = useState({
    incidentNumber: "", propertyId: "", departmentId: "", occurredAt: "", personEventType: "employee", incidentType: "", outcome: "first_aid", hospitalReferral: false,
  });
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setErr(null);
    try {
      await api.post("api-incidents", "/incidents", { ...form, occurredAt: new Date(form.occurredAt).toISOString() });
      onDone();
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "Failed to create incident.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="sg-form-grid" style={{ marginBottom: 20 }} onSubmit={submit}>
      <label>Incident number<input required value={form.incidentNumber} onChange={(e) => setForm({ ...form, incidentNumber: e.target.value })} /></label>
      <label>Property ID<input required value={form.propertyId} onChange={(e) => setForm({ ...form, propertyId: e.target.value })} /></label>
      <label>Department ID<input required value={form.departmentId} onChange={(e) => setForm({ ...form, departmentId: e.target.value })} /></label>
      <label>Occurred at<input required type="datetime-local" value={form.occurredAt} onChange={(e) => setForm({ ...form, occurredAt: e.target.value })} /></label>
      <label>Person/event type
        <select value={form.personEventType} onChange={(e) => setForm({ ...form, personEventType: e.target.value })}>
          {PERSON_EVENT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
      </label>
      <label>Incident type<input required value={form.incidentType} onChange={(e) => setForm({ ...form, incidentType: e.target.value })} /></label>
      <label>Outcome
        <select value={form.outcome} onChange={(e) => setForm({ ...form, outcome: e.target.value })}>
          {["no_injury", "first_aid", "medical_treatment", "lost_time_injury", "hospitalisation", "fatality"].map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      </label>
      <label>Hospital referral
        <select value={String(form.hospitalReferral)} onChange={(e) => setForm({ ...form, hospitalReferral: e.target.value === "true" })}>
          <option value="false">No</option>
          <option value="true">Yes</option>
        </select>
      </label>
      <div className="full">
        <button className="sg-btn" type="submit" disabled={submitting}>{submitting ? "Saving…" : "Create incident"}</button>
        {err && <span className="sg-alert critical" style={{ marginLeft: 10 }}>{err}</span>}
      </div>
    </form>
  );
}

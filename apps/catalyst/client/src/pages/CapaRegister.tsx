import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useApi } from "../lib/useApi";
import { api } from "../lib/api";
import type { CapaRow } from "../lib/types";
import { Row, Loading } from "../components/Row";
import { DataTable } from "../components/DataTable";

export function CapaRegister() {
  const navigate = useNavigate();
  const { data, loading, error, offline } = useApi<CapaRow[]>("api-capa", "/capa");
  const [showForm, setShowForm] = useState(false);

  return (
    <div>
      <h1>CAPA Register</h1>
      <div className="sg-filters">
        <button className="sg-btn" onClick={() => setShowForm((v) => !v)}>{showForm ? "Cancel" : "+ New CAPA"}</button>
      </div>
      {showForm && <NewCapaForm onDone={() => setShowForm(false)} />}
      {loading && <Loading />}
      {error && <div className="sg-alert critical">{error}</div>}
      {offline && <div className="sg-empty">Not connected — no CAPA to show.</div>}
      {data && (
        <Row title={`${data.length} CAPA(s)`}>
          <DataTable<CapaRow>
            rowKey={(r) => r.id}
            rows={data}
            emptyMessage="No corrective actions recorded for your scope yet."
            columns={[
              { key: "number", header: "CAPA #", render: (r) => r.capaNumber },
              { key: "title", header: "Title", render: (r) => r.title },
              { key: "owner", header: "Owner", render: (r) => r.ownerId },
              { key: "verifier", header: "Verifier", render: (r) => r.verifierId },
              { key: "due", header: "Due", render: (r) => r.dueDate },
              { key: "status", header: "Status", render: (r) => r.status },
              { key: "action", header: "", render: (r) => <button className="sg-link-btn" onClick={() => navigate(`/capa/${r.id}`)}>Open →</button> },
            ]}
          />
        </Row>
      )}
    </div>
  );
}

function NewCapaForm({ onDone }: { onDone: () => void }) {
  const [form, setForm] = useState({
    capaNumber: "", propertyId: "", departmentId: "", title: "", description: "", sourceType: "incident", sourceId: "", ownerId: "", verifierId: "", dueDate: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (form.ownerId && form.ownerId === form.verifierId) {
      setErr("CAPA owner and verifier must be different people.");
      return;
    }
    setSubmitting(true);
    setErr(null);
    try {
      await api.post("api-capa", "/capa", { ...form, departmentId: form.departmentId || null, sourceId: form.sourceId || null });
      onDone();
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "Failed to create CAPA.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="sg-form-grid" style={{ marginBottom: 20 }} onSubmit={submit}>
      <label>CAPA number<input required value={form.capaNumber} onChange={(e) => setForm({ ...form, capaNumber: e.target.value })} /></label>
      <label>Property ID<input required value={form.propertyId} onChange={(e) => setForm({ ...form, propertyId: e.target.value })} /></label>
      <label>Department ID (optional)<input value={form.departmentId} onChange={(e) => setForm({ ...form, departmentId: e.target.value })} /></label>
      <label>Due date<input required type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} /></label>
      <label className="full">Title<input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></label>
      <label className="full">Description<textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></label>
      <label>Owner user ID<input required value={form.ownerId} onChange={(e) => setForm({ ...form, ownerId: e.target.value })} /></label>
      <label>Verifier user ID (must differ from owner)<input required value={form.verifierId} onChange={(e) => setForm({ ...form, verifierId: e.target.value })} /></label>
      <div className="full">
        <button className="sg-btn" type="submit" disabled={submitting}>{submitting ? "Saving…" : "Create CAPA"}</button>
        {err && <span className="sg-alert critical" style={{ marginLeft: 10 }}>{err}</span>}
      </div>
    </form>
  );
}

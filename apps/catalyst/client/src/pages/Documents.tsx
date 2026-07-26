import { useState } from "react";
import { useApi } from "../lib/useApi";
import { api } from "../lib/api";
import type { DocumentRow } from "../lib/types";
import { Row, Loading } from "../components/Row";
import { DataTable } from "../components/DataTable";
import { RagBadge } from "../components/RagBadge";

export function Documents() {
  const { data, loading, error, offline } = useApi<DocumentRow[]>("api-documents", "/documents");
  const [showForm, setShowForm] = useState(false);

  return (
    <div>
      <h1>Document &amp; Evidence Library</h1>
      <div className="sg-filters">
        <button className="sg-btn" onClick={() => setShowForm((v) => !v)}>{showForm ? "Cancel" : "+ Upload document"}</button>
      </div>
      {showForm && <NewDocumentForm onDone={() => setShowForm(false)} />}
      {loading && <Loading />}
      {error && <div className="sg-alert critical">{error}</div>}
      {offline && <div className="sg-empty">Not connected — no documents to show.</div>}
      {data && (
        <Row title={`${data.length} document(s)`}>
          <DataTable<DocumentRow>
            rowKey={(r) => r.documentId}
            rows={data}
            emptyMessage="No documents uploaded yet."
            columns={[
              { key: "title", header: "Title", render: (r) => r.title },
              { key: "category", header: "Category", render: (r) => r.category },
              { key: "property", header: "Property", render: (r) => r.propertyId ?? "Group-wide" },
              { key: "status", header: "Status", render: (r) => r.status ?? "—" },
              { key: "expiry", header: "Expiry", render: (r) => r.expiryDate ?? "—" },
              { key: "valid", header: "Currently valid evidence", render: (r) => (r.status === "approved" && (!r.expiryDate || new Date(r.expiryDate) > new Date()) ? <RagBadge status="green" /> : <RagBadge status="red" />) },
            ]}
          />
        </Row>
      )}
    </div>
  );
}

function NewDocumentForm({ onDone }: { onDone: () => void }) {
  const [form, setForm] = useState({ title: "", category: "policy", propertyId: "", fileId: "", expiryDate: "", reviewDate: "" });
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setErr(null);
    try {
      await api.post("api-documents", "/documents", {
        title: form.title,
        category: form.category,
        propertyId: form.propertyId || null,
        fileId: form.fileId || `manual-${Date.now()}`,
        expiryDate: form.expiryDate || null,
        reviewDate: form.reviewDate || null,
      });
      onDone();
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : "Failed to upload document.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="sg-form-grid" style={{ marginBottom: 20 }} onSubmit={submit}>
      <label className="full">Title<input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></label>
      <label>Category
        <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
          {["policy", "procedure", "risk_assessment", "statutory_certificate", "training_record", "inspection_report", "other"].map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </label>
      <label>Property ID (blank = group-wide)<input value={form.propertyId} onChange={(e) => setForm({ ...form, propertyId: e.target.value })} /></label>
      <label>Expiry date<input type="date" value={form.expiryDate} onChange={(e) => setForm({ ...form, expiryDate: e.target.value })} /></label>
      <label>Review date<input type="date" value={form.reviewDate} onChange={(e) => setForm({ ...form, reviewDate: e.target.value })} /></label>
      <div className="full">
        <button className="sg-btn" type="submit" disabled={submitting}>{submitting ? "Saving…" : "Upload"}</button>
        {err && <span className="sg-alert critical" style={{ marginLeft: 10 }}>{err}</span>}
      </div>
    </form>
  );
}

import { useState } from "react";
import { useApi } from "../lib/useApi";
import { api } from "../lib/api";
import { Row, Loading } from "../components/Row";
import { DataTable } from "../components/DataTable";
import { RagBadge } from "../components/RagBadge";

interface EvidenceMapRow {
  frameworkCode: string;
  controlCode: string;
  controlTitle: string;
  maturityScore: number | null;
  hasCriticalGap: boolean;
}

const DIMENSIONS = ["policy", "procedure", "implementation", "effectiveness"];

export function Controls() {
  const { data, loading, error, offline } = useApi<{ rows: EvidenceMapRow[] }>("api-assurance-map", "/assurance-map");
  const [showForm, setShowForm] = useState(false);

  const byControl = new Map<string, EvidenceMapRow>();
  for (const r of data?.rows ?? []) byControl.set(r.controlCode, r);

  return (
    <div>
      <h1>Controls &amp; Frameworks</h1>
      <div className="sg-filters">
        <button className="sg-btn" onClick={() => setShowForm((v) => !v)}>{showForm ? "Cancel" : "+ Record control assessment"}</button>
      </div>
      {showForm && <AssessmentForm onDone={() => setShowForm(false)} />}
      {loading && <Loading />}
      {error && <div className="sg-alert critical">{error}</div>}
      {offline && <div className="sg-empty">Not connected — no controls to show.</div>}
      {data && (
        <Row title={`${byControl.size} control(s)`}>
          <DataTable<EvidenceMapRow>
            rowKey={(r) => r.controlCode}
            rows={[...byControl.values()]}
            emptyMessage="No control assessments recorded yet."
            columns={[
              { key: "code", header: "Control", render: (r) => `${r.controlCode} — ${r.controlTitle}` },
              { key: "framework", header: "Framework", render: (r) => r.frameworkCode },
              { key: "maturity", header: "Maturity (min of 4 dimensions)", render: (r) => r.maturityScore ?? "Not assessed" },
              { key: "gap", header: "Critical gap", render: (r) => (r.hasCriticalGap ? <RagBadge status="red" /> : <RagBadge status="green" />) },
            ]}
          />
        </Row>
      )}
    </div>
  );
}

function AssessmentForm({ onDone }: { onDone: () => void }) {
  const [form, setForm] = useState({ controlId: "", propertyId: "", dimension: "policy", maturityScore: "3", notes: "", isLifeSafetyCritical: false, isLegal: false });
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await api.post<{ criticalGap: unknown }>("api-controls", "/controls/assessments", {
        controlId: form.controlId,
        propertyId: form.propertyId,
        dimension: form.dimension,
        maturityScore: Number(form.maturityScore),
        notes: form.notes || null,
        isLifeSafetyCritical: form.isLifeSafetyCritical,
        isLegal: form.isLegal,
      });
      setResult(res.criticalGap ? "Recorded — this scoring opened or kept open a critical gap." : "Recorded — no critical gap.");
      setTimeout(onDone, 1200);
    } catch (ex) {
      setResult(ex instanceof Error ? ex.message : "Failed.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="sg-form-grid" style={{ marginBottom: 20 }} onSubmit={submit}>
      <label>Control ID<input required value={form.controlId} onChange={(e) => setForm({ ...form, controlId: e.target.value })} /></label>
      <label>Property ID<input required value={form.propertyId} onChange={(e) => setForm({ ...form, propertyId: e.target.value })} /></label>
      <label>Dimension
        <select value={form.dimension} onChange={(e) => setForm({ ...form, dimension: e.target.value })}>
          {DIMENSIONS.map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
      </label>
      <label>Maturity score (0-4)<input type="number" min={0} max={4} value={form.maturityScore} onChange={(e) => setForm({ ...form, maturityScore: e.target.value })} /></label>
      <label className="full">Notes (e.g. "Fire certificate expired")<input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></label>
      <label><input type="checkbox" checked={form.isLifeSafetyCritical} onChange={(e) => setForm({ ...form, isLifeSafetyCritical: e.target.checked })} /> Life-safety critical</label>
      <label><input type="checkbox" checked={form.isLegal} onChange={(e) => setForm({ ...form, isLegal: e.target.checked })} /> Legal requirement</label>
      <div className="full">
        <button className="sg-btn" type="submit" disabled={submitting}>{submitting ? "Saving…" : "Record assessment"}</button>
        {result && <span className="sg-card-sub" style={{ marginLeft: 10 }}>{result}</span>}
      </div>
    </form>
  );
}

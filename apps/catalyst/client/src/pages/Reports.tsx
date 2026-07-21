import { useState } from "react";
import { loadRuntimeConfig } from "../lib/api";
import { Row } from "../components/Row";

const RAW_EXPORTS = [
  { type: "kpi", label: "KPI export" },
  { type: "incidents", label: "Incident export" },
  { type: "capa", label: "CAPA export" },
  { type: "audits", label: "Audit export" },
  { type: "evidence-map", label: "Evidence map export" },
  { type: "framework-readiness", label: "Framework readiness export" },
];

export function Reports() {
  const [narrative, setNarrative] = useState<string | null>(null);
  const [pack, setPack] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function fetchText(fn: string, path: string, setter: (v: string) => void, key: string) {
    setBusy(key);
    setError(null);
    try {
      const config = await loadRuntimeConfig();
      const res = await fetch(`${config.apiBase}/${fn}${path}`, { credentials: "include" });
      if (!res.ok) throw new Error(`Export failed (${res.status}) — check you hold the required permission.`);
      setter(await res.text());
    } catch (ex) {
      setError(ex instanceof Error ? ex.message : "Failed.");
    } finally {
      setBusy(null);
    }
  }

  async function downloadJson(type: string) {
    setBusy(type);
    setError(null);
    try {
      const config = await loadRuntimeConfig();
      const res = await fetch(`${config.apiBase}/api-reports/reports/export/${type}`, { credentials: "include" });
      if (!res.ok) throw new Error(`Export failed (${res.status}) — check you hold the required permission.`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${type}-export.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (ex) {
      setError(ex instanceof Error ? ex.message : "Failed.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      <h1>Reports &amp; Exports</h1>
      {error && <div className="sg-alert critical">{error}</div>}

      <Row title="Board narrative">
        <p className="sg-card-sub">Generated only from live KPI data. If a figure has no data, it reads "not yet calculable" — never a fabricated number. Fatalities, serious incidents, and critical gaps are always called out.</p>
        <button className="sg-btn" disabled={busy === "narrative"} onClick={() => fetchText("api-reports", "/reports/board-narrative", setNarrative, "narrative")}>
          {busy === "narrative" ? "Generating…" : "Generate board narrative"}
        </button>
        {narrative && <pre style={{ whiteSpace: "pre-wrap", background: "white", border: "1px solid var(--sg-border)", borderRadius: 8, padding: 16, marginTop: 12 }}>{narrative}</pre>}
      </Row>

      <Row title="Assurance readiness pack">
        <p className="sg-card-sub">Labelled "management self-assessment" — not external assurance. Organised like an ISAE 3000-type evidence bundle.</p>
        <button className="sg-btn" disabled={busy === "pack"} onClick={() => fetchText("api-reports", "/reports/assurance-pack", setPack, "pack")}>
          {busy === "pack" ? "Generating…" : "Generate assurance pack"}
        </button>
        {pack && <pre style={{ whiteSpace: "pre-wrap", background: "white", border: "1px solid var(--sg-border)", borderRadius: 8, padding: 16, marginTop: 12 }}>{pack}</pre>}
      </Row>

      <Row title="Raw data exports">
        <p className="sg-card-sub">Every export below is permission-controlled, audit-logged, timestamped, and linked to your user and the filters used.</p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {RAW_EXPORTS.map((e) => (
            <button key={e.type} className="sg-btn secondary" disabled={busy === e.type} onClick={() => downloadJson(e.type)}>
              {busy === e.type ? "Exporting…" : e.label}
            </button>
          ))}
        </div>
      </Row>
    </div>
  );
}

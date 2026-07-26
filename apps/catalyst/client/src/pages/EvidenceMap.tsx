import { useState } from "react";
import { useApi } from "../lib/useApi";
import { Row, Loading } from "../components/Row";
import { DataTable } from "../components/DataTable";
import { RagBadge } from "../components/RagBadge";

interface EvidenceMapRow {
  frameworkCode: string;
  requirementRef: string;
  requirementTitle: string;
  controlCode: string;
  controlTitle: string;
  maturityScore: number | null;
  hasCriticalGap: boolean;
  totalEvidenceLinks: number;
  validEvidenceCount: number;
  expiredEvidenceCount: number;
  linkedKpiCodes: string[];
  linkedFindingIds: string[];
  linkedCapaIds: string[];
}

const FRAMEWORKS = ["", "ISO45001", "MU_LEGAL", "GRI403", "IFRS_S1", "IFRS_S2", "SASB_HOTELS", "UNGC", "ILO_OSH"];

export function EvidenceMap() {
  const [framework, setFramework] = useState("");
  const [criticalGapOnly, setCriticalGapOnly] = useState(false);
  const [expiredOnly, setExpiredOnly] = useState(false);

  const params = new URLSearchParams();
  if (framework) params.set("framework", framework);
  if (criticalGapOnly) params.set("criticalGapOnly", "true");
  if (expiredOnly) params.set("expiredEvidenceOnly", "true");

  const { data, loading, error, offline } = useApi<{ rows: EvidenceMapRow[] }>("api-assurance-map", `/assurance-map?${params.toString()}`);

  return (
    <div>
      <h1>Assurance Evidence Map</h1>
      <p className="sg-card-sub">Framework → Requirement → Control → Evidence → KPI / Finding / CAPA → Report.</p>

      <div className="sg-filters">
        <select value={framework} onChange={(e) => setFramework(e.target.value)}>
          {FRAMEWORKS.map((f) => <option key={f} value={f}>{f || "All frameworks"}</option>)}
        </select>
        <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 13 }}>
          <input type="checkbox" checked={criticalGapOnly} onChange={(e) => setCriticalGapOnly(e.target.checked)} /> Critical gaps only
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 13 }}>
          <input type="checkbox" checked={expiredOnly} onChange={(e) => setExpiredOnly(e.target.checked)} /> Expired evidence only
        </label>
      </div>

      {loading && <Loading />}
      {error && <div className="sg-alert critical">{error}</div>}
      {offline && <div className="sg-empty">Not connected — no evidence map to show.</div>}

      {data && (
        <Row title={`${data.rows.length} control(s) in scope`}>
          <DataTable<EvidenceMapRow>
            rowKey={(r) => `${r.frameworkCode}-${r.controlCode}-${r.requirementRef}`}
            rows={data.rows}
            emptyMessage="No controls match the current filters."
            columns={[
              { key: "framework", header: "Framework", render: (r) => r.frameworkCode },
              { key: "requirement", header: "Requirement", render: (r) => `${r.requirementRef} ${r.requirementTitle}` },
              { key: "control", header: "Control", render: (r) => `${r.controlCode} — ${r.controlTitle}` },
              { key: "maturity", header: "Maturity", render: (r) => r.maturityScore ?? "Not assessed" },
              { key: "gap", header: "Critical gap", render: (r) => (r.hasCriticalGap ? <RagBadge status="red" /> : <RagBadge status="green" />) },
              { key: "evidence", header: "Evidence", render: (r) => `${r.validEvidenceCount} valid / ${r.expiredEvidenceCount} expired / ${r.totalEvidenceLinks} total` },
              { key: "links", header: "Linked", render: (r) => [...r.linkedKpiCodes, ...r.linkedFindingIds, ...r.linkedCapaIds].join(", ") || "—" },
            ]}
          />
        </Row>
      )}
    </div>
  );
}

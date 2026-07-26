import { useNavigate } from "react-router-dom";
import { useApi } from "../lib/useApi";
import { Row, Loading } from "../components/Row";
import { DataTable } from "../components/DataTable";

interface EvidenceMapRow {
  frameworkCode: string;
  requirementRef: string;
  controlCode: string;
  controlTitle: string;
  maturityScore: number | null;
  hasCriticalGap: boolean;
  totalEvidenceLinks: number;
  expiredEvidenceCount: number;
}
interface DqException {
  id: string;
  severity: string;
  module: string;
  recordId: string;
  description: string;
  suggestedFix: string;
}

export function AuditorDashboard() {
  const navigate = useNavigate();
  const map = useApi<{ rows: EvidenceMapRow[] }>("api-assurance-map", "/assurance-map");
  const dq = useApi<DqException[]>("api-data-quality", "/data-quality/exceptions");

  const criticalGapRows = (map.data?.rows ?? []).filter((r) => r.hasCriticalGap);
  const expiredEvidenceRows = (map.data?.rows ?? []).filter((r) => r.expiredEvidenceCount > 0);

  return (
    <div>
      <h1>Auditor / Assurance Reviewer Dashboard</h1>
      {(map.loading || dq.loading) && <Loading />}

      <Row title="Controls with a critical gap" action={<button className="sg-link-btn" onClick={() => navigate("/evidence-map")}>Open evidence map →</button>}>
        <DataTable<EvidenceMapRow>
          rowKey={(r) => `${r.frameworkCode}-${r.controlCode}`}
          emptyMessage="No critical control gaps open."
          rows={criticalGapRows}
          columns={[
            { key: "framework", header: "Framework", render: (r) => r.frameworkCode },
            { key: "control", header: "Control", render: (r) => `${r.controlCode} — ${r.controlTitle}` },
            { key: "maturity", header: "Maturity", render: (r) => r.maturityScore ?? "Not assessed" },
          ]}
        />
      </Row>

      <Row title="Expired evidence">
        <DataTable<EvidenceMapRow>
          rowKey={(r) => `${r.frameworkCode}-${r.controlCode}-exp`}
          emptyMessage="No expired evidence detected."
          rows={expiredEvidenceRows}
          columns={[
            { key: "control", header: "Control", render: (r) => r.controlTitle },
            { key: "count", header: "Expired links", render: (r) => r.expiredEvidenceCount },
          ]}
        />
      </Row>

      <Row title="Data-quality exceptions">
        <DataTable<DqException>
          rowKey={(r) => r.id}
          emptyMessage="No open data-quality exceptions."
          rows={dq.data ?? []}
          columns={[
            { key: "severity", header: "Severity", render: (r) => r.severity },
            { key: "module", header: "Module", render: (r) => r.module },
            { key: "description", header: "Description", render: (r) => r.description },
            { key: "fix", header: "Suggested fix", render: (r) => r.suggestedFix },
          ]}
        />
      </Row>
    </div>
  );
}

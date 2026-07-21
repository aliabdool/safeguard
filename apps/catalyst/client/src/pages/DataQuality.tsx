import { useState } from "react";
import { useApi } from "../lib/useApi";
import { api } from "../lib/api";
import { Row, Loading } from "../components/Row";
import { DataTable } from "../components/DataTable";

interface DqException {
  id: string;
  severity: string;
  module: string;
  recordId: string;
  propertyId: string | null;
  description: string;
  suggestedFix: string;
  status: string;
}

export function DataQuality() {
  const { data, loading, error, offline } = useApi<DqException[]>("api-data-quality", "/data-quality/exceptions");
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState<string | null>(null);

  async function rescan() {
    setScanning(true);
    try {
      const res = await api.post<{ openedCount: number; resolvedCount: number }>("api-data-quality", "/data-quality/scan", {});
      setScanResult(`Scan complete — ${res.openedCount} new exception(s), ${res.resolvedCount} resolved.`);
    } catch (ex) {
      setScanResult(ex instanceof Error ? ex.message : "Scan failed.");
    } finally {
      setScanning(false);
    }
  }

  return (
    <div>
      <h1>Data Quality Exceptions</h1>
      <div className="sg-filters">
        <button className="sg-btn" onClick={rescan} disabled={scanning}>{scanning ? "Scanning…" : "Rescan now"}</button>
        {scanResult && <span className="sg-card-sub">{scanResult}</span>}
      </div>
      {loading && <Loading />}
      {error && <div className="sg-alert critical">{error}</div>}
      {offline && <div className="sg-empty">Not connected — no exceptions to show.</div>}
      {data && (
        <Row title={`${data.length} open exception(s)`}>
          <DataTable<DqException>
            rowKey={(r) => r.id}
            rows={data}
            emptyMessage="No open data-quality exceptions."
            columns={[
              { key: "severity", header: "Severity", render: (r) => r.severity },
              { key: "module", header: "Module", render: (r) => r.module },
              { key: "record", header: "Record", render: (r) => r.recordId },
              { key: "property", header: "Property", render: (r) => r.propertyId ?? "—" },
              { key: "description", header: "Description", render: (r) => r.description },
              { key: "fix", header: "Suggested fix", render: (r) => r.suggestedFix },
            ]}
          />
        </Row>
      )}
    </div>
  );
}

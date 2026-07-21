import { useState } from "react";
import { useParams } from "react-router-dom";
import { useApi } from "../lib/useApi";
import { useAuth } from "../lib/auth";
import { api } from "../lib/api";
import type { CapaRow } from "../lib/types";
import { Row, Loading } from "../components/Row";

export function CapaDetail() {
  const { id } = useParams();
  const { me } = useAuth();
  const { data: capa, loading, error } = useApi<CapaRow>("api-capa", id ? `/capa/${id}` : null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function progress(newStatus?: string) {
    if (!id) return;
    setBusy(true);
    try {
      await api.post("api-capa", `/capa/${id}/progress`, { note: note || "Progress update.", newStatus });
      setMsg("Progress recorded.");
    } catch (ex) {
      setMsg(ex instanceof Error ? ex.message : "Failed.");
    } finally {
      setBusy(false);
    }
  }

  async function verify(outcome: "verified" | "rejected") {
    if (!id) return;
    setBusy(true);
    try {
      await api.post("api-capa", `/capa/${id}/verify`, { outcome, notes: note || null });
      setMsg(`Verification recorded: ${outcome}.`);
    } catch (ex) {
      setMsg(ex instanceof Error ? ex.message : "Failed.");
    } finally {
      setBusy(false);
    }
  }

  async function close() {
    if (!id) return;
    setBusy(true);
    try {
      await api.post("api-capa", `/capa/${id}/close`, {});
      setMsg("CAPA closed.");
    } catch (ex) {
      setMsg(ex instanceof Error ? ex.message : "Failed.");
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <Loading />;
  if (error) return <div className="sg-alert critical">{error}</div>;
  if (!capa) return <div className="sg-empty">CAPA not found.</div>;

  const isOwner = me?.userId === capa.ownerId;
  const isVerifier = me?.userId === capa.verifierId;

  return (
    <div>
      <h1>{capa.capaNumber} — {capa.title}</h1>
      <Row title="Summary">
        <div className="sg-table-wrap">
          <table className="sg-table">
            <tbody>
              <tr><td>Property</td><td>{capa.propertyId}</td></tr>
              <tr><td>Department</td><td>{capa.departmentId ?? "—"}</td></tr>
              <tr><td>Owner</td><td>{capa.ownerId} {isOwner && "(you)"}</td></tr>
              <tr><td>Verifier</td><td>{capa.verifierId} {isVerifier && "(you)"}</td></tr>
              <tr><td>Due date</td><td>{capa.dueDate}</td></tr>
              <tr><td>Status</td><td>{capa.status}</td></tr>
              <tr><td>Description</td><td>{capa.description ?? "—"}</td></tr>
            </tbody>
          </table>
        </div>
      </Row>

      <Row title="Progress note">
        <textarea style={{ width: "100%", minHeight: 60, marginBottom: 8 }} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Describe what was done…" />
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {capa.status === "open" && <button className="sg-btn" disabled={busy} onClick={() => progress("in_progress")}>Move to in progress</button>}
          {capa.status === "in_progress" && <button className="sg-btn" disabled={busy} onClick={() => progress("pending_verification")}>Submit for verification</button>}
          {isVerifier && capa.status === "pending_verification" && (
            <>
              <button className="sg-btn" disabled={busy} onClick={() => verify("verified")}>Verify — effective</button>
              <button className="sg-btn secondary" disabled={busy} onClick={() => verify("rejected")}>Reject — send back</button>
            </>
          )}
          {!isVerifier && capa.status === "pending_verification" && (
            <div className="sg-card-sub">Only the designated verifier ({capa.verifierId}) may verify this CAPA — the owner can never verify their own action.</div>
          )}
          {capa.status === "verified" && <button className="sg-btn" disabled={busy} onClick={close}>Close CAPA</button>}
        </div>
        {msg && <div className="sg-card-sub" style={{ marginTop: 8 }}>{msg}</div>}
      </Row>
    </div>
  );
}

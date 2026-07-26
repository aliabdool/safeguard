import express from "express";

import type { CatalystApp } from "../shared/middleware/auth-context";
import { propertyScopeClause, withAuthContext, type SafeGuardRequest } from "../shared/middleware/require-permission";
import { AuthError } from "../shared/pure/permissions";
import {
  closeCapa,
  createCapa,
  updateCapaProgress,
  verifyCapa,
  type AuditEntry,
  type AuditLogger,
  type CapaRecord,
  type CapaRepo,
} from "../shared/services/capa-service";

const app = express();
app.use(express.json());
app.use(withAuthContext);

/** Data Store rows come back as string-valued fields with no compile-time guarantee about which
 * keys exist — same pattern as api-incidents/index.ts's IncidentRow. */
interface DsRow extends Record<string, string> {
  ROWID: string;
}
interface CapaRow extends DsRow {
  capa_number: string;
  property_id: string;
  department_id: string;
  title: string;
  description: string;
  source_type: string;
  source_id: string;
  owner_id: string;
  verifier_id: string;
  due_date: string;
  status: string;
}
/** Wraps catalystApp.datastore() to satisfy CapaRepo — this is the ONLY place this Function talks
 * to Data Store directly; every route handler below goes through the shared, tested service layer
 * instead of building its own queries. */
function makeRepo(catalystApp: CatalystApp): CapaRepo {
  const datastore = catalystApp.datastore();
  return {
    async insertCapa(row) {
      const inserted = await datastore.table("CAPA").insertRow(toColumns(row));
      return { ...row, id: String(inserted.ROWID) };
    },
    async getCapa(id) {
      const rows = (await datastore
        .table("CAPA")
        .getRows({ criteria: `CAPA.ROWID == '${id}'`, maxRows: 1 })) as CapaRow[];
      const row = rows[0];
      return row ? fromCapaColumns(row) : undefined;
    },
    async updateCapaStatus(id, status) {
      await datastore.table("CAPA").updateRow({ ROWID: id, status });
    },
    async insertProgressNote(row) {
      const inserted = await datastore.table("CAPAProgressNotes").insertRow(toColumns(row));
      return { ...row, id: String(inserted.ROWID) };
    },
    async insertVerification(row) {
      const inserted = await datastore.table("CAPAVerification").insertRow(toColumns(row));
      return { ...row, id: String(inserted.ROWID) };
    },
  };
}

function makeAuditLogger(catalystApp: CatalystApp): AuditLogger {
  return {
    async log(entry: AuditEntry) {
      await catalystApp.datastore().table("AuditTrail").insertRow({
        actor_user_id: entry.actorUserId,
        event_type: entry.eventType,
        entity_type: entry.entityType,
        entity_id: entry.entityId ?? null,
        property_id: entry.propertyId ?? null,
        reason: entry.reason ?? null,
      });
    },
  };
}

function toColumns(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    out[key.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`)] = value;
  }
  return out;
}

function fromCapaColumns(row: CapaRow): CapaRecord {
  return {
    id: row.ROWID,
    capaNumber: row.capa_number,
    propertyId: row.property_id,
    departmentId: row.department_id || null,
    title: row.title,
    description: row.description || null,
    sourceType: row.source_type as CapaRecord["sourceType"],
    sourceId: row.source_id || null,
    ownerId: row.owner_id,
    verifierId: row.verifier_id,
    dueDate: row.due_date,
    status: row.status as CapaRecord["status"],
  };
}

function handleError(err: unknown, res: express.Response) {
  if (err instanceof AuthError) {
    res.status(err.code === "UNAUTHENTICATED" ? 401 : 403).json({ error: err.message });
    return;
  }
  res.status(400).json({ error: err instanceof Error ? err.message : "Unknown error." });
}

/** GET /capa — the CAPA Register list, property-scoped. */
app.get("/capa", async (req, res) => {
  const safeReq = req as unknown as SafeGuardRequest;
  try {
    const rows = (await safeReq.catalystApp.datastore().table("CAPA").getRows({
      criteria: propertyScopeClause(safeReq.authContext, "CAPA.property_id"),
    })) as CapaRow[];
    res.json(rows.map(fromCapaColumns));
  } catch (err) {
    handleError(err, res);
  }
});

app.post("/capa", async (req, res) => {
  const safeReq = req as unknown as SafeGuardRequest;
  try {
    const capa = await createCapa(
      makeRepo(safeReq.catalystApp),
      makeAuditLogger(safeReq.catalystApp),
      safeReq.authContext,
      req.body,
    );
    res.status(201).json(capa);
  } catch (err) {
    handleError(err, res);
  }
});

app.get("/capa/:capaId", async (req, res) => {
  const safeReq = req as unknown as SafeGuardRequest;
  try {
    const capa = await makeRepo(safeReq.catalystApp).getCapa(req.params.capaId);
    if (!capa) {
      res.status(404).json({ error: "CAPA not found." });
      return;
    }
    res.json(capa);
  } catch (err) {
    handleError(err, res);
  }
});

app.post("/capa/:capaId/progress", async (req, res) => {
  const safeReq = req as unknown as SafeGuardRequest;
  try {
    const capa = await updateCapaProgress(
      makeRepo(safeReq.catalystApp),
      makeAuditLogger(safeReq.catalystApp),
      safeReq.authContext,
      req.params.capaId,
      req.body,
    );
    res.json(capa);
  } catch (err) {
    handleError(err, res);
  }
});

app.post("/capa/:capaId/verify", async (req, res) => {
  const safeReq = req as unknown as SafeGuardRequest;
  try {
    const capa = await verifyCapa(
      makeRepo(safeReq.catalystApp),
      makeAuditLogger(safeReq.catalystApp),
      safeReq.authContext,
      req.params.capaId,
      req.body.outcome,
      req.body.notes ?? null,
    );
    res.json(capa);
  } catch (err) {
    handleError(err, res);
  }
});

app.post("/capa/:capaId/close", async (req, res) => {
  const safeReq = req as unknown as SafeGuardRequest;
  try {
    const capa = await closeCapa(
      makeRepo(safeReq.catalystApp),
      makeAuditLogger(safeReq.catalystApp),
      safeReq.authContext,
      req.params.capaId,
    );
    res.json(capa);
  } catch (err) {
    handleError(err, res);
  }
});

module.exports = app;

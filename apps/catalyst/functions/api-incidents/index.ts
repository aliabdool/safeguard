import express from "express";

import type { CatalystApp } from "../shared/middleware/auth-context";
import { assertPropertyAccess, propertyScopeClause, withAuthContext, type SafeGuardRequest } from "../shared/middleware/require-permission";
import { AuthError } from "../shared/pure/permissions";
import {
  addMedicalNote,
  createIncident,
  exportMedicalNotes,
  recordOshReportabilityDetermination,
  startInvestigation,
  viewMedicalNotes,
  type AuditEntry,
  type AuditLogger,
  type IncidentRecord,
  type IncidentRepo,
  type InvestigationRecord,
  type MedicalNoteRecord,
  type OshReportabilityRecord,
} from "../shared/services/incident-service";

const app = express();
app.use(express.json());
app.use(withAuthContext);

/** Data Store rows come back as string-valued fields with no compile-time guarantee about which
 * keys exist — these interfaces document (and type-check) exactly which columns each query
 * relies on, the same pattern as UserRow in shared/middleware/auth-context.ts. */
interface DsRow extends Record<string, string> {
  ROWID: string;
}
interface IncidentRow extends DsRow {
  incident_number: string;
  property_id: string;
  department_id: string;
  occurred_at: string;
  reported_by: string;
  person_event_type: string;
  incident_type: string;
  outcome: string;
  hospital_referral: string;
  status: string;
}
interface InvestigationRow extends DsRow {
  incident_id: string;
  investigator_id: string;
  status: string;
}
interface OshRow extends DsRow {
  incident_id: string;
  reportable_status: string;
  determined_by: string;
  determined_at: string;
}
interface MedicalNoteRow extends DsRow {
  incident_id: string;
  clinical_notes: string;
  created_by: string;
  created_at: string;
}

/** Wraps catalystApp.datastore() to satisfy IncidentRepo — this is the ONLY place this Function
 * talks to Data Store directly; every route handler below goes through the shared, tested service
 * layer instead of building its own queries. */
function makeRepo(catalystApp: CatalystApp): IncidentRepo {
  const datastore = catalystApp.datastore();
  return {
    async insertIncident(row) {
      const inserted = await datastore.table("Incidents").insertRow(toColumns(row));
      return { ...row, id: String(inserted.ROWID) };
    },
    async getIncident(id) {
      const rows = (await datastore
        .table("Incidents")
        .getRows({ criteria: `Incidents.ROWID == '${id}'`, maxRows: 1 })) as IncidentRow[];
      const row = rows[0];
      return row ? fromIncidentColumns(row) : undefined;
    },
    async updateIncidentStatus(id, status) {
      await datastore.table("Incidents").updateRow({ ROWID: id, status });
    },
    async insertInvestigation(row) {
      const inserted = await datastore.table("IncidentInvestigation").insertRow(toColumns(row));
      return { ...row, id: String(inserted.ROWID) };
    },
    async getInvestigationByIncident(incidentId) {
      const rows = (await datastore
        .table("IncidentInvestigation")
        .getRows({ criteria: `IncidentInvestigation.incident_id == '${incidentId}'`, maxRows: 1 })) as InvestigationRow[];
      const row = rows[0];
      return row
        ? {
            id: row.ROWID,
            incidentId: row.incident_id,
            investigatorId: row.investigator_id,
            status: row.status,
          }
        : undefined;
    },
    async insertOshReportability(row) {
      const inserted = await datastore.table("IncidentOSHReportability").insertRow(toColumns(row));
      return { ...row, id: String(inserted.ROWID) };
    },
    async getOshReportability(incidentId) {
      const rows = (await datastore.table("IncidentOSHReportability").getRows({
        criteria: `IncidentOSHReportability.incident_id == '${incidentId}'`,
      })) as OshRow[];
      const latest = rows[rows.length - 1];
      return latest
        ? {
            id: latest.ROWID,
            incidentId: latest.incident_id,
            reportableStatus: latest.reportable_status as OshReportabilityRecord["reportableStatus"],
            determinedBy: latest.determined_by || null,
            determinedAt: latest.determined_at || null,
          }
        : undefined;
    },
    async insertMedicalNote(row) {
      const inserted = await datastore.table("MedicalNotes").insertRow(toColumns(row));
      return { ...row, id: String(inserted.ROWID) };
    },
    async listMedicalNotes(incidentId) {
      const rows = (await datastore
        .table("MedicalNotes")
        .getRows({ criteria: `MedicalNotes.incident_id == '${incidentId}'` })) as MedicalNoteRow[];
      return rows.map(
        (row): MedicalNoteRecord => ({
          id: row.ROWID,
          incidentId: row.incident_id,
          clinicalNotes: row.clinical_notes,
          createdBy: row.created_by,
          createdAt: row.created_at,
        }),
      );
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

function fromIncidentColumns(row: IncidentRow): IncidentRecord {
  return {
    id: row.ROWID,
    incidentNumber: row.incident_number,
    propertyId: row.property_id,
    departmentId: row.department_id,
    occurredAt: row.occurred_at,
    reportedBy: row.reported_by,
    personEventType: row.person_event_type,
    incidentType: row.incident_type,
    outcome: row.outcome,
    hospitalReferral: row.hospital_referral === "true",
    status: row.status as IncidentRecord["status"],
  };
}

function handleError(err: unknown, res: express.Response) {
  if (err instanceof AuthError) {
    res.status(err.code === "UNAUTHENTICATED" ? 401 : 403).json({ error: err.message });
    return;
  }
  res.status(400).json({ error: err instanceof Error ? err.message : "Unknown error." });
}

/** GET /incidents — the Incident Register list, property-scoped. Medical notes are never
 * included here (see the separate /medical route group below). */
app.get("/incidents", async (req, res) => {
  const safeReq = req as unknown as SafeGuardRequest;
  try {
    const rows = (await safeReq.catalystApp.datastore().table("Incidents").getRows({
      criteria: propertyScopeClause(safeReq.authContext, "Incidents.property_id"),
    })) as IncidentRow[];
    res.json(rows.map(fromIncidentColumns));
  } catch (err) {
    handleError(err, res);
  }
});

app.post("/incidents", async (req, res) => {
  const safeReq = req as unknown as SafeGuardRequest;
  try {
    const incident = await createIncident(
      makeRepo(safeReq.catalystApp),
      makeAuditLogger(safeReq.catalystApp),
      safeReq.authContext,
      req.body,
    );
    res.status(201).json(incident);
  } catch (err) {
    handleError(err, res);
  }
});

/** GET /incidents/:incidentId — single-incident detail (never includes medical notes; those are
 * the separate, permission-gated /medical route group below). */
app.get("/incidents/:incidentId", async (req, res) => {
  const safeReq = req as unknown as SafeGuardRequest;
  try {
    const incident = await makeRepo(safeReq.catalystApp).getIncident(req.params.incidentId);
    if (!incident) {
      res.status(404).json({ error: "Incident not found." });
      return;
    }
    assertPropertyAccess(safeReq.authContext, incident.propertyId);
    res.json(incident);
  } catch (err) {
    handleError(err, res);
  }
});

app.post("/incidents/:incidentId/investigation", async (req, res) => {
  const safeReq = req as unknown as SafeGuardRequest;
  try {
    const investigation = await startInvestigation(
      makeRepo(safeReq.catalystApp),
      makeAuditLogger(safeReq.catalystApp),
      safeReq.authContext,
      req.params.incidentId,
    );
    res.status(201).json(investigation);
  } catch (err) {
    handleError(err, res);
  }
});

app.put("/incidents/:incidentId/osh-reportability", async (req, res) => {
  const safeReq = req as unknown as SafeGuardRequest;
  try {
    const determination = await recordOshReportabilityDetermination(
      makeRepo(safeReq.catalystApp),
      makeAuditLogger(safeReq.catalystApp),
      safeReq.authContext,
      req.params.incidentId,
      req.body.reportableStatus,
    );
    res.json(determination);
  } catch (err) {
    handleError(err, res);
  }
});

// ---- Medical notes — deliberately separate route group, never returned from the general
// incident detail endpoint above, so a client can't accidentally receive clinical data it never
// asked for and wasn't permitted to see. ----

app.get("/incidents/:incidentId/medical", async (req, res) => {
  const safeReq = req as unknown as SafeGuardRequest;
  try {
    const incident = await makeRepo(safeReq.catalystApp).getIncident(req.params.incidentId);
    if (!incident) {
      res.status(404).json({ error: "Incident not found." });
      return;
    }
    assertPropertyAccess(safeReq.authContext, incident.propertyId);
    const notes = await viewMedicalNotes(
      makeRepo(safeReq.catalystApp),
      makeAuditLogger(safeReq.catalystApp),
      safeReq.authContext,
      req.params.incidentId,
    );
    res.json(notes);
  } catch (err) {
    handleError(err, res);
  }
});

app.post("/incidents/:incidentId/medical", async (req, res) => {
  const safeReq = req as unknown as SafeGuardRequest;
  try {
    const note = await addMedicalNote(
      makeRepo(safeReq.catalystApp),
      makeAuditLogger(safeReq.catalystApp),
      safeReq.authContext,
      req.params.incidentId,
      req.body.clinicalNotes,
    );
    res.status(201).json(note);
  } catch (err) {
    handleError(err, res);
  }
});

app.get("/incidents/:incidentId/medical/export", async (req, res) => {
  const safeReq = req as unknown as SafeGuardRequest;
  try {
    const notes = await exportMedicalNotes(
      makeRepo(safeReq.catalystApp),
      makeAuditLogger(safeReq.catalystApp),
      safeReq.authContext,
      req.params.incidentId,
    );
    res.json(notes);
  } catch (err) {
    handleError(err, res);
  }
});

module.exports = app;

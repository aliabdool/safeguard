import express from "express";

import type { CatalystApp } from "../shared/middleware/auth-context";
import { withAuthContext, type SafeGuardRequest } from "../shared/middleware/require-permission";
import { AuthError } from "../shared/pure/permissions";
import type { DimensionScores } from "../shared/pure/maturity";
import {
  computeFrameworkReadiness,
  recordControlAssessment,
  type AuditEntry,
  type AuditLogger,
  type ControlAssessmentRecord,
  type ControlRepo,
  type CriticalGapRecord,
  type FrameworkReadinessSnapshotRecord,
} from "../shared/services/control-service";

const app = express();
app.use(express.json());
app.use(withAuthContext);

interface DsRow extends Record<string, string> {
  ROWID: string;
}
interface AssessmentRow extends DsRow {
  control_id: string;
  property_id: string;
  dimension: string;
  maturity_score: string;
  notes: string;
  assessed_by: string;
}
interface GapRow extends DsRow {
  control_id: string;
  property_id: string;
  reason: string;
  resolved_at: string;
}
interface ControlRow extends DsRow {
  is_life_safety_critical: string;
  is_legal: string;
}

function makeRepo(catalystApp: CatalystApp): ControlRepo {
  const datastore = catalystApp.datastore();
  const zcql = catalystApp.zcql();
  return {
    async insertAssessment(row) {
      const inserted = await datastore.table("ControlAssessments").insertRow(toColumns(row));
      return { ...row, id: String(inserted.ROWID) };
    },
    async getLatestDimensionScores(controlId, propertyId) {
      const rows = (await datastore.table("ControlAssessments").getRows({
        criteria: `ControlAssessments.control_id == '${controlId}' && ControlAssessments.property_id == '${propertyId}'`,
      })) as AssessmentRow[];
      const scores: DimensionScores = {};
      // ZCQL rows aren't guaranteed ordered — sort by ROWID (monotonic insert order) so "latest"
      // per dimension is well-defined, same convention as getOshReportability()'s "last row wins".
      for (const row of rows.sort((a, b) => Number(a.ROWID) - Number(b.ROWID))) {
        (scores as Record<string, number>)[row.dimension] = Number(row.maturity_score);
      }
      return scores;
    },
    async getOpenCriticalGap(controlId, propertyId) {
      const rows = (await datastore.table("CriticalGaps").getRows({
        criteria: `CriticalGaps.control_id == '${controlId}' && CriticalGaps.property_id == '${propertyId}' && CriticalGaps.resolved_at is null`,
        maxRows: 1,
      })) as GapRow[];
      const row = rows[0];
      return row
        ? { id: row.ROWID, controlId: row.control_id, propertyId: row.property_id, reason: row.reason, resolvedAt: null }
        : undefined;
    },
    async insertCriticalGap(row) {
      const inserted = await datastore.table("CriticalGaps").insertRow(toColumns(row));
      return { ...row, id: String(inserted.ROWID), resolvedAt: null };
    },
    async resolveCriticalGap(id) {
      await datastore.table("CriticalGaps").updateRow({ ROWID: id, resolved_at: new Date().toISOString() });
    },
    async listMappedControls(frameworkId) {
      const rows = (await zcql.executeZCQLQuery(
        `select Controls.ROWID, Controls.is_life_safety_critical, Controls.is_legal
         from ControlFrameworkMappings
         left join Controls on ControlFrameworkMappings.control_id = Controls.ROWID
         left join FrameworkRequirements on ControlFrameworkMappings.framework_requirement_id = FrameworkRequirements.ROWID
         where FrameworkRequirements.framework_id == '${frameworkId}'`,
      )) as Array<{ Controls: ControlRow }>;
      return rows.map(({ Controls: c }) => ({
        controlId: c.ROWID,
        isLifeSafetyCritical: c.is_life_safety_critical === "true",
        isLegal: c.is_legal === "true",
      }));
    },
    async getLatestDimensionScoresForControls(controlIds, propertyId) {
      const map = new Map<string, DimensionScores>();
      if (controlIds.length === 0) return map;
      const inList = controlIds.map((id) => `'${id}'`).join(",");
      const propClause = propertyId ? `&& ControlAssessments.property_id == '${propertyId}'` : "";
      const rows = (await datastore.table("ControlAssessments").getRows({
        criteria: `ControlAssessments.control_id in (${inList}) ${propClause}`,
      })) as AssessmentRow[];
      for (const row of rows.sort((a, b) => Number(a.ROWID) - Number(b.ROWID))) {
        const scores = map.get(row.control_id) ?? {};
        (scores as Record<string, number>)[row.dimension] = Number(row.maturity_score);
        map.set(row.control_id, scores);
      }
      return map;
    },
    async insertFrameworkReadinessSnapshot(row) {
      const inserted = await datastore.table("FrameworkReadinessSnapshots").insertRow(toColumns(row));
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

function handleError(err: unknown, res: express.Response) {
  if (err instanceof AuthError) {
    res.status(err.code === "UNAUTHENTICATED" ? 401 : 403).json({ error: err.message });
    return;
  }
  res.status(400).json({ error: err instanceof Error ? err.message : "Unknown error." });
}

app.post("/controls/assessments", async (req, res) => {
  const safeReq = req as unknown as SafeGuardRequest;
  try {
    const result = await recordControlAssessment(
      makeRepo(safeReq.catalystApp),
      makeAuditLogger(safeReq.catalystApp),
      safeReq.authContext,
      req.body,
    );
    res.status(201).json(result);
  } catch (err) {
    handleError(err, res);
  }
});

app.get("/frameworks/:frameworkId/readiness", async (req, res) => {
  const safeReq = req as unknown as SafeGuardRequest;
  try {
    const propertyId = typeof req.query.propertyId === "string" ? req.query.propertyId : null;
    const readiness = await computeFrameworkReadiness(
      makeRepo(safeReq.catalystApp),
      req.params.frameworkId,
      propertyId,
    );
    res.json(readiness);
  } catch (err) {
    handleError(err, res);
  }
});

module.exports = app;

import express from "express";

import type { CatalystApp } from "../shared/middleware/auth-context";
import { withAuthContext, type SafeGuardRequest } from "../shared/middleware/require-permission";
import { AuthError } from "../shared/pure/permissions";
import {
  decideDocumentApproval,
  getDocumentEvidenceDetail,
  linkEvidence,
  submitForApproval,
  uploadDocument,
  type AuditEntry,
  type AuditLogger,
  type DocumentApprovalRecord,
  type DocumentEvidenceLinkRecord,
  type DocumentRecord,
  type DocumentRepo,
  type DocumentVersionRecord,
} from "../shared/services/document-service";

const app = express();
app.use(express.json());
app.use(withAuthContext);

interface DsRow extends Record<string, string> {
  ROWID: string;
}
interface DocRow extends DsRow {
  title: string;
  category: string;
  property_id: string;
  owner_id: string;
}
interface VerRow extends DsRow {
  document_id: string;
  version_number: string;
  file_id: string;
  status: string;
  expiry_date: string;
  review_date: string;
  uploaded_by: string;
}
interface LinkRow extends DsRow {
  document_version_id: string;
  linked_entity_type: string;
  linked_entity_id: string;
  linked_by: string;
}

function makeRepo(catalystApp: CatalystApp): DocumentRepo {
  const datastore = catalystApp.datastore();
  return {
    async insertDocument(row) {
      const inserted = await datastore.table("Documents").insertRow(toColumns(row));
      return { ...row, id: String(inserted.ROWID) };
    },
    async getDocument(id) {
      const rows = (await datastore
        .table("Documents")
        .getRows({ criteria: `Documents.ROWID == '${id}'`, maxRows: 1 })) as DocRow[];
      const row = rows[0];
      return row
        ? { id: row.ROWID, title: row.title, category: row.category, propertyId: row.property_id || null, ownerId: row.owner_id }
        : undefined;
    },
    async insertDocumentVersion(row) {
      const inserted = await datastore.table("DocumentVersions").insertRow(toColumns(row));
      return { ...row, id: String(inserted.ROWID) };
    },
    async getDocumentVersion(id) {
      const rows = (await datastore
        .table("DocumentVersions")
        .getRows({ criteria: `DocumentVersions.ROWID == '${id}'`, maxRows: 1 })) as VerRow[];
      const row = rows[0];
      return row ? fromVerColumns(row) : undefined;
    },
    async updateDocumentVersionStatus(id, status) {
      await datastore.table("DocumentVersions").updateRow({ ROWID: id, status });
    },
    async listVersionsForDocument(documentId) {
      const rows = (await datastore
        .table("DocumentVersions")
        .getRows({ criteria: `DocumentVersions.document_id == '${documentId}'` })) as VerRow[];
      return rows.map(fromVerColumns);
    },
    async insertApproval(row) {
      const inserted = await datastore.table("DocumentApprovals").insertRow(toColumns(row));
      return { ...row, id: String(inserted.ROWID) };
    },
    async insertEvidenceLink(row) {
      const inserted = await datastore.table("DocumentEvidenceLinks").insertRow(toColumns(row));
      return { ...row, id: String(inserted.ROWID) };
    },
    async listLinksForVersion(documentVersionId) {
      const rows = (await datastore.table("DocumentEvidenceLinks").getRows({
        criteria: `DocumentEvidenceLinks.document_version_id == '${documentVersionId}'`,
      })) as LinkRow[];
      return rows.map((r) => ({
        id: r.ROWID,
        documentVersionId: r.document_version_id,
        linkedEntityType: r.linked_entity_type,
        linkedEntityId: r.linked_entity_id,
        linkedBy: r.linked_by,
      }));
    },
  };
}

function fromVerColumns(row: VerRow): DocumentVersionRecord {
  return {
    id: row.ROWID,
    documentId: row.document_id,
    versionNumber: Number(row.version_number),
    fileId: row.file_id,
    status: row.status as DocumentVersionRecord["status"],
    expiryDate: row.expiry_date || null,
    reviewDate: row.review_date || null,
    uploadedBy: row.uploaded_by,
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

app.post("/documents", async (req, res) => {
  const safeReq = req as unknown as SafeGuardRequest;
  try {
    const result = await uploadDocument(makeRepo(safeReq.catalystApp), makeAuditLogger(safeReq.catalystApp), safeReq.authContext, req.body);
    res.status(201).json(result);
  } catch (err) {
    handleError(err, res);
  }
});

app.post("/documents/versions/:versionId/submit", async (req, res) => {
  const safeReq = req as unknown as SafeGuardRequest;
  try {
    const version = await submitForApproval(makeRepo(safeReq.catalystApp), makeAuditLogger(safeReq.catalystApp), safeReq.authContext, req.params.versionId);
    res.json(version);
  } catch (err) {
    handleError(err, res);
  }
});

app.post("/documents/versions/:versionId/decide", async (req, res) => {
  const safeReq = req as unknown as SafeGuardRequest;
  try {
    const version = await decideDocumentApproval(
      makeRepo(safeReq.catalystApp),
      makeAuditLogger(safeReq.catalystApp),
      safeReq.authContext,
      req.params.versionId,
      req.body.outcome,
      req.body.notes ?? null,
    );
    res.json(version);
  } catch (err) {
    handleError(err, res);
  }
});

app.post("/documents/versions/:versionId/link", async (req, res) => {
  const safeReq = req as unknown as SafeGuardRequest;
  try {
    const link = await linkEvidence(
      makeRepo(safeReq.catalystApp),
      makeAuditLogger(safeReq.catalystApp),
      safeReq.authContext,
      req.params.versionId,
      req.body.linkedEntityType,
      req.body.linkedEntityId,
    );
    res.status(201).json(link);
  } catch (err) {
    handleError(err, res);
  }
});

/** Detail view — "Supports N records across M frameworks". Control/framework maps are built from
 * the master-data tables directly here rather than in the shared service (which stays storage
 * agnostic), same division of responsibility as api-incidents/api-capa. */
app.get("/documents/versions/:versionId/detail", async (req, res) => {
  const safeReq = req as unknown as SafeGuardRequest;
  try {
    const zcql = safeReq.catalystApp.zcql();

    const links = await makeRepo(safeReq.catalystApp).listLinksForVersion(req.params.versionId);
    const assessmentIds = links
      .filter((l) => l.linkedEntityType === "control_assessment")
      .map((l) => l.linkedEntityId);

    const controlAssessmentControlIds = new Map<string, string>();
    const controlFrameworkIds = new Map<string, string[]>();
    if (assessmentIds.length > 0) {
      const inList = assessmentIds.map((id) => `'${id}'`).join(",");
      const assessmentRows = (await zcql.executeZCQLQuery(
        `select ControlAssessments.ROWID, ControlAssessments.control_id from ControlAssessments where ControlAssessments.ROWID in (${inList})`,
      )) as Array<{ ControlAssessments: { ROWID: string; control_id: string } }>;
      for (const { ControlAssessments: a } of assessmentRows) {
        controlAssessmentControlIds.set(a.ROWID, a.control_id);
      }
      const controlIds = [...new Set(assessmentRows.map((a) => a.ControlAssessments.control_id))];
      if (controlIds.length > 0) {
        const controlInList = controlIds.map((id) => `'${id}'`).join(",");
        const mappingRows = (await zcql.executeZCQLQuery(
          `select ControlFrameworkMappings.control_id, FrameworkRequirements.framework_id
           from ControlFrameworkMappings
           left join FrameworkRequirements on ControlFrameworkMappings.framework_requirement_id = FrameworkRequirements.ROWID
           where ControlFrameworkMappings.control_id in (${controlInList})`,
        )) as Array<{ ControlFrameworkMappings: { control_id: string }; FrameworkRequirements: { framework_id: string } }>;
        for (const row of mappingRows) {
          const list = controlFrameworkIds.get(row.ControlFrameworkMappings.control_id) ?? [];
          list.push(row.FrameworkRequirements.framework_id);
          controlFrameworkIds.set(row.ControlFrameworkMappings.control_id, list);
        }
      }
    }

    const detail = await getDocumentEvidenceDetail(
      makeRepo(safeReq.catalystApp),
      req.params.versionId,
      new Date(),
      controlAssessmentControlIds,
      controlFrameworkIds,
    );
    res.json(detail);
  } catch (err) {
    handleError(err, res);
  }
});

module.exports = app;

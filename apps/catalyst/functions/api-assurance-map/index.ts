import express from "express";

import { propertyScopeClause, withAuthContext, type SafeGuardRequest } from "../shared/middleware/require-permission";
import { isDocumentExpired } from "../shared/pure/document-rules";
import { buildEvidenceMap, type EvidenceMapFilters, type EvidenceMapInputRow } from "../shared/pure/assurance-map";

const app = express();
app.use(express.json());
app.use(withAuthContext);

/**
 * GET /assurance-map?framework=&propertyId=&departmentId=&evidenceStatus=&criticalGapOnly=&expiredEvidenceOnly=&reportRelevantOnly=
 *
 * The core differentiator screen: Framework -> Requirement -> Control -> Evidence ->
 * KPI/Finding/CAPA -> Report, in one response. Assembled here from several joined ZCQL queries
 * (bounded by the master-data-sized Controls/FrameworkRequirements tables, not by incident
 * volume), then filtered/shaped by the pure buildEvidenceMap() — same split as every other
 * Function in this codebase: dumb queries here, real logic in functions/shared/pure/.
 */
app.get("/assurance-map", async (req, res) => {
  const safeReq = req as unknown as SafeGuardRequest;
  const ctx = safeReq.authContext;
  const zcql = safeReq.catalystApp.zcql();

  const filters: EvidenceMapFilters = {
    frameworkCode: typeof req.query.framework === "string" ? req.query.framework : undefined,
    propertyId: typeof req.query.propertyId === "string" ? req.query.propertyId : undefined,
    departmentId: typeof req.query.departmentId === "string" ? req.query.departmentId : undefined,
    evidenceStatus: (req.query.evidenceStatus as EvidenceMapFilters["evidenceStatus"]) || undefined,
    criticalGapOnly: req.query.criticalGapOnly === "true",
    expiredEvidenceOnly: req.query.expiredEvidenceOnly === "true",
    reportRelevantOnly: req.query.reportRelevantOnly === "true",
  };

  // Mapped controls, joined up to their framework requirement and framework code.
  const mappingRows = (await zcql.executeZCQLQuery(
    `select Controls.ROWID, Controls.control_code, Controls.title, Controls.is_life_safety_critical, Controls.is_legal,
            FrameworkRequirements.ROWID, FrameworkRequirements.clause_reference, FrameworkRequirements.title,
            Frameworks.code
     from ControlFrameworkMappings
     left join Controls on ControlFrameworkMappings.control_id = Controls.ROWID
     left join FrameworkRequirements on ControlFrameworkMappings.framework_requirement_id = FrameworkRequirements.ROWID
     left join Frameworks on FrameworkRequirements.framework_id = Frameworks.ROWID`,
  )) as Array<{
    Controls: { ROWID: string; control_code: string; title: string; is_life_safety_critical: string; is_legal: string };
    FrameworkRequirements: { ROWID: string; clause_reference: string; title: string };
    Frameworks: { code: string };
  }>;

  const controlIds = [...new Set(mappingRows.map((r) => r.Controls.ROWID))];

  // Latest assessment scores per (control, property) — property-scoped via propertyScopeClause.
  const assessmentRows = controlIds.length
    ? ((await zcql.executeZCQLQuery(
        `select ControlAssessments.control_id, ControlAssessments.property_id, ControlAssessments.dimension, ControlAssessments.maturity_score
         from ControlAssessments
         where ${propertyScopeClause(ctx)} && ControlAssessments.control_id in (${controlIds.map((id) => `'${id}'`).join(",")})`,
      )) as Array<{ ControlAssessments: { control_id: string; property_id: string; dimension: string; maturity_score: string } }>)
    : [];

  const openGapRows = controlIds.length
    ? ((await zcql.executeZCQLQuery(
        `select CriticalGaps.control_id, CriticalGaps.property_id from CriticalGaps
         where ${propertyScopeClause(ctx)} && CriticalGaps.resolved_at is null && CriticalGaps.control_id in (${controlIds.map((id) => `'${id}'`).join(",")})`,
      )) as Array<{ CriticalGaps: { control_id: string; property_id: string } }>)
    : [];
  const openGapKeys = new Set(openGapRows.map((r) => `${r.CriticalGaps.control_id}:${r.CriticalGaps.property_id}`));

  // Evidence links: DocumentEvidenceLinks where linked_entity_type='control_assessment', joined
  // through to the assessment's control and the document version's expiry/status.
  const evidenceRows = (await zcql.executeZCQLQuery(
    `select DocumentEvidenceLinks.linked_entity_id, DocumentVersions.expiry_date, DocumentVersions.status, ControlAssessments.control_id
     from DocumentEvidenceLinks
     left join ControlAssessments on DocumentEvidenceLinks.linked_entity_id = ControlAssessments.ROWID
     left join DocumentVersions on DocumentEvidenceLinks.document_version_id = DocumentVersions.ROWID
     where DocumentEvidenceLinks.linked_entity_type == 'control_assessment'`,
  )) as Array<{
    DocumentEvidenceLinks: { linked_entity_id: string };
    DocumentVersions: { expiry_date: string; status: string };
    ControlAssessments: { control_id: string };
  }>;

  const capaLinkRows = (await zcql.executeZCQLQuery(
    `select AuditFindingCAPALinks.audit_finding_id, AuditFindingCAPALinks.capa_id from AuditFindingCAPALinks`,
  )) as Array<{ AuditFindingCAPALinks: { audit_finding_id: string; capa_id: string } }>;

  const findingRows = (await zcql.executeZCQLQuery(
    `select AuditFindings.ROWID, AuditFindings.control_id from AuditFindings where AuditFindings.control_id is not null`,
  )) as Array<{ AuditFindings: { ROWID: string; control_id: string } }>;

  const asOf = new Date();
  const inputRows: EvidenceMapInputRow[] = [];
  const propertyIdForRow = filters.propertyId ?? ctx.propertyIds[0] ?? null;

  for (const m of mappingRows) {
    const controlId = m.Controls.ROWID;
    const scopedAssessments = assessmentRows.filter(
      (a) => a.ControlAssessments.control_id === controlId && (!propertyIdForRow || a.ControlAssessments.property_id === propertyIdForRow),
    );
    const latestScores: Record<string, number> = {};
    for (const a of scopedAssessments) {
      latestScores[a.ControlAssessments.dimension] = Number(a.ControlAssessments.maturity_score);
    }

    const hasOpenCriticalGap = propertyIdForRow
      ? openGapKeys.has(`${controlId}:${propertyIdForRow}`)
      : [...openGapKeys].some((k) => k.startsWith(`${controlId}:`));

    const controlEvidence = evidenceRows.filter((e) => e.ControlAssessments?.control_id === controlId);
    const findingIds = findingRows.filter((f) => f.AuditFindings.control_id === controlId).map((f) => f.AuditFindings.ROWID);
    const capaIds = capaLinkRows
      .filter((c) => findingIds.includes(c.AuditFindingCAPALinks.audit_finding_id))
      .map((c) => c.AuditFindingCAPALinks.capa_id);

    inputRows.push({
      frameworkCode: m.Frameworks.code,
      requirementRef: m.FrameworkRequirements.clause_reference,
      requirementTitle: m.FrameworkRequirements.title,
      controlId,
      controlCode: m.Controls.control_code,
      controlTitle: m.Controls.title,
      propertyId: propertyIdForRow,
      departmentId: null,
      latestScores,
      hasOpenCriticalGap,
      evidenceLinks: controlEvidence.map((e) => ({
        documentVersionId: e.DocumentEvidenceLinks.linked_entity_id,
        isCurrentlyValid: e.DocumentVersions.status === "approved" && !isDocumentExpired(e.DocumentVersions.expiry_date || null, asOf),
      })),
      linkedKpiCodes: m.Frameworks.code === "ISO45001" ? ["ISO45001_READINESS"] : m.Frameworks.code === "MU_LEGAL" ? ["LEGAL_COMPLIANCE"] : [],
      linkedFindingIds: findingIds,
      linkedCapaIds: capaIds,
      reportRelevant: m.Controls.is_life_safety_critical === "true" || m.Controls.is_legal === "true",
    });
  }

  res.json({ rows: buildEvidenceMap(inputRows, filters), generatedAt: new Date().toISOString() });
});

module.exports = app;

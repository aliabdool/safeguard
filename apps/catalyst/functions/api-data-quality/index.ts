import express from "express";

import type { CatalystApp } from "../shared/middleware/auth-context";
import { propertyScopeClause, withAuthContext, type SafeGuardRequest } from "../shared/middleware/require-permission";
import { isDocumentExpired } from "../shared/pure/document-rules";
import { scanForExceptions, type DataQualityCandidates, type DataQualityExceptionRecord, type DataQualityRepo } from "../shared/services/data-quality-service";
import type { DataQualityException } from "../shared/pure/data-quality-rules";

const app = express();
app.use(express.json());
app.use(withAuthContext);

interface DqRow extends Record<string, string> {
  ROWID: string;
  severity: string;
  module: string;
  record_id: string;
  property_id: string;
  description: string;
  suggested_fix: string;
}

function makeRepo(catalystApp: CatalystApp, scopeClause: string): DataQualityRepo {
  const datastore = catalystApp.datastore();
  return {
    async listOpenExceptions() {
      const rows = (await datastore.table("DataQualityExceptions").getRows({
        criteria: `DataQualityExceptions.status == 'open' && ${scopeClause}`,
      })) as DqRow[];
      return rows.map(
        (r): DataQualityExceptionRecord => ({
          id: r.ROWID,
          severity: r.severity as DataQualityException["severity"],
          module: r.module,
          recordId: r.record_id,
          propertyId: r.property_id || null,
          description: r.description,
          suggestedFix: r.suggested_fix,
          status: "open",
        }),
      );
    },
    async insertException(exc) {
      const inserted = await datastore.table("DataQualityExceptions").insertRow({
        severity: exc.severity,
        module: exc.module,
        record_id: exc.recordId,
        property_id: exc.propertyId,
        description: exc.description,
        suggested_fix: exc.suggestedFix,
        status: "open",
      });
      return { ...exc, id: String(inserted.ROWID), status: "open" };
    },
    async resolveException(id) {
      await datastore.table("DataQualityExceptions").updateRow({
        ROWID: id,
        status: "resolved",
        resolved_at: new Date().toISOString(),
      });
    },
  };
}

app.get("/data-quality/exceptions", async (req, res) => {
  const safeReq = req as unknown as SafeGuardRequest;
  const repo = makeRepo(safeReq.catalystApp, propertyScopeClause(safeReq.authContext, "DataQualityExceptions.property_id"));
  res.json(await repo.listOpenExceptions());
});

/**
 * POST /data-quality/scan — gathers candidate records across every scoped module and runs all
 * nine rules. Also called by the Cron notifications function (Phase 13) on a schedule; exposed
 * here too so an admin can trigger an on-demand rescan from the Data Quality Exceptions screen.
 */
app.post("/data-quality/scan", async (req, res) => {
  const safeReq = req as unknown as SafeGuardRequest;
  const ctx = safeReq.authContext;
  const zcql = safeReq.catalystApp.zcql();
  const scope = propertyScopeClause(ctx);

  const asOf = new Date();
  const candidates: DataQualityCandidates = {
    kpis: [],
    investigations: [],
    capas: [],
    expiredEvidenceLinks: [],
    hospitalReferralIncidents: [],
    closedFindings: [],
    scoredControls: [],
    materialTopics: [],
    climateRisks: [],
  };

  const investigationRows = (await zcql.executeZCQLQuery(
    `select IncidentInvestigation.ROWID, IncidentInvestigation.status, IncidentInvestigation.completed_at, Incidents.property_id
     from IncidentInvestigation left join Incidents on IncidentInvestigation.incident_id = Incidents.ROWID
     where Incidents.${scope}`,
  )) as Array<{ IncidentInvestigation: { ROWID: string; status: string; completed_at: string }; Incidents: { property_id: string } }>;
  candidates.investigations = investigationRows.map((r) => ({
    id: r.IncidentInvestigation.ROWID,
    propertyId: r.Incidents.property_id,
    status: r.IncidentInvestigation.status,
    completedAt: r.IncidentInvestigation.completed_at || null,
  }));

  const capaRows = (await zcql.executeZCQLQuery(
    `select CAPA.ROWID, CAPA.property_id, CAPA.due_date, CAPA.status from CAPA where ${scope} && CAPA.status != 'closed' && CAPA.status != 'verified'`,
  )) as Array<{ CAPA: { ROWID: string; property_id: string; due_date: string; status: string } }>;
  for (const { CAPA: c } of capaRows) {
    const verifications = (await zcql.executeZCQLQuery(
      `select CAPAVerification.ROWID from CAPAVerification where CAPAVerification.capa_id == '${c.ROWID}'`,
    )) as Array<{ CAPAVerification: { ROWID: string } }>;
    candidates.capas.push({ id: c.ROWID, propertyId: c.property_id, dueDate: c.due_date, status: c.status, hasVerification: verifications.length > 0 });
  }

  const evidenceRows = (await zcql.executeZCQLQuery(
    `select DocumentEvidenceLinks.ROWID, DocumentEvidenceLinks.linked_entity_type, DocumentEvidenceLinks.linked_entity_id,
            DocumentVersions.expiry_date, DocumentVersions.status
     from DocumentEvidenceLinks left join DocumentVersions on DocumentEvidenceLinks.document_version_id = DocumentVersions.ROWID`,
  )) as Array<{
    DocumentEvidenceLinks: { ROWID: string; linked_entity_type: string; linked_entity_id: string };
    DocumentVersions: { expiry_date: string; status: string };
  }>;
  candidates.expiredEvidenceLinks = evidenceRows
    .filter((r) => isDocumentExpired(r.DocumentVersions.expiry_date || null, asOf))
    .map((r) => ({
      id: r.DocumentEvidenceLinks.ROWID,
      propertyId: null,
      isExpired: true,
      linkedEntityType: r.DocumentEvidenceLinks.linked_entity_type,
      linkedEntityId: r.DocumentEvidenceLinks.linked_entity_id,
    }));

  const hospitalRows = (await zcql.executeZCQLQuery(
    `select Incidents.ROWID, Incidents.property_id, Incidents.occurred_at, IncidentOSHReportability.reportable_status
     from Incidents left join IncidentOSHReportability on Incidents.ROWID = IncidentOSHReportability.incident_id
     where Incidents.${scope} && Incidents.hospital_referral == true`,
  )) as Array<{ Incidents: { ROWID: string; property_id: string; occurred_at: string }; IncidentOSHReportability: { reportable_status: string } }>;
  candidates.hospitalReferralIncidents = hospitalRows.map((r) => ({
    id: r.Incidents.ROWID,
    propertyId: r.Incidents.property_id,
    hospitalReferral: true,
    reportableStatus: r.IncidentOSHReportability?.reportable_status ?? "pending_determination",
    occurredAt: r.Incidents.occurred_at,
  }));

  const findingRows = (await zcql.executeZCQLQuery(
    `select AuditFindings.ROWID, Audits.property_id, AuditFindings.status
     from AuditFindings left join Audits on AuditFindings.audit_id = Audits.ROWID
     where Audits.${scope} && AuditFindings.status == 'closed'`,
  )) as Array<{ AuditFindings: { ROWID: string; status: string }; Audits: { property_id: string } }>;
  for (const { AuditFindings: f, Audits: a } of findingRows) {
    const evidence = (await zcql.executeZCQLQuery(
      `select DocumentEvidenceLinks.ROWID from DocumentEvidenceLinks where DocumentEvidenceLinks.linked_entity_type == 'audit_finding' && DocumentEvidenceLinks.linked_entity_id == '${f.ROWID}'`,
    )) as Array<{ DocumentEvidenceLinks: { ROWID: string } }>;
    candidates.closedFindings.push({ id: f.ROWID, propertyId: a.property_id, status: f.status, hasEvidence: evidence.length > 0 });
  }

  const assessmentRows = (await zcql.executeZCQLQuery(
    `select ControlAssessments.ROWID, ControlAssessments.property_id, ControlAssessments.maturity_score
     from ControlAssessments where ${scope}`,
  )) as Array<{ ControlAssessments: { ROWID: string; property_id: string; maturity_score: string } }>;
  for (const { ControlAssessments: a } of assessmentRows) {
    const evidence = (await zcql.executeZCQLQuery(
      `select DocumentEvidenceLinks.ROWID, DocumentVersions.status from DocumentEvidenceLinks
       left join DocumentVersions on DocumentEvidenceLinks.document_version_id = DocumentVersions.ROWID
       where DocumentEvidenceLinks.linked_entity_type == 'control_assessment' && DocumentEvidenceLinks.linked_entity_id == '${a.ROWID}' && DocumentVersions.status == 'approved'`,
    )) as Array<{ DocumentEvidenceLinks: { ROWID: string } }>;
    candidates.scoredControls.push({
      id: a.ROWID,
      propertyId: a.property_id,
      maturityScore: Number(a.maturity_score),
      hasApprovedEvidence: evidence.length > 0,
    });
  }

  const topicRows = (await zcql.executeZCQLQuery(
    `select MaterialTopics.ROWID, MaterialTopics.property_id, MaterialTopics.ifrs_financial_materiality_score from MaterialTopics`,
  )) as Array<{ MaterialTopics: { ROWID: string; property_id: string; ifrs_financial_materiality_score: string } }>;
  candidates.materialTopics = topicRows.map((r) => ({
    id: r.MaterialTopics.ROWID,
    propertyId: r.MaterialTopics.property_id || null,
    ifrsFinancialMaterialityScore: r.MaterialTopics.ifrs_financial_materiality_score ? Number(r.MaterialTopics.ifrs_financial_materiality_score) : null,
  }));

  const climateRows = (await zcql.executeZCQLQuery(
    `select ClimateRisks.ROWID, ClimateRisks.property_id, ClimateRisks.residual_risk_score from ClimateRisks where ${scope}`,
  )) as Array<{ ClimateRisks: { ROWID: string; property_id: string; residual_risk_score: string } }>;
  candidates.climateRisks = climateRows.map((r) => ({
    id: r.ClimateRisks.ROWID,
    propertyId: r.ClimateRisks.property_id,
    residualRiskScore: r.ClimateRisks.residual_risk_score ? Number(r.ClimateRisks.residual_risk_score) : null,
  }));

  const repo = makeRepo(safeReq.catalystApp, propertyScopeClause(ctx, "DataQualityExceptions.property_id"));
  const result = await scanForExceptions(repo, candidates, asOf);
  res.json({ openedCount: result.opened.length, resolvedCount: result.resolvedIds.length });
});

module.exports = app;

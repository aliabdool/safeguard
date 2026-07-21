import express from "express";

import type { CatalystApp } from "../shared/middleware/auth-context";
import {
  propertyScopeClause,
  requireExplicitPermission,
  withAuthContext,
  type SafeGuardRequest,
} from "../shared/middleware/require-permission";
import { isAdmin } from "../shared/pure/permissions";
import { financialYearFor, previousFinancialYear, sameperiodYtdComparison } from "../shared/pure/period";
import { calculateKpi, type KpiPeriodParams } from "../shared/services/kpi-service";
import { makeKpiDatastoreRepo } from "../shared/adapters/kpi-datastore-repo";
import { generateBoardNarrative } from "../shared/pure/board-narrative";
import { buildAssurancePackMarkdown, type OpenFindingRow } from "../shared/pure/assurance-pack";
import type { DataQualityRow, KpiTileResult } from "../shared/pure/kpi-types";
import { recordExport, type AuditEntry, type AuditLogger, type ReportRepo, type ReportType } from "../shared/services/report-service";

const app = express();
app.use(express.json());
app.use(withAuthContext);

/** The KPI codes the board narrative and assurance pack pull from — matches the codes those pure
 * generators look up by name (findKpi()) in board-narrative.ts. */
const NARRATIVE_KPI_CODES = [
  "TOTAL_INCIDENTS", "FATALITIES", "LTI", "HIGH_POTENTIAL", "NEAR_MISSES",
  "RECORDABLE_INJURIES", "HOSPITAL_REFERRALS", "REPORTABLE_OSH_CASES", "MTC", "INCIDENT_COST",
  "CAPA_EFFECTIVENESS", "CAPA_ON_TIME", "OPEN_CRIT_MAJOR_FINDINGS",
  "ISO45001_READINESS", "LEGAL_COMPLIANCE",
];

function makeReportRepo(catalystApp: CatalystApp): ReportRepo {
  return {
    async insertReportExport(entry) {
      const inserted = await catalystApp.datastore().table("ReportExports").insertRow({
        report_type: entry.reportType,
        exported_by: entry.exportedBy,
        filters_json: JSON.stringify(entry.filters),
        record_count: entry.recordCount,
      });
      return { ...entry, id: String(inserted.ROWID) };
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

async function gatherKpiTiles(safeReq: SafeGuardRequest, propertyId: string | null): Promise<KpiTileResult[]> {
  const ctx = safeReq.authContext;
  const repo = makeKpiDatastoreRepo(safeReq.catalystApp, ctx.propertyIds, isAdmin(ctx) || ctx.roleCodes.includes("EXECUTIVE_READONLY"));
  const asOf = new Date();
  const { period: currentPeriod } = financialYearFor(asOf);
  const comparisonPeriodFull = previousFinancialYear(currentPeriod);
  const { comparisonEnd } = sameperiodYtdComparison(currentPeriod, comparisonPeriodFull, asOf);
  const params: KpiPeriodParams = {
    propertyId,
    departmentId: null,
    periodStart: currentPeriod.start.toISOString().slice(0, 10),
    periodEnd: (asOf < currentPeriod.end ? asOf : currentPeriod.end).toISOString().slice(0, 10),
    comparisonPeriodStart: comparisonPeriodFull.start.toISOString().slice(0, 10),
    comparisonPeriodEnd: comparisonEnd.toISOString().slice(0, 10),
  };
  const tiles: KpiTileResult[] = [];
  for (const code of NARRATIVE_KPI_CODES) {
    const tile = await calculateKpi(repo, code, params);
    if (tile) tiles.push(tile);
  }
  return tiles;
}

async function gatherDataQualityRows(safeReq: SafeGuardRequest): Promise<DataQualityRow[]> {
  const zcql = safeReq.catalystApp.zcql();
  const rows = (await zcql.executeZCQLQuery(
    `select DataQualityExceptions.module, count(DataQualityExceptions.ROWID) as n
     from DataQualityExceptions where ${propertyScopeClause(safeReq.authContext, "DataQualityExceptions.property_id")} && DataQualityExceptions.status == 'open'
     group by DataQualityExceptions.module`,
  )) as Array<{ DataQualityExceptions: { module: string; n: string } }>;
  return rows.map(({ DataQualityExceptions: r }) => ({ label: r.module, count: Number(r.n) }));
}

app.get("/reports/board-narrative", requireExplicitPermission("generate_board_narrative"), async (req, res) => {
  const safeReq = req as unknown as SafeGuardRequest;
  const propertyId = typeof req.query.propertyId === "string" ? req.query.propertyId : null;
  const financialYear = typeof req.query.financialYear === "string" ? req.query.financialYear : null;

  const kpis = await gatherKpiTiles(safeReq, propertyId);
  const dataQuality = await gatherDataQualityRows(safeReq);
  const fyLabel = financialYear ?? financialYearFor(new Date()).fyLabel;

  const narrative = generateBoardNarrative({
    fyLabel,
    propertyLabel: propertyId ?? "All properties",
    generatedAt: new Date(),
    kpis,
    dataQuality,
  });

  await recordExport(
    makeReportRepo(safeReq.catalystApp),
    makeAuditLogger(safeReq.catalystApp),
    safeReq.authContext,
    "board_narrative",
    { propertyId, financialYear: fyLabel },
    kpis.length,
  );

  res.type("text/markdown").send(narrative);
});

app.get("/reports/assurance-pack", requireExplicitPermission("export_assurance_pack"), async (req, res) => {
  const safeReq = req as unknown as SafeGuardRequest;
  const ctx = safeReq.authContext;
  const zcql = safeReq.catalystApp.zcql();
  const propertyId = typeof req.query.propertyId === "string" ? req.query.propertyId : null;
  const financialYear = typeof req.query.financialYear === "string" ? req.query.financialYear : null;

  const kpis = await gatherKpiTiles(safeReq, propertyId);
  const dataQuality = await gatherDataQualityRows(safeReq);
  const fyLabel = financialYear ?? financialYearFor(new Date()).fyLabel;

  const gapScope = propertyId ? `CriticalGaps.property_id == '${propertyId}'` : propertyScopeClause(ctx, "CriticalGaps.property_id");
  const gapRows = (await zcql.executeZCQLQuery(
    `select count(CriticalGaps.ROWID) as n from CriticalGaps where ${gapScope} && CriticalGaps.resolved_at is null`,
  )) as Array<{ CriticalGaps: { n: string } }>;

  const findingScope = propertyId ? `Audits.property_id == '${propertyId}'` : propertyScopeClause(ctx, "Audits.property_id");
  const findingRows = (await zcql.executeZCQLQuery(
    `select AuditFindings.ROWID, AuditFindings.classification, AuditFindings.description, Controls.control_code
     from AuditFindings left join Audits on AuditFindings.audit_id = Audits.ROWID
     left join Controls on AuditFindings.control_id = Controls.ROWID
     where ${findingScope} && AuditFindings.classification in ('critical_nc','major_nc') && AuditFindings.status != 'closed'`,
  )) as Array<{ AuditFindings: { ROWID: string; classification: string; description: string }; Controls: { control_code: string } | null }>;
  const openFindings: OpenFindingRow[] = findingRows.map((r) => ({
    findingNumber: r.AuditFindings.ROWID,
    classification: r.AuditFindings.classification,
    controlCode: r.Controls?.control_code ?? null,
    description: r.AuditFindings.description,
  }));

  const capaScope = propertyId ? `CAPA.property_id == '${propertyId}'` : propertyScopeClause(ctx, "CAPA.property_id");
  const capaRows = (await zcql.executeZCQLQuery(
    `select CAPA.status, count(CAPA.ROWID) as n from CAPA where ${capaScope} group by CAPA.status`,
  )) as Array<{ CAPA: { status: string; n: string } }>;
  const capaStatusCounts: Record<string, number> = {};
  for (const { CAPA: c } of capaRows) capaStatusCounts[c.status] = Number(c.n);

  const pack = buildAssurancePackMarkdown({
    fyLabel,
    propertyLabel: propertyId ?? "All properties",
    generatedAt: new Date(),
    kpis,
    criticalGapControlCount: Number(gapRows[0]?.CriticalGaps.n ?? 0),
    openFindings,
    capaStatusCounts,
    dataQuality,
  });

  await recordExport(
    makeReportRepo(safeReq.catalystApp),
    makeAuditLogger(safeReq.catalystApp),
    ctx,
    "assurance_pack",
    { propertyId, financialYear: fyLabel },
    kpis.length + openFindings.length,
  );

  res.type("text/markdown").send(pack);
});

/** The six raw-data exports — permission-controlled (export_reports), audit logged, timestamped,
 * filters recorded, same as the two narrative exports above. */
const RAW_EXPORT_TABLES: Record<string, { table: string; reportType: ReportType }> = {
  kpi: { table: "KPISnapshots", reportType: "kpi_export" },
  incidents: { table: "Incidents", reportType: "incident_export" },
  capa: { table: "CAPA", reportType: "capa_export" },
  audits: { table: "AuditFindings", reportType: "audit_export" },
};

app.get("/reports/export/:type", requireExplicitPermission("export_reports"), async (req, res) => {
  const safeReq = req as unknown as SafeGuardRequest;

  if (req.params.type === "evidence-map" || req.params.type === "framework-readiness") {
    const table = req.params.type === "evidence-map" ? "DocumentEvidenceLinks" : "FrameworkReadinessSnapshots";
    const reportType: ReportType = req.params.type === "evidence-map" ? "evidence_map_export" : "framework_readiness_export";
    const rows = await safeReq.catalystApp.datastore().table(table).getRows({});
    await recordExport(makeReportRepo(safeReq.catalystApp), makeAuditLogger(safeReq.catalystApp), safeReq.authContext, reportType, { ...req.query }, rows.length);
    res.json({ rows, exportedAt: new Date().toISOString() });
    return;
  }

  const config = RAW_EXPORT_TABLES[req.params.type ?? ""];
  if (!config) {
    res.status(404).json({ error: "Unknown export type." });
    return;
  }
  const datastore = safeReq.catalystApp.datastore();
  const rows = await datastore.table(config.table).getRows({
    criteria: propertyScopeClause(safeReq.authContext, `${config.table}.property_id`),
  });

  await recordExport(
    makeReportRepo(safeReq.catalystApp),
    makeAuditLogger(safeReq.catalystApp),
    safeReq.authContext,
    config.reportType,
    { ...req.query },
    rows.length,
  );

  res.json({ rows, exportedAt: new Date().toISOString() });
});

module.exports = app;

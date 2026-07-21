import express from "express";

import { propertyScopeClause, withAuthContext, type SafeGuardRequest } from "../shared/middleware/require-permission";
import { isAdmin } from "../shared/pure/permissions";
import { computeRagStatus, computeVariance } from "../shared/pure/rag";
import type { KpiTileResult } from "../shared/pure/kpi-types";

const app = express();
app.use(express.json());
app.use(withAuthContext);

/**
 * GET /dashboard/summary?propertyId=&financialYear=
 *
 * ONE response for the whole Assurance Command Centre dashboard — Improvement 1 and Improvement
 * 12 (performance) explicitly require this: no per-tile round trips. Everything below reads from
 * precomputed tables (KPISnapshots, CriticalGaps, DataQualityExceptions) rather than
 * recalculating 22 KPIs live on every page load — the live calculation only happens on-demand,
 * from the KPI Centre's own "View calculation" drill-down (a separate, lazy-loaded endpoint),
 * matching brief §12's "lazy-load drilldowns only when clicked."
 *
 * Every list query below goes through propertyScopeClause(ctx) — this is the enforcement point
 * that stands in for what Postgres RLS did automatically in the Supabase build. Removing it from
 * any one of these queries is a cross-hotel data leak, not a style choice.
 */
app.get("/dashboard/summary", async (req, res) => {
  const safeReq = req as SafeGuardRequest;
  const ctx = safeReq.authContext;
  const zcql = safeReq.catalystApp.zcql();

  const requestedPropertyId = typeof req.query.propertyId === "string" ? req.query.propertyId : null;
  const financialYear = typeof req.query.financialYear === "string" ? req.query.financialYear : currentFyLabel();

  // A user asking for a specific property must actually have access to it — asking for "all
  // properties" (requestedPropertyId absent) is fine and just falls back to the scope clause.
  if (requestedPropertyId && !isAdmin(ctx) && !ctx.propertyIds.includes(requestedPropertyId)) {
    res.status(403).json({ error: "No access to this property." });
    return;
  }

  const scope = requestedPropertyId
    ? `property_id == '${requestedPropertyId}'`
    : propertyScopeClause(ctx);

  const [
    safetyStatus,
    capaStatus,
    criticalGaps,
    auditStatus,
    kpiOverview,
    dataQualityCount,
  ] = await Promise.all([
    getSafetyStatusOverview(zcql, scope, financialYear),
    getCapaStatus(zcql, scope),
    getCriticalGapsPreview(zcql, scope),
    getAuditStatus(zcql, scope),
    getKpiOverview(zcql, scope, financialYear),
    getDataQualityExceptionCount(zcql, scope),
  ]);

  const boardAlerts = buildBoardAlertPanel({ safetyStatus, criticalGaps, capaStatus });

  res.json({
    scope: { propertyId: requestedPropertyId, financialYear },
    safetyStatus,
    capaStatus,
    criticalGaps,
    auditStatus,
    kpiOverview,
    assuranceReadiness: {
      evidenceCompletenessPct: kpiOverview.evidenceCompletenessPct,
      dataQualityExceptionCount: dataQualityCount,
      openAssuranceBlockers: criticalGaps.length,
    },
    boardAlerts,
    generatedAt: new Date().toISOString(),
  });
});

// ---------------------------------------------------------------------------------------------
// Section queries — each is one ZCQL aggregate query, not a row fetch + in-memory count, to stay
// well inside the 30s Advanced I/O execution limit even at full 10-hotel scale.
// ---------------------------------------------------------------------------------------------

async function getSafetyStatusOverview(
  zcql: SafeGuardRequest["catalystApp"] extends { zcql(): infer Z } ? Z : never,
  scope: string,
  financialYear: string,
) {
  const { start, end } = fyBounds(financialYear);
  const rows = (await zcql.executeZCQLQuery(
    `select Incidents.person_type, Incidents.outcome, Incidents.hospital_referral, Incidents.reportable_status, count(Incidents.ROWID) as n
     from Incidents
     where ${scope} and Incidents.occurred_at between '${start}' and '${end}'
     group by Incidents.person_type, Incidents.outcome, Incidents.hospital_referral, Incidents.reportable_status`,
  )) as Array<{
    Incidents: {
      person_type: string;
      outcome: string;
      hospital_referral: string;
      reportable_status: string;
      n: string;
    };
  }>;

  let total = 0;
  let fatalities = 0;
  let hospitalReferrals = 0;
  let statutoryReportable = 0;
  let nearMisses = 0;
  let unsafeConditions = 0;
  let serious = 0;

  for (const { Incidents: r } of rows) {
    const n = Number(r.n);
    total += n;
    if (r.outcome === "fatality") fatalities += n;
    if (r.hospital_referral === "true") hospitalReferrals += n;
    if (r.reportable_status === "yes") statutoryReportable += n;
    if (r.person_type === "near_miss") nearMisses += n;
    if (r.person_type === "unsafe_condition") unsafeConditions += n;
    if (r.outcome === "fatality" || r.outcome === "hospitalisation" || r.outcome === "lost_time_injury") {
      serious += n;
    }
  }

  return { total, fatalities, seriousIncidents: serious, statutoryReportable, hospitalReferrals, nearMisses, unsafeConditions };
}

async function getCapaStatus(
  zcql: SafeGuardRequest["catalystApp"] extends { zcql(): infer Z } ? Z : never,
  scope: string,
) {
  const today = new Date().toISOString().slice(0, 10);
  const rows = (await zcql.executeZCQLQuery(
    `select CAPA.status, count(CAPA.ROWID) as n from CAPA where ${scope} group by CAPA.status`,
  )) as Array<{ CAPA: { status: string; n: string } }>;

  const byStatus = Object.fromEntries(rows.map(({ CAPA }) => [CAPA.status, Number(CAPA.n)]));

  const overdueRows = (await zcql.executeZCQLQuery(
    `select count(CAPA.ROWID) as n from CAPA where ${scope} and CAPA.due_date < '${today}' and CAPA.status not in ('closed', 'verified')`,
  )) as Array<{ CAPA: { n: string } }>;

  return {
    open: byStatus.open ?? 0,
    inProgress: byStatus.in_progress ?? 0,
    pendingVerification: byStatus.pending_verification ?? 0,
    verified: byStatus.verified ?? 0,
    closed: byStatus.closed ?? 0,
    overdue: Number(overdueRows[0]?.CAPA.n ?? 0),
  };
}

async function getCriticalGapsPreview(
  zcql: SafeGuardRequest["catalystApp"] extends { zcql(): infer Z } ? Z : never,
  scope: string,
) {
  // Top 10 only — the dashboard shows a preview, the full list lives on the Controls/Frameworks
  // screen. Keeping this small is part of what keeps the batch endpoint fast.
  const rows = (await zcql.executeZCQLQuery(
    `select CriticalGaps.ROWID, CriticalGaps.control_id, CriticalGaps.property_id, CriticalGaps.reason, CriticalGaps.identified_at
     from CriticalGaps where ${scope} and CriticalGaps.resolved_at is null
     order by CriticalGaps.identified_at desc limit 10`,
  )) as Array<{
    CriticalGaps: { ROWID: string; control_id: string; property_id: string; reason: string; identified_at: string };
  }>;
  return rows.map(({ CriticalGaps: g }) => ({
    id: g.ROWID,
    controlId: g.control_id,
    propertyId: g.property_id,
    reason: g.reason,
    identifiedAt: g.identified_at,
  }));
}

async function getAuditStatus(
  zcql: SafeGuardRequest["catalystApp"] extends { zcql(): infer Z } ? Z : never,
  scope: string,
) {
  const rows = (await zcql.executeZCQLQuery(
    `select AuditFindings.classification, count(AuditFindings.ROWID) as n
     from AuditFindings left join Audits on AuditFindings.audit_id = Audits.ROWID
     where Audits.${scope} and AuditFindings.status != 'closed'
     group by AuditFindings.classification`,
  )) as Array<{ AuditFindings: { classification: string; n: string } }>;
  const byClass = Object.fromEntries(rows.map(({ AuditFindings }) => [AuditFindings.classification, Number(AuditFindings.n)]));
  return {
    openCritical: byClass.critical_nc ?? 0,
    openMajor: byClass.major_nc ?? 0,
    openMinor: byClass.minor_nc ?? 0,
  };
}

async function getKpiOverview(
  zcql: SafeGuardRequest["catalystApp"] extends { zcql(): infer Z } ? Z : never,
  scope: string,
  financialYear: string,
) {
  // Reads the latest KPISnapshots row per KPI/scope rather than recalculating — Improvement 2 and
  // §12. A snapshot is refreshed by a Cron function (Phase 13), or on-demand when a user opens
  // that specific KPI's drill-down, never synchronously for the whole dashboard.
  const rows = (await zcql.executeZCQLQuery(
    `select KPISnapshots.kpi_code, KPISnapshots.current_value, KPISnapshots.comparison_value,
            KPISnapshots.target, KPISnapshots.direction, KPISnapshots.unit, KPISnapshots.name,
            KPISnapshots.data_quality_status
     from KPISnapshots
     where KPISnapshots.${scope} and KPISnapshots.financial_year = '${financialYear}'`,
  )) as Array<{
    KPISnapshots: {
      kpi_code: string;
      current_value: string | null;
      comparison_value: string | null;
      target: string | null;
      direction: "lower_better" | "higher_better";
      unit: string;
      name: string;
      data_quality_status: string;
    };
  }>;

  const tiles: Array<Pick<KpiTileResult, "kpiCode" | "name" | "unit" | "currentValue" | "comparisonValue" | "target" | "ragStatus" | "varianceAbs" | "variancePct">> =
    rows.map(({ KPISnapshots: s }) => {
      const currentValue = s.current_value != null ? Number(s.current_value) : null;
      const comparisonValue = s.comparison_value != null ? Number(s.comparison_value) : null;
      const target = s.target != null ? Number(s.target) : null;
      const variance = computeVariance(currentValue, comparisonValue);
      return {
        kpiCode: s.kpi_code,
        name: s.name,
        unit: s.unit,
        currentValue,
        comparisonValue,
        target,
        varianceAbs: variance.absolute,
        variancePct: variance.percent,
        ragStatus: computeRagStatus({
          value: currentValue,
          target,
          warningThreshold: null,
          criticalThreshold: null,
          direction: s.direction,
        }),
      };
    });

  const notYetCalculable = 22 - tiles.length;
  const withEvidence = tiles.filter((t) => t.currentValue != null).length;

  return {
    tiles,
    notYetCalculableCount: notYetCalculable > 0 ? notYetCalculable : 0,
    evidenceCompletenessPct: tiles.length ? Math.round((withEvidence / tiles.length) * 100) : 0,
  };
}

async function getDataQualityExceptionCount(
  zcql: SafeGuardRequest["catalystApp"] extends { zcql(): infer Z } ? Z : never,
  scope: string,
) {
  const rows = (await zcql.executeZCQLQuery(
    `select count(DataQualityExceptions.ROWID) as n from DataQualityExceptions where ${scope} and DataQualityExceptions.status = 'open'`,
  )) as Array<{ DataQualityExceptions: { n: string } }>;
  return Number(rows[0]?.DataQualityExceptions.n ?? 0);
}

function buildBoardAlertPanel(params: {
  safetyStatus: Awaited<ReturnType<typeof getSafetyStatusOverview>>;
  criticalGaps: Awaited<ReturnType<typeof getCriticalGapsPreview>>;
  capaStatus: Awaited<ReturnType<typeof getCapaStatus>>;
}) {
  const { safetyStatus, criticalGaps, capaStatus } = params;
  const alerts: Array<{ severity: "critical" | "warning"; message: string }> = [];

  if (safetyStatus.fatalities > 0) {
    alerts.push({
      severity: "critical",
      message: `${safetyStatus.fatalities} fatalit${safetyStatus.fatalities === 1 ? "y" : "ies"} this financial year — requires immediate board attention.`,
    });
  }
  if (safetyStatus.seriousIncidents > 0) {
    alerts.push({ severity: "warning", message: `${safetyStatus.seriousIncidents} serious incident(s) this financial year.` });
  }
  if (safetyStatus.statutoryReportable > 0) {
    alerts.push({ severity: "warning", message: `${safetyStatus.statutoryReportable} statutory-reportable incident(s).` });
  }
  if (criticalGaps.length > 0) {
    alerts.push({ severity: "critical", message: `${criticalGaps.length} critical legal/life-safety control gap(s) open.` });
  }
  if (capaStatus.overdue > 0) {
    alerts.push({ severity: "warning", message: `${capaStatus.overdue} corrective action(s) overdue.` });
  }

  return alerts;
}

function currentFyLabel(): string {
  const now = new Date();
  const fyStartYear = now.getUTCMonth() >= 6 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
  return `FY${fyStartYear + 1}`;
}

function fyBounds(fyLabel: string): { start: string; end: string } {
  const year = Number(fyLabel.replace("FY", ""));
  return { start: `${year - 1}-07-01`, end: `${year}-06-30` };
}

module.exports = app;

import "server-only";

import { catalystAdminApp, type CatalystApp, type CatalystRow } from "@/lib/catalyst/app";
import { computeDataQuality } from "@/server/dashboard/data-quality";
import { calculateKpi, type KpiTileResult } from "@/server/kpi/calculate";
import { financialYearFor } from "@/server/kpi/period";
import type { AuthContext } from "@/server/permissions";

import type { AssurancePackInput, OpenFindingRow } from "./assurance-pack";
import type { BoardNarrativeInput } from "./board-narrative";

/**
 * calculateKpi()/computeDataQuality() both need an AuthContext (Catalyst has no RLS backstop —
 * see server/kpi/scope.ts), but by the time gather.ts runs, the caller (reports/export/actions.ts)
 * has already required an export role and clamped `propertyId` to one the caller can actually see
 * — see resolveScope() there. This synthetic group-wide SYSTEM_CTX stands in for a real session at
 * this call depth (a report-generation helper has no end-user session of its own) and is safe
 * specifically because propertyId is already pre-scoped by the caller; when propertyId is null,
 * this preserves the pre-migration behaviour of querying unscoped rather than restricting to the
 * caller's property set (see the comment on gatherAssurancePackInput's ZCQL queries below — not a
 * new gap introduced by this migration, just consistently preserved).
 */
const SYSTEM_CTX: AuthContext = {
  userId: "system-reporting",
  status: "active",
  roleCodes: ["SUPER_ADMIN"],
  propertyIds: [],
  departmentAccess: new Map(),
  hasMedicalPermission: false,
};

const NARRATIVE_KPI_CODES = [
  "TOTAL_INCIDENTS",
  "FATALITIES",
  "LTI",
  "HIGH_POTENTIAL",
  "NEAR_MISSES",
  "RECORDABLE_INJURIES",
  "HOSPITAL_REFERRALS",
  "REPORTABLE_OSH_CASES",
  "MTC",
  "INCIDENT_COST",
  "CAPA_ON_TIME",
  "CAPA_EFFECTIVENESS",
  "OPEN_CRIT_MAJOR_FINDINGS",
  "ISO45001_READINESS",
  "LEGAL_COMPLIANCE",
];

async function scopeMeta(catalystApp: CatalystApp, propertyId: string | null, asOfAnchor: Date) {
  const { fyLabel, period } = financialYearFor(asOfAnchor);
  let propertyLabel = "All accessible properties";
  if (propertyId) {
    const rows = (await catalystApp.datastore().table("Properties").getRows({
      criteria: `Properties.ROWID == '${propertyId}'`,
      maxRows: 1,
    })) as Array<CatalystRow & { name: string }>;
    propertyLabel = rows[0]?.name ?? propertyLabel;
  }
  return { fyLabel, period, propertyLabel };
}

async function gatherKpis(
  propertyId: string | null,
  asOfAnchor: Date,
): Promise<KpiTileResult[]> {
  const catalystApp = catalystAdminApp();
  const results = await Promise.all(
    NARRATIVE_KPI_CODES.map((code) =>
      calculateKpi(catalystApp, SYSTEM_CTX, code, { propertyId, asOf: asOfAnchor }),
    ),
  );
  return results.filter((r): r is KpiTileResult => r !== null);
}

export async function gatherBoardNarrativeInput(
  catalystApp: CatalystApp,
  propertyId: string | null,
  asOfAnchor: Date,
): Promise<BoardNarrativeInput> {
  const { fyLabel, period, propertyLabel } = await scopeMeta(catalystApp, propertyId, asOfAnchor);
  const [kpis, dataQuality] = await Promise.all([
    gatherKpis(propertyId, asOfAnchor),
    computeDataQuality({
      catalystApp: catalystAdminApp(),
      ctx: SYSTEM_CTX,
      propertyId,
      periodStart: period.start,
      periodEnd: period.end,
    }),
  ]);
  return { fyLabel, propertyLabel, generatedAt: new Date(), kpis, dataQuality };
}

/**
 * Reads CriticalGaps/AuditFindings/CAPA straight out of Catalyst via ZCQL — those tables belong
 * to the framework/audits/capa modules (out of scope for this migration slice, being ported by
 * other engineers in parallel), but this is a read-only cross-cutting report query, not a change
 * to any of those modules' own files. Mirrors the equivalent queries already proven in
 * apps/catalyst/functions/api-reports/index.ts, including using AuditFindings.ROWID as the
 * finding "number" (that table has no separate finding_number column — matching the existing
 * reference implementation rather than inventing a new one).
 */
export async function gatherAssurancePackInput(
  catalystApp: CatalystApp,
  propertyId: string | null,
  asOfAnchor: Date,
): Promise<AssurancePackInput> {
  const { fyLabel, period, propertyLabel } = await scopeMeta(catalystApp, propertyId, asOfAnchor);

  const [kpis, dataQuality] = await Promise.all([
    gatherKpis(propertyId, asOfAnchor),
    computeDataQuality({
      catalystApp: catalystAdminApp(),
      ctx: SYSTEM_CTX,
      propertyId,
      periodStart: period.start,
      periodEnd: period.end,
    }),
  ]);

  const zcql = catalystApp.zcql();

  // Matches the pre-migration behaviour exactly: when no single property is selected, these
  // queries are unscoped (no WHERE predicate) rather than restricted to the caller's accessible
  // property set — same as the Drizzle version's `gapScopePredicate = propertyId ? eq(...) :
  // undefined`. Not a new gap introduced by this migration, just preserved as-is.
  const gapScope = propertyId ? `CriticalGaps.property_id == '${propertyId}' && ` : "";
  const gapRows = (await zcql.executeZCQLQuery(
    `select count(distinct CriticalGaps.control_id) as n from CriticalGaps where ${gapScope}CriticalGaps.resolved_at is null`,
  )) as Array<{ CriticalGaps: { n: string } }>;
  const criticalGapControlCount = Number(gapRows[0]?.CriticalGaps.n ?? 0);

  const findingScope = propertyId ? `Audits.property_id == '${propertyId}' && ` : "";
  const findingRows = (await zcql.executeZCQLQuery(
    `select AuditFindings.ROWID, AuditFindings.classification, AuditFindings.description, Controls.control_code
     from AuditFindings left join Audits on AuditFindings.audit_id = Audits.ROWID
     left join Controls on AuditFindings.control_id = Controls.ROWID
     where ${findingScope}AuditFindings.classification in ('critical_nc','major_nc') && AuditFindings.status != 'closed'`,
  )) as Array<{
    AuditFindings: { ROWID: string; classification: string; description: string };
    Controls: { control_code: string } | null;
  }>;
  const openFindings: OpenFindingRow[] = findingRows.map((r) => ({
    findingNumber: r.AuditFindings.ROWID,
    classification: r.AuditFindings.classification,
    controlCode: r.Controls?.control_code ?? null,
    description: r.AuditFindings.description,
  }));

  const capaScope = propertyId ? ` where CAPA.property_id == '${propertyId}'` : "";
  const capaRows = (await zcql.executeZCQLQuery(
    `select CAPA.status, count(CAPA.ROWID) as n from CAPA${capaScope} group by CAPA.status`,
  )) as Array<{ CAPA: { status: string; n: string } }>;
  const capaStatusCounts: Record<string, number> = {};
  for (const { CAPA: c } of capaRows) {
    capaStatusCounts[c.status] = Number(c.n);
  }

  return {
    fyLabel,
    propertyLabel,
    generatedAt: new Date(),
    kpis,
    criticalGapControlCount,
    openFindings,
    capaStatusCounts,
    dataQuality,
  };
}

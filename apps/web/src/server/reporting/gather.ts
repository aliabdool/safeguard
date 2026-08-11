import "server-only";

import { catalystAdminApp, type CatalystApp, type CatalystRow } from "@/lib/catalyst/app";
import { zcqlString } from "@/lib/catalyst/zcql-escape";
import { mapWithConcurrency } from "@/lib/concurrency";
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
  fullName: "System (reporting)",
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
      criteria: `Properties.ROWID = ${zcqlString(propertyId)}`,
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
  const results = await mapWithConcurrency(NARRATIVE_KPI_CODES, 4, (code) =>
    calculateKpi(catalystApp, SYSTEM_CTX, code, { propertyId, asOf: asOfAnchor }),
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
  // No "as n" alias: confirmed live (see chat) that ZCQL aggregate results — including
  // count(distinct ...) — are keyed by the column name INSIDE the function, not the SQL alias.
  const gapScope = propertyId ? `CriticalGaps.property_id = ${zcqlString(propertyId)} and ` : "";
  const gapRows = (await zcql.executeZCQLQuery(
    `select count(distinct CriticalGaps.control_id) from CriticalGaps where ${gapScope}CriticalGaps.resolved_at is null`,
  )) as Array<{ CriticalGaps: { control_id: string } }>;
  const criticalGapControlCount = Number(gapRows[0]?.CriticalGaps.control_id ?? 0);

  // AuditFindings.audit_id / .control_id are plain Text columns, not real Lookup/FKs to Audits /
  // Controls (same class of bug as the UserRoles/Roles join fixed in server/permissions/index.ts),
  // so Audits/Controls are resolved via separate ROWID-list lookups and joined in application code
  // rather than in ZCQL.
  let findingAuditIds: string[] | null = null;
  if (propertyId) {
    const scopedAuditRows = (await catalystApp.datastore().table("Audits").getRows({
      criteria: `Audits.property_id = ${zcqlString(propertyId)}`,
    })) as unknown as Array<{ ROWID: string }>;
    findingAuditIds = scopedAuditRows.map((a) => a.ROWID);
  }

  const openFindings: OpenFindingRow[] = [];
  if (!findingAuditIds || findingAuditIds.length > 0) {
    const auditIdClause = findingAuditIds
      ? `AuditFindings.audit_id in (${findingAuditIds.map((id) => zcqlString(id)).join(",")}) and `
      : "";
    const findingRows = (await catalystApp.datastore().table("AuditFindings").getRows({
      criteria: `${auditIdClause}AuditFindings.classification in ('critical_nc','major_nc') and AuditFindings.status != 'closed'`,
    })) as unknown as Array<{
      ROWID: string;
      classification: string;
      description: string;
      control_id: string | null;
    }>;

    const controlIds = [...new Set(findingRows.map((r) => r.control_id).filter((id): id is string => !!id))];
    const controlRows =
      controlIds.length > 0
        ? ((await catalystApp.datastore().table("Controls").getRows({
            criteria: `Controls.ROWID in (${controlIds.map((id) => zcqlString(id)).join(",")})`,
          })) as unknown as Array<{ ROWID: string; control_code: string }>)
        : [];
    const controlCodeById = new Map(controlRows.map((c) => [c.ROWID, c.control_code]));

    openFindings.push(
      ...findingRows.map((r) => ({
        findingNumber: r.ROWID,
        classification: r.classification,
        controlCode: r.control_id ? (controlCodeById.get(r.control_id) ?? null) : null,
        description: r.description,
      })),
    );
  }

  const capaScope = propertyId ? ` where CAPA.property_id = ${zcqlString(propertyId)}` : "";
  const capaRows = (await zcql.executeZCQLQuery(
    `select CAPA.status, count(CAPA.ROWID) from CAPA${capaScope} group by CAPA.status`,
  )) as Array<{ CAPA: { status: string; ROWID: string } }>;
  const capaStatusCounts: Record<string, number> = {};
  for (const { CAPA: c } of capaRows) {
    capaStatusCounts[c.status] = Number(c.ROWID);
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

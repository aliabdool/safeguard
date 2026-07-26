import "server-only";

import { and, eq, inArray, ne, sql } from "drizzle-orm";

import { getDb } from "@/db";
import {
  audits,
  auditFindings,
  capaActions,
  controlAssessments,
  controls,
  properties,
} from "@/db/schema";
import { catalystAdminApp } from "@/lib/catalyst/app";
import { computeDataQuality } from "@/server/dashboard/data-quality";
import { calculateKpi, type KpiTileResult } from "@/server/kpi/calculate";
import { financialYearFor } from "@/server/kpi/period";
import type { AuthContext } from "@/server/permissions";

import type { AssurancePackInput } from "./assurance-pack";
import type { BoardNarrativeInput } from "./board-narrative";

/**
 * NOTE (out of scope for the KPI/dashboard migration slice — the reporting module is being
 * migrated separately): this file is still on Drizzle/Postgres for its own data (audits,
 * capaActions, controlAssessments, properties below), while calculateKpi()/computeDataQuality()
 * now query Catalyst Data Store. catalystAdminApp() + the synthetic group-wide SYSTEM_CTX are only
 * a minimal compatibility shim so this file keeps typechecking against their new signatures — a
 * report-generation job has no end-user session at this call depth (the caller already did its
 * own permission check), see lib/catalyst/app.ts. The `propertyId` passed through gatherKpis below
 * is still a Postgres UUID until this module's own Catalyst port lands, so it will not match
 * Catalyst's Properties ROWIDs — a known gap, not something this KPI-module slice fixes.
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

async function scopeMeta(propertyId: string | null, asOfAnchor: Date) {
  const db = getDb();
  const { fyLabel, period } = financialYearFor(asOfAnchor);
  let propertyLabel = "All accessible properties";
  if (propertyId) {
    const [row] = await db
      .select({ name: properties.name })
      .from(properties)
      .where(eq(properties.id, propertyId))
      .limit(1);
    propertyLabel = row?.name ?? propertyLabel;
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
  propertyId: string | null,
  asOfAnchor: Date,
): Promise<BoardNarrativeInput> {
  const { fyLabel, period, propertyLabel } = await scopeMeta(propertyId, asOfAnchor);
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

export async function gatherAssurancePackInput(
  propertyId: string | null,
  asOfAnchor: Date,
): Promise<AssurancePackInput> {
  const db = getDb();
  const { fyLabel, period, propertyLabel } = await scopeMeta(propertyId, asOfAnchor);

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

  const gapScopePredicate = propertyId
    ? eq(controlAssessments.propertyId, propertyId)
    : undefined;
  const criticalGapRows = await db
    .selectDistinct({ controlId: controlAssessments.controlId })
    .from(controlAssessments)
    .where(and(eq(controlAssessments.isCriticalGap, true), gapScopePredicate));

  const auditScopePredicate = propertyId ? eq(audits.propertyId, propertyId) : undefined;
  const scopedAudits = await db
    .select({ id: audits.id })
    .from(audits)
    .where(auditScopePredicate);
  const scopedAuditIds = scopedAudits.map((a) => a.id);

  const openFindingRows =
    scopedAuditIds.length === 0
      ? []
      : await db
          .select({
            findingNumber: auditFindings.findingNumber,
            classification: auditFindings.classification,
            controlCode: controls.controlCode,
            description: auditFindings.description,
          })
          .from(auditFindings)
          .leftJoin(controls, eq(controls.id, auditFindings.controlId))
          .where(
            and(
              inArray(auditFindings.auditId, scopedAuditIds),
              inArray(auditFindings.classification, ["critical_nc", "major_nc"]),
              ne(auditFindings.status, "closed"),
            ),
          );

  const capaScopePredicate = propertyId ? eq(capaActions.propertyId, propertyId) : undefined;
  const capaStatusRows = await db
    .select({ status: capaActions.status, n: sql<number>`count(*)::int` })
    .from(capaActions)
    .where(capaScopePredicate)
    .groupBy(capaActions.status);
  const capaStatusCounts = Object.fromEntries(capaStatusRows.map((r) => [r.status, r.n]));

  return {
    fyLabel,
    propertyLabel,
    generatedAt: new Date(),
    kpis,
    criticalGapControlCount: criticalGapRows.length,
    openFindings: openFindingRows,
    capaStatusCounts,
    dataQuality,
  };
}

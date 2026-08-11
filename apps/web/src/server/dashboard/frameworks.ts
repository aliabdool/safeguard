import "server-only";

import type { CatalystApp, CatalystRow } from "@/lib/catalyst/app";
import { zcqlString } from "@/lib/catalyst/zcql-escape";
import { computeFrameworkRollup, maturityLabel } from "@/server/framework/maturity";
import type { RagStatus } from "@/server/kpi/rag";
import type { AuthContext } from "@/server/permissions";

import { groupScopeClause, type DashboardScope } from "./scope";

/**
 * The 8 disclosure/certification framework rows the CEO dashboard must show (see chat) — a fixed
 * display list independent of whatever rows happen to exist in the live `Frameworks` table, so a
 * framework that hasn't been mapped yet still renders as an honest "not applicable"/"assessment
 * incomplete" row rather than silently disappearing. "SDG" has no matching `Frameworks.code` row
 * anywhere in the live schema (confirmed: only ISO45001, HOTEL_OPS, MU_LEGAL, GRI403, IFRS_S1,
 * IFRS_S2, SASB_HOTELS, UNGC, ILO_OSH exist) — it is deliberately never queried, only ever shown as
 * "Not applicable" (see chat: never fabricate a percentage for a framework with no master record).
 */
export const DISCLOSURE_FRAMEWORKS = [
  { code: "ISO45001", displayName: "ISO 45001:2018 + climate amendment" },
  { code: "GRI403", displayName: "GRI 403 — Occupational Health and Safety" },
  { code: "IFRS_S1", displayName: "ISSB / IFRS S1" },
  { code: "IFRS_S2", displayName: "ISSB / IFRS S2" },
  { code: "SASB_HOTELS", displayName: "SASB Hotels & Lodging" },
  { code: "UNGC", displayName: "UN Global Compact" },
  { code: "SDG", displayName: "UN Sustainable Development Goals (SDGs)" },
  { code: "ILO_OSH", displayName: "ILO-OSH 2001" },
] as const;

export type ReadinessStatus = "assessed" | "assessment_incomplete" | "not_applicable";

export interface FrameworkReadinessRow {
  code: string;
  displayName: string;
  status: ReadinessStatus;
  /** 0-100, null unless status === "assessed". */
  readinessPct: number | null;
  ragStatus: RagStatus;
  evidenceCompletenessPct: number | null;
  mappedControlCount: number;
  openGapsCount: number;
  mainBlocker: string | null;
  /** No owner-tracking field exists anywhere in the live schema (Controls/Frameworks/
   * ControlFrameworkMappings) — deliberately null rather than fabricated; see chat ("never invent
   * a value merely to make the dashboard appear populated"). */
  owner: null;
  nextAction: string | null;
}

interface ControlMappingRow {
  Controls: { ROWID: string; category: string | null; is_life_safety_critical: string };
}

interface LegalRequirementRow extends CatalystRow {
  control_id: string;
}

interface AssessmentRow extends CatalystRow {
  control_id: string;
  dimension: string;
  maturity_score: string;
}

function readinessRagStatus(pct: number | null): RagStatus {
  if (pct == null) return "unknown";
  if (pct < 50) return "red";
  if (pct < 80) return "amber";
  return "green";
}

/**
 * Computes one dashboard readiness row for a framework. Deliberately a separate query path from
 * server/kpi/calculations/framework.ts's frameworkReadinessKpi() (which this dashboard module does
 * not call) — that function returns only a KpiCalculationResult (a single score), and this needs
 * additional detail (evidence completeness, open-gap count, a plain-language blocker) that would
 * require changing its return shape; duplicating the mapping/assessment query here is a smaller,
 * safer footprint than reshaping an already-shipped, tested KPI calculation.
 */
async function computeFrameworkReadiness(
  catalystApp: CatalystApp,
  scope: DashboardScope,
  ctx: AuthContext,
  code: string,
  displayName: string,
): Promise<FrameworkReadinessRow> {
  const notApplicable: FrameworkReadinessRow = {
    code,
    displayName,
    status: "not_applicable",
    readinessPct: null,
    ragStatus: "unknown",
    evidenceCompletenessPct: null,
    mappedControlCount: 0,
    openGapsCount: 0,
    mainBlocker: "No framework master record configured for this disclosure standard.",
    owner: null,
    nextAction: "Configure this framework's requirements and control mappings before assessment.",
  };
  if (code === "SDG") {
    return notApplicable;
  }

  const datastore = catalystApp.datastore();
  const zcql = catalystApp.zcql();

  const frameworkRows = (await datastore.table("Frameworks").getRows({
    criteria: `Frameworks.code = ${zcqlString(code)}`,
    maxRows: 1,
  })) as Array<CatalystRow & { name: string }>;
  const framework = frameworkRows[0];
  if (!framework) {
    return notApplicable;
  }

  const mappingRows = (await zcql.executeZCQLQuery(
    `select Controls.ROWID, Controls.category, Controls.is_life_safety_critical
     from ControlFrameworkMappings
     left join Controls on ControlFrameworkMappings.control_id = Controls.ROWID
     left join FrameworkRequirements on ControlFrameworkMappings.framework_requirement_id = FrameworkRequirements.ROWID
     where FrameworkRequirements.framework_id = ${zcqlString(framework.ROWID)}`,
  )) as ControlMappingRow[];

  const incomplete: FrameworkReadinessRow = {
    code,
    displayName,
    status: "assessment_incomplete",
    readinessPct: null,
    ragStatus: "unknown",
    evidenceCompletenessPct: mappingRows.length > 0 ? 0 : null,
    mappedControlCount: mappingRows.length,
    openGapsCount: 0,
    mainBlocker:
      mappingRows.length === 0
        ? "No controls mapped to this framework yet."
        : "No control assessments recorded yet for this scope.",
    owner: null,
    nextAction:
      mappingRows.length === 0
        ? "Map controls to this framework's requirements."
        : `Assess the ${mappingRows.length} mapped control${mappingRows.length === 1 ? "" : "s"} for this scope.`,
  };
  if (mappingRows.length === 0) {
    return incomplete;
  }

  const legalRows = (await datastore
    .table("LegalRequirementDetails")
    .getRows({})) as LegalRequirementRow[];
  const legalControlIds = new Set(legalRows.map((r) => r.control_id));

  const propClause =
    scope.kind === "property"
      ? `ControlAssessments.property_id = ${zcqlString(scope.propertyId)}`
      : groupScopeClause("ControlAssessments.property_id", ctx);
  const assessmentRows = (await datastore.table("ControlAssessments").getRows({
    criteria: propClause,
  })) as AssessmentRow[];

  const assessedControlIds = new Set(
    assessmentRows
      .filter((a) => mappingRows.some(({ Controls: c }) => c.ROWID === a.control_id))
      .map((a) => a.control_id),
  );
  if (assessedControlIds.size === 0) {
    return incomplete;
  }

  const rollupInputs = mappingRows.map(({ Controls: c }) => {
    const latest = new Map<string, number>();
    for (const a of assessmentRows) {
      if (a.control_id !== c.ROWID) continue;
      if (!latest.has(a.dimension)) latest.set(a.dimension, Number(a.maturity_score));
    }
    return {
      controlId: c.ROWID,
      category: c.category,
      isLifeSafetyCritical: c.is_life_safety_critical === "true",
      isLegal: legalControlIds.has(c.ROWID),
      scores: {
        policy: latest.get("policy"),
        procedure: latest.get("procedure"),
        implementation: latest.get("implementation"),
        effectiveness: latest.get("effectiveness"),
      },
    };
  });

  const rollup = computeFrameworkRollup(rollupInputs);
  const evidenceCompletenessPct = Math.round((assessedControlIds.size / mappingRows.length) * 100);

  // Open gaps: any mapped control whose rollup is at/below "Initial" (1) on the maturity scale —
  // matches the same threshold isCriticalGap() uses for life-safety/legal controls, generalised
  // here to flag any weak control as a readiness blocker, not only the critical-gap-capped ones.
  const openGaps = rollupInputs.filter((c) => {
    const scores = Object.values(c.scores).filter((s): s is number => s != null);
    return scores.length > 0 && Math.min(...scores) <= 1;
  });

  const mainBlocker =
    openGaps.length > 0
      ? `${openGaps.length} control${openGaps.length === 1 ? "" : "s"} at or below "Initial" maturity`
      : evidenceCompletenessPct < 100
        ? `${mappingRows.length - assessedControlIds.size} mapped control${mappingRows.length - assessedControlIds.size === 1 ? "" : "s"} not yet assessed`
        : null;

  const nextAction =
    openGaps.length > 0
      ? "Remediate the weakest-scoring controls first, prioritising life-safety-critical/legal ones."
      : evidenceCompletenessPct < 100
        ? "Complete assessment of the remaining mapped controls."
        : "Maintain current assessment cadence and monitor for control drift.";

  return {
    code,
    displayName,
    status: "assessed",
    readinessPct: rollup.rollupScore != null ? rollup.rollupScore * 25 : null,
    ragStatus: readinessRagStatus(rollup.rollupScore != null ? rollup.rollupScore * 25 : null),
    evidenceCompletenessPct,
    mappedControlCount: mappingRows.length,
    openGapsCount: openGaps.length,
    mainBlocker,
    owner: null,
    nextAction,
  };
}

/**
 * "Overall H&S system maturity" — the executive KPI strip's single headline maturity figure (see
 * chat, CEO dashboard §4). Rolls up EVERY assessed control in scope regardless of framework
 * mapping (a superset of any one framework's own readiness), using the same
 * computeFrameworkRollup() rule (MIN-of-dimension per control, critical-gap cap, average across
 * controls) as every other maturity figure on this dashboard — never a separately-invented scoring
 * formula.
 */
export async function computeOverallMaturity(
  catalystApp: CatalystApp,
  scope: DashboardScope,
  ctx: AuthContext,
): Promise<{ readinessPct: number | null; ragStatus: RagStatus }> {
  const datastore = catalystApp.datastore();

  // 300 is Catalyst ZCQL's own hard cap on LIMIT — see the identical note in
  // server/dashboard/assurance-heatmap.ts.
  const controls = (await datastore
    .table("Controls")
    .getRows({ maxRows: 300 })) as unknown as Array<{
    ROWID: string;
    is_life_safety_critical: string;
  }>;
  if (controls.length === 0) {
    return { readinessPct: null, ragStatus: "unknown" };
  }

  const legalRows = (await datastore
    .table("LegalRequirementDetails")
    .getRows({})) as LegalRequirementRow[];
  const legalControlIds = new Set(legalRows.map((r) => r.control_id));

  const propClause =
    scope.kind === "property"
      ? `ControlAssessments.property_id = ${zcqlString(scope.propertyId)}`
      : groupScopeClause("ControlAssessments.property_id", ctx);
  const assessmentRows = (await datastore.table("ControlAssessments").getRows({
    criteria: propClause,
  })) as AssessmentRow[];
  if (assessmentRows.length === 0) {
    return { readinessPct: null, ragStatus: "unknown" };
  }

  const rollupInputs = controls.map((c) => {
    const latest = new Map<string, number>();
    for (const a of assessmentRows) {
      if (a.control_id !== c.ROWID) continue;
      if (!latest.has(a.dimension)) latest.set(a.dimension, Number(a.maturity_score));
    }
    return {
      isLifeSafetyCritical: c.is_life_safety_critical === "true",
      isLegal: legalControlIds.has(c.ROWID),
      scores: {
        policy: latest.get("policy"),
        procedure: latest.get("procedure"),
        implementation: latest.get("implementation"),
        effectiveness: latest.get("effectiveness"),
      },
    };
  });
  const rollup = computeFrameworkRollup(rollupInputs);
  const readinessPct = rollup.rollupScore != null ? rollup.rollupScore * 25 : null;
  return { readinessPct, ragStatus: readinessRagStatus(readinessPct) };
}

export async function computeAllFrameworkReadiness(
  catalystApp: CatalystApp,
  scope: DashboardScope,
  ctx: AuthContext,
): Promise<FrameworkReadinessRow[]> {
  const rows: FrameworkReadinessRow[] = [];
  // Sequential, not mapWithConcurrency: each iteration reuses the same small set of Data Store
  // tables (Frameworks/ControlFrameworkMappings/ControlAssessments) and this only runs 8 times per
  // page load — parallelising would just contend for the same rows without a meaningful latency
  // win, unlike the per-property KPI fan-out in business-units.ts.
  for (const { code, displayName } of DISCLOSURE_FRAMEWORKS) {
    rows.push(await computeFrameworkReadiness(catalystApp, scope, ctx, code, displayName));
  }
  return rows;
}

export { maturityLabel };

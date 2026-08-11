import "server-only";

import type { CatalystApp } from "@/lib/catalyst/app";
import { mapWithConcurrency } from "@/lib/concurrency";
import { countIncidentsInPeriod } from "@/server/kpi/calculations/incidents";
import { calculateKpi, type KpiTileResult } from "@/server/kpi/calculate";
import {
  financialYearFor,
  previousFinancialYear,
  sameperiodYtdComparison,
} from "@/server/kpi/period";
import { propertyScopeClause } from "@/server/kpi/scope";
import type { AuthContext } from "@/server/permissions";

import { SDG_DEFINITIONS, mapControlCategoryToSdgNumbers } from "./sdg";

/** Not `extends CatalystRow` — `category` is genuinely nullable (same reasoning as ControlRow in
 * assurance-heatmap.ts). */
interface ControlRow {
  ROWID: string;
  category: string | null;
}

export interface SdgContributionRow {
  number: 3 | 8 | 13;
  title: string;
  description: string;
  mappedControlCount: number;
  assessedControlCount: number;
  evidenceLinkedControlCount: number;
  kpis: KpiTileResult[];
  /** Only populated for SDG 13 — the live ClimateRisks register count is its most direct evidence
   * source (see sdg.ts: no live Controls.category maps to climate specifically). Null for other
   * goals rather than a fabricated 0. */
  climateRiskCount: number | null;
  climateIncidentsCurrent: number | null;
}

/**
 * Live SDG contribution mapping (see chat §H): relevant controls (via Controls.category), how
 * many have at least one assessment, how many have at least one linked piece of evidence
 * (DocumentEvidenceLinks against a control_assessment), and the relevant registered KPIs' current
 * values — never a fabricated "SDG compliance %". SDG 13 additionally shows the live ClimateRisks
 * register count and climate/weather-related incident count, since no control category maps to it.
 */
export async function computeSdgContribution(
  catalystApp: CatalystApp,
  ctx: AuthContext,
  propertyId: string | null,
  asOf: Date,
): Promise<SdgContributionRow[]> {
  const datastore = catalystApp.datastore();

  // 300 is ZCQL/getRows's own hard cap (confirmed live elsewhere in this app) — not expected to be
  // exceeded at this app's current control-library scale.
  const controls = (await datastore
    .table("Controls")
    .getRows({ maxRows: 300 })) as unknown as ControlRow[];

  const controlIdsBySdg = new Map<number, string[]>();
  for (const c of controls) {
    for (const sdgNumber of mapControlCategoryToSdgNumbers(c.category)) {
      const list = controlIdsBySdg.get(sdgNumber) ?? [];
      list.push(c.ROWID);
      controlIdsBySdg.set(sdgNumber, list);
    }
  }

  const allRelevantControlIds = [...new Set([...controlIdsBySdg.values()].flat())];

  const assessedControlIds = new Set<string>();
  const assessmentIdsByControlId = new Map<string, string[]>();
  if (allRelevantControlIds.length > 0) {
    const assessmentRows = (await datastore.table("ControlAssessments").getRows({
      criteria: `ControlAssessments.control_id in (${allRelevantControlIds.map((id) => `'${id}'`).join(",")})`,
    })) as unknown as Array<{ ROWID: string; control_id: string }>;
    for (const a of assessmentRows) {
      assessedControlIds.add(a.control_id);
      const list = assessmentIdsByControlId.get(a.control_id) ?? [];
      list.push(a.ROWID);
      assessmentIdsByControlId.set(a.control_id, list);
    }
  }

  const allAssessmentIds = [...assessmentIdsByControlId.values()].flat();
  const controlIdsWithEvidence = new Set<string>();
  if (allAssessmentIds.length > 0) {
    // DocumentEvidenceLinks.linked_entity_id is a plain Text column (not a real Lookup/FK — same
    // class of column documented elsewhere in this app, e.g. IncidentOSHReportability.incident_id)
    // — resolved application-side rather than joined in ZCQL.
    const evidenceLinkRows = (await datastore.table("DocumentEvidenceLinks").getRows({
      criteria: `DocumentEvidenceLinks.linked_entity_type = 'control_assessment' and DocumentEvidenceLinks.linked_entity_id in (${allAssessmentIds.map((id) => `'${id}'`).join(",")})`,
    })) as unknown as Array<{ linked_entity_id: string }>;
    const assessmentIdsWithEvidence = new Set(evidenceLinkRows.map((l) => l.linked_entity_id));
    for (const [controlId, assessmentIds] of assessmentIdsByControlId) {
      if (assessmentIds.some((id) => assessmentIdsWithEvidence.has(id))) {
        controlIdsWithEvidence.add(controlId);
      }
    }
  }

  const { period: currentPeriod } = financialYearFor(asOf);
  const comparisonPeriodFull = previousFinancialYear(currentPeriod);
  const { comparisonEnd } = sameperiodYtdComparison(currentPeriod, comparisonPeriodFull, asOf);

  // One flattened (SDG number x KPI code) job list run through a single shared concurrency budget
  // — Catalyst enforces a per-project concurrency limit (see lib/concurrency.ts), and nesting a
  // sequential per-SDG loop of per-code calls here was the same shape that tripped a live 429 on
  // the CEO dashboard's own KPI tiles (see chat) before it was fixed the same way.
  const kpiJobs = SDG_DEFINITIONS.flatMap((def) =>
    def.relevantKpiCodes.map((code) => ({ sdgNumber: def.number, code })),
  );
  const kpiResults = await mapWithConcurrency(kpiJobs, 3, ({ code }) =>
    calculateKpi(catalystApp, ctx, code, { propertyId, asOf }),
  );
  const kpisBySdg = new Map<number, KpiTileResult[]>();
  kpiJobs.forEach((job, i) => {
    const result = kpiResults[i];
    if (!result) return;
    const list = kpisBySdg.get(job.sdgNumber) ?? [];
    list.push(result);
    kpisBySdg.set(job.sdgNumber, list);
  });

  const rows: SdgContributionRow[] = [];
  for (const def of SDG_DEFINITIONS) {
    const mappedControlIds = controlIdsBySdg.get(def.number) ?? [];
    const kpis = kpisBySdg.get(def.number) ?? [];

    let climateRiskCount: number | null = null;
    let climateIncidentsCurrent: number | null = null;
    if (def.number === 13) {
      const propClause = propertyId
        ? `ClimateRisks.property_id = '${propertyId}'`
        : propertyScopeClause("ClimateRisks.property_id", ctx);
      const climateRisks = (await datastore.table("ClimateRisks").getRows({
        criteria: propClause,
      })) as unknown as Array<{ ROWID: string }>;
      climateRiskCount = climateRisks.length;

      const climateResult = await countIncidentsInPeriod(
        {
          catalystApp,
          ctx,
          propertyId,
          periodStart: currentPeriod.start,
          periodEnd: asOf < currentPeriod.end ? asOf : currentPeriod.end,
          comparisonPeriodStart: comparisonPeriodFull.start,
          comparisonPeriodEnd: comparisonEnd,
        },
        "Incidents.incident_type = 'climate_extreme_weather'",
      );
      climateIncidentsCurrent = climateResult.currentValue ?? 0;
    }

    rows.push({
      number: def.number,
      title: def.title,
      description: def.description,
      mappedControlCount: mappedControlIds.length,
      assessedControlCount: mappedControlIds.filter((id) => assessedControlIds.has(id)).length,
      evidenceLinkedControlCount: mappedControlIds.filter((id) =>
        controlIdsWithEvidence.has(id),
      ).length,
      kpis,
      climateRiskCount,
      climateIncidentsCurrent,
    });
  }

  return rows;
}

import "server-only";

import type { CatalystApp, CatalystRow } from "@/lib/catalyst/app";
import { computeFrameworkRollup } from "@/server/framework/maturity";
import { capaEffectivenessRate } from "@/server/kpi/calculations/capa";
import type { AuthContext } from "@/server/permissions";

import {
  ASSURANCE_AREAS,
  heatmapCellRag,
  mapControlCategoryToAssuranceArea,
  type AssuranceAreaCode,
  type HeatmapRag,
} from "./assurance-areas";
import type { BusinessUnit } from "./scope";

export interface HeatmapCell {
  areaCode: AssuranceAreaCode;
  rag: HeatmapRag;
  assessedControlCount: number;
}

export interface HeatmapRow {
  businessUnitId: string;
  businessUnitName: string;
  cells: HeatmapCell[];
}

/** Not `extends CatalystRow` — `category` is genuinely nullable, which conflicts with
 * CatalystRow's `Record<string, string>` index signature. */
interface ControlRow {
  ROWID: string;
  category: string | null;
  is_life_safety_critical: string;
}

interface AssessmentRow extends CatalystRow {
  control_id: string;
  dimension: string;
  maturity_score: string;
}

function percentToHeatmapRag(pct: number | null): HeatmapRag {
  if (pct == null) return "grey";
  if (pct < 50) return "red";
  if (pct < 80) return "amber";
  return "green";
}

function latestScoresByDimension(controlId: string, assessments: AssessmentRow[]) {
  const latest = new Map<string, number>();
  for (const a of assessments) {
    if (a.control_id !== controlId) continue;
    if (!latest.has(a.dimension)) latest.set(a.dimension, Number(a.maturity_score));
  }
  return {
    policy: latest.get("policy"),
    procedure: latest.get("procedure"),
    implementation: latest.get("implementation"),
    effectiveness: latest.get("effectiveness"),
  };
}

/**
 * Business Unit × assurance-area heatmap (see chat, CEO dashboard §7). Legal & regulatory
 * compliance is derived from the MU_LEGAL framework's mapped controls (not a Controls.category
 * guess — a direct, already-established legal signal); Monitoring & continual improvement is
 * derived from the CAPA effectiveness rate (verified-effective proportion), the closest existing
 * "is corrective action actually working" signal in the app. The other 7 columns are derived from
 * Controls.category via mapControlCategoryToAssuranceArea() — any control whose category doesn't
 * map to one of the 9 areas simply doesn't contribute to any cell, and any (Business Unit, area)
 * with zero assessed controls renders grey ("not assessed"), never a guessed colour.
 */
export async function computeAssuranceHeatmap(
  catalystApp: CatalystApp,
  ctx: AuthContext,
  businessUnits: BusinessUnit[],
  period: { start: Date; end: Date; comparisonStart: Date; comparisonEnd: Date },
): Promise<HeatmapRow[]> {
  const datastore = catalystApp.datastore();
  const zcql = catalystApp.zcql();

  const controls = (await datastore
    .table("Controls")
    .getRows({ maxRows: 500 })) as unknown as ControlRow[];
  const controlsByArea = new Map<AssuranceAreaCode, ControlRow[]>();
  for (const c of controls) {
    const area = mapControlCategoryToAssuranceArea(c.category);
    if (!area) continue;
    const list = controlsByArea.get(area) ?? [];
    list.push(c);
    controlsByArea.set(area, list);
  }

  const legalMappingRows = (await zcql.executeZCQLQuery(
    `select Controls.ROWID from ControlFrameworkMappings
     left join Controls on ControlFrameworkMappings.control_id = Controls.ROWID
     left join FrameworkRequirements on ControlFrameworkMappings.framework_requirement_id = FrameworkRequirements.ROWID
     left join Frameworks on FrameworkRequirements.framework_id = Frameworks.ROWID
     where Frameworks.code = 'MU_LEGAL'`,
  )) as Array<{ Controls: { ROWID: string } }>;
  const legalControls = controls.filter((c) =>
    legalMappingRows.some((m) => m.Controls.ROWID === c.ROWID),
  );

  const rows: HeatmapRow[] = [];
  for (const bu of businessUnits) {
    const assessmentRows = (await datastore.table("ControlAssessments").getRows({
      criteria: `ControlAssessments.property_id = '${bu.id}'`,
    })) as AssessmentRow[];

    const cells: HeatmapCell[] = [];
    for (const { code } of ASSURANCE_AREAS) {
      if (code === "monitoring") {
        const capaResult = await capaEffectivenessRate({
          catalystApp,
          ctx,
          propertyId: bu.id,
          periodStart: period.start,
          periodEnd: period.end,
          comparisonPeriodStart: period.comparisonStart,
          comparisonPeriodEnd: period.comparisonEnd,
        });
        cells.push({
          areaCode: code,
          rag: percentToHeatmapRag(capaResult.currentValue),
          assessedControlCount: 0,
        });
        continue;
      }

      const areaControls = code === "legal" ? legalControls : (controlsByArea.get(code) ?? []);
      const rollupInputs = areaControls.map((c) => ({
        isLifeSafetyCritical: c.is_life_safety_critical === "true",
        isLegal: code === "legal",
        scores: latestScoresByDimension(c.ROWID, assessmentRows),
      }));
      const assessedCount = rollupInputs.filter((c) =>
        Object.values(c.scores).some((s) => s != null),
      ).length;
      const rollup = computeFrameworkRollup(rollupInputs);
      cells.push({
        areaCode: code,
        rag: heatmapCellRag(rollup.rollupScore),
        assessedControlCount: assessedCount,
      });
    }
    rows.push({ businessUnitId: bu.id, businessUnitName: bu.name, cells });
  }

  return rows;
}

export { ASSURANCE_AREAS };

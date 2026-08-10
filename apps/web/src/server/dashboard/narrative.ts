/**
 * Deterministic executive narrative — no LLM call, every sentence traces to an already-computed
 * dashboard fact (same discipline as server/reporting/board-narrative.ts). Pure (no DB/server-only
 * imports) so it's directly unit-testable; the page passes in data it has already fetched for the
 * other dashboard sections rather than this module re-querying anything itself.
 */

import type { BusinessUnitComparisonRow } from "./business-units";
import type { DataQualityRow } from "./data-quality";
import type { FrameworkReadinessRow } from "./frameworks";
import type { ManagementAttentionItem } from "./management-attention";

export interface NarrativeInput {
  scopeLabel: string;
  fyLabel: string;
  totalIncidentsCurrent: number | null;
  totalIncidentsComparison: number | null;
  highPotentialCurrent: number | null;
  managementAttention: ManagementAttentionItem[];
  businessUnitRows: BusinessUnitComparisonRow[];
  frameworkReadiness: FrameworkReadinessRow[];
  dataQuality: DataQualityRow[];
}

export interface ExecutiveNarrative {
  managementSummary: string;
  keyChange: string;
  mainExposure: string;
  businessUnitRequiringAttention: string;
  assuranceBlockers: string;
  requiredDecisions: string[];
}

/** Never names an affected person, medical detail, or clinical information — see chat §16. */
export function generateExecutiveNarrative(input: NarrativeInput): ExecutiveNarrative {
  const {
    scopeLabel,
    fyLabel,
    totalIncidentsCurrent,
    totalIncidentsComparison,
    highPotentialCurrent,
    managementAttention,
    businessUnitRows,
    frameworkReadiness,
    dataQuality,
  } = input;

  const criticalCount = managementAttention.filter((i) => i.severity === "critical").length;

  const managementSummary =
    criticalCount > 0
      ? `${scopeLabel} has ${criticalCount} matter${criticalCount === 1 ? "" : "s"} requiring immediate executive action for ${fyLabel}.`
      : `No critical management exceptions identified for ${scopeLabel} in ${fyLabel}.`;

  let keyChange = "Incident volume trend is not yet comparable — insufficient prior-year data.";
  if (totalIncidentsCurrent != null && totalIncidentsComparison != null) {
    const delta = totalIncidentsCurrent - totalIncidentsComparison;
    if (delta === 0) {
      keyChange = `Incident frequency is unchanged against the comparison financial year (${totalIncidentsCurrent}).`;
    } else {
      const direction = delta < 0 ? "decreased" : "increased";
      keyChange = `Incident frequency has ${direction} against the comparison financial year (${totalIncidentsComparison} → ${totalIncidentsCurrent}).`;
    }
  }

  const buRows = businessUnitRows.filter((r) => !r.isGroupTotal);
  const mostConcerningBu = [...buRows].sort((a, b) => {
    const score = (r: BusinessUnitComparisonRow) =>
      (r.criticalMajorFindings ?? 0) * 10 +
      (r.overdueCapa ?? 0) * 3 +
      (r.highPotential ?? 0) * 2 +
      (r.fatalities ?? 0) * 100;
    return score(b) - score(a);
  })[0];

  const mainExposure =
    highPotentialCurrent != null && highPotentialCurrent > 0
      ? `High-potential exposure remains concentrated${mostConcerningBu ? ` at ${mostConcerningBu.businessUnitName}` : ""} — ${highPotentialCurrent} high-potential incident${highPotentialCurrent === 1 ? "" : "s"} recorded for ${fyLabel}.`
      : "No high-potential incidents recorded for the current period.";

  const businessUnitRequiringAttention =
    mostConcerningBu &&
    ((mostConcerningBu.criticalMajorFindings ?? 0) > 0 ||
      (mostConcerningBu.overdueCapa ?? 0) > 0 ||
      (mostConcerningBu.highPotential ?? 0) > 0)
      ? `${mostConcerningBu.businessUnitName} requires the most management attention this period: ${mostConcerningBu.criticalMajorFindings ?? 0} critical/major finding(s), ${mostConcerningBu.overdueCapa ?? 0} overdue corrective action(s), ${mostConcerningBu.highPotential ?? 0} high-potential incident(s).`
      : "No single Business Unit stands out as requiring exceptional management attention this period.";

  const blockers: string[] = [];
  for (const fw of frameworkReadiness) {
    if (fw.status === "assessed" && fw.ragStatus !== "green" && fw.mainBlocker) {
      blockers.push(`${fw.displayName}: ${fw.mainBlocker}.`);
    }
  }
  const majorDataGaps = dataQuality.filter((r) => r.count > 0).slice(0, 3);
  if (majorDataGaps.length > 0) {
    blockers.push(
      `Data-quality gaps affect ${majorDataGaps.map((r) => `${r.count} record(s) (${r.label.toLowerCase()})`).join(", ")}.`,
    );
  }
  const assuranceBlockers =
    blockers.length > 0
      ? blockers.join(" ")
      : "No material assurance or disclosure blockers identified for the selected scope.";

  const requiredDecisions: string[] = [];
  const criticalItems = managementAttention.filter((i) => i.severity === "critical");
  for (const item of criticalItems.slice(0, 5)) {
    requiredDecisions.push(`${item.businessUnitName}: ${item.message}`);
  }
  if (requiredDecisions.length === 0) {
    requiredDecisions.push("No management decisions are required based on current exceptions.");
  }

  return {
    managementSummary,
    keyChange,
    mainExposure,
    businessUnitRequiringAttention,
    assuranceBlockers,
    requiredDecisions,
  };
}

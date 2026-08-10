/**
 * Pure Business-Unit × assurance-area heatmap logic — no "server-only", no DB/network imports
 * (same convention as server/incidents/wizard-rules.ts), so the category mapping and cell RAG
 * derivation are directly unit-testable.
 */

export const ASSURANCE_AREAS = [
  { code: "governance", label: "Governance & leadership" },
  { code: "legal", label: "Legal & regulatory compliance" },
  { code: "hazard_risk", label: "Hazard identification & risk management" },
  { code: "hotel_ops", label: "Hotel operational safety" },
  { code: "competence", label: "Competence & worker participation" },
  { code: "health_wellbeing", label: "Occupational health & wellbeing" },
  { code: "emergency_prep", label: "Emergency preparedness" },
  { code: "incident_mgmt", label: "Incident management" },
  { code: "monitoring", label: "Monitoring & continual improvement" },
] as const;

export type AssuranceAreaCode = (typeof ASSURANCE_AREAS)[number]["code"];

/**
 * Maps the live `Controls.category` free-text values (seeded per the pre-migration control
 * library — see chat) onto the 9 fixed assurance areas. Deliberately conservative: an unrecognised
 * category maps to nothing (null) rather than a guessed area, so a control never silently
 * contributes to the wrong heatmap cell. "legal" and "monitoring" have no matching Controls
 * category at all — those two columns are computed from the MU_LEGAL framework rollup and CAPA
 * effectiveness rate instead (see assurance-heatmap.ts), not from this category map.
 */
const CATEGORY_TO_AREA: Record<string, AssuranceAreaCode> = {
  "high-risk work control": "hazard_risk",
  "fire & life safety": "emergency_prep",
  "health hazard control": "health_wellbeing",
  "guest safety": "hotel_ops",
  "hazardous substances": "hazard_risk",
  "contractor management": "governance",
  "incident management": "incident_mgmt",
  competence: "competence",
  ppe: "hazard_risk",
  ergonomics: "health_wellbeing",
};

export function mapControlCategoryToAssuranceArea(
  category: string | null | undefined,
): AssuranceAreaCode | null {
  if (!category) return null;
  return CATEGORY_TO_AREA[category.trim().toLowerCase()] ?? null;
}

export type HeatmapRag = "red" | "amber" | "green" | "grey";

/**
 * Cell colour from a rollup maturity score (0-4 scale, same as computeFrameworkRollup) — grey for
 * "not assessed" is a distinct state from red, never conflated (see chat: "Grey = not assessed /
 * insufficient evidence" is one of exactly 4 states, not a fallback that silently becomes red/green).
 */
export function heatmapCellRag(rollupScore: number | null): HeatmapRag {
  if (rollupScore == null) return "grey";
  if (rollupScore <= 1) return "red";
  if (rollupScore <= 2.5) return "amber";
  return "green";
}

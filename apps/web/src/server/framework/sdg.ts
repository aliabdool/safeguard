/**
 * UN SDG contribution mapping (see chat: "never an invented SDG compliance percentage") — SDG 3,
 * 8, and 13 are the three goals Sunlife's H&S program plausibly contributes evidence toward.
 * Pure, no DB: this module only defines what "relevant" means for each goal (which live
 * Controls.category values and which registered KPI codes) — the live computation (which
 * controls/KPIs/evidence actually exist) lives in sdg-contribution.ts.
 */

export interface SdgDefinition {
  number: 3 | 8 | 13;
  title: string;
  description: string;
  /** Controls.category values considered relevant to this goal. Deliberately an explicit list,
   * not inferred — an empty list (as for SDG 13, where no live category maps cleanly) is an honest
   * "no control-library evidence for this goal yet", not a bug. */
  relevantCategories: string[];
  /** Registered KPI codes (server/kpi/calculate.ts REGISTRY) whose live values are shown as this
   * goal's performance evidence — never a fabricated percentage. */
  relevantKpiCodes: string[];
}

export const SDG_DEFINITIONS: SdgDefinition[] = [
  {
    number: 3,
    title: "Good Health and Well-being",
    description:
      "Preventing work-related death, injury and ill health, and providing safe, healthy working and guest environments.",
    relevantCategories: [
      "Fire & life safety",
      "Guest safety",
      "Incident management",
      "PPE",
      "Ergonomics",
      "Hazardous substances",
      "Health hazard control",
      "High-risk work control",
    ],
    relevantKpiCodes: [
      "FATALITIES",
      "LTI",
      "LTIFR",
      "RECORDABLE_INJURIES",
      "TRIR",
      "HOSPITAL_REFERRALS",
      "SEVERITY_RATE",
    ],
  },
  {
    number: 8,
    title: "Decent Work and Economic Growth",
    description:
      "Safe and secure working environments for all workers, including contractors and trainees, and competent, fairly-managed labour practices.",
    relevantCategories: ["Competence", "Contractor management", "High-risk work control"],
    relevantKpiCodes: ["TRIR", "HIGH_POTENTIAL", "LOST_WORKDAYS", "RESTRICTED_DUTY_DAYS"],
  },
  {
    number: 13,
    title: "Climate Action",
    description:
      "Understanding and managing climate-related physical H&S risks (heat stress, extreme weather, wildfire smoke) affecting workers and guests.",
    // No live Controls.category maps cleanly to climate-related H&S risk specifically — an honest
    // empty list, not a guess. Evidence for this goal instead comes from the live ClimateRisks
    // register and the IFRS S2 readiness KPI (see sdg-contribution.ts).
    relevantCategories: [],
    relevantKpiCodes: ["IFRS_S2_READINESS"],
  },
];

/** Every SDG number a control category contributes evidence toward — a category can map to more
 * than one goal (e.g. "High-risk work control" contributes to both SDG 3 and SDG 8). */
export function mapControlCategoryToSdgNumbers(category: string | null | undefined): number[] {
  if (!category) return [];
  const normalized = category.trim().toLowerCase();
  return SDG_DEFINITIONS.filter((sdg) =>
    sdg.relevantCategories.some((c) => c.toLowerCase() === normalized),
  ).map((sdg) => sdg.number);
}

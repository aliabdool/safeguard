/**
 * Pure climate-hazard/category validation — no DB import, unit-testable. A hazard belongs to
 * exactly one of acute physical / chronic physical / transition; this is the single source of
 * truth both the write path and any UI dropdown filtering should use, so the two can never drift
 * apart into "the form allows a combination the schema comment says is invalid."
 */

export type ClimateRiskCategory = "acute_physical" | "chronic_physical" | "transition";

export const CLIMATE_HAZARDS_BY_CATEGORY: Record<ClimateRiskCategory, readonly string[]> = {
  acute_physical: [
    "cyclone",
    "flood",
    "extreme_rainfall",
    "storm_surge",
    "coastal_erosion",
    "heatwave",
    "fire",
  ],
  chronic_physical: [
    "rising_temperature",
    "heat_stress",
    "water_scarcity",
    "sea_level_rise",
    "vector_borne_disease",
    "changing_working_conditions",
  ],
  transition: [
    "regulation",
    "carbon_pricing",
    "insurance_cost",
    "energy_requirements",
    "disclosure_requirements",
    "technology_changes",
    "reputation_customer_expectations",
  ],
};

export function isHazardValidForCategory(
  hazard: string,
  category: ClimateRiskCategory,
): boolean {
  return CLIMATE_HAZARDS_BY_CATEGORY[category].includes(hazard);
}

export function categoryForHazard(hazard: string): ClimateRiskCategory | null {
  for (const category of Object.keys(CLIMATE_HAZARDS_BY_CATEGORY) as ClimateRiskCategory[]) {
    if (CLIMATE_HAZARDS_BY_CATEGORY[category].includes(hazard)) {
      return category;
    }
  }
  return null;
}

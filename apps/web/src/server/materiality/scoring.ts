/**
 * Pure materiality scoring — no DB import, unit-testable. Implements GRI 3 (Material Topics,
 * 2021) impact/double materiality and IFRS S1 financial/single materiality as two genuinely
 * independent scores, per docs/framework-model.md §materiality. Neither score is ever averaged
 * or blended into the other — `classifyMateriality` only ever combines the two *decisions*
 * (`griMaterial`/`ifrsMaterial`) into a label, never the underlying numbers.
 *
 * The scoring functions here produce a *suggested* score on a 1-5 scale — they inform, but never
 * replace, the human materiality decision (`material_topics.gri_material` /
 * `.ifrs_material`), which always requires a person to record it, per GRI 3's requirement for a
 * documented, defensible determination process.
 */

export interface GriImpactInputs {
  impactType: "actual" | "potential";
  severity: number; // 1-5
  scale: number; // 1-5
  scope: number; // 1-5
  irremediable: boolean;
  /** Required for potential impacts; ignored for actual impacts (which already happened). */
  likelihood?: number | null; // 1-5
}

/**
 * GRI 3 guidance: for actual impacts, significance = severity (itself informed by scale, scope,
 * and irremediable character). For potential impacts, significance = severity x likelihood, so a
 * severe-but-unlikely potential impact doesn't automatically outrank a moderate-and-certain one.
 * `irremediable` adds one point to the base severity component (capped at 5) — an impact that
 * cannot be undone is treated as more significant than an equally-rated recoverable one.
 */
export function computeGriImpactScore(inputs: GriImpactInputs): number {
  const baseSeverity = Math.min(
    5,
    Math.round((inputs.severity + inputs.scale + inputs.scope) / 3) +
      (inputs.irremediable ? 1 : 0),
  );
  if (inputs.impactType === "actual") {
    return Math.min(5, Math.max(1, baseSeverity));
  }
  const likelihood = inputs.likelihood ?? 1;
  return Math.min(5, Math.max(1, Math.round((baseSeverity * likelihood) / 5)));
}

export interface IfrsFinancialInputs {
  likelihood: number; // 1-5
  financialMagnitude: number; // 1-5
  effectCashFlows: boolean;
  effectAccessToFinance: boolean;
  effectCostOfCapital: boolean;
  effectBusinessModelStrategy: boolean;
}

/**
 * IFRS S1 financial materiality: likelihood x magnitude is the core driver, with each additional
 * "effect" flag (cash flows, access to finance, cost of capital, business model/strategy) adding
 * weight — a risk/opportunity touching multiple financial channels is more material than one
 * touching only one, even at the same likelihood x magnitude.
 */
export function computeIfrsFinancialScore(inputs: IfrsFinancialInputs): number {
  const core = (inputs.likelihood * inputs.financialMagnitude) / 5;
  const effectCount = [
    inputs.effectCashFlows,
    inputs.effectAccessToFinance,
    inputs.effectCostOfCapital,
    inputs.effectBusinessModelStrategy,
  ].filter(Boolean).length;
  return Math.min(5, Math.max(1, Math.round(core + effectCount * 0.25)));
}

export type MaterialityClassification =
  | "material_under_both"
  | "material_under_gri_only"
  | "material_under_ifrs_only"
  | "not_material"
  | "not_yet_assessed";

/**
 * Combines the two *human decisions*, never the underlying scores — this is the only function in
 * the module that touches both frameworks at once, and it produces a label, not a number.
 */
export function classifyMateriality(
  griMaterial: boolean | null | undefined,
  ifrsMaterial: boolean | null | undefined,
): MaterialityClassification {
  if (griMaterial == null || ifrsMaterial == null) {
    return "not_yet_assessed";
  }
  if (griMaterial && ifrsMaterial) return "material_under_both";
  if (griMaterial) return "material_under_gri_only";
  if (ifrsMaterial) return "material_under_ifrs_only";
  return "not_material";
}

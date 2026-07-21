/** Pure RAG (Red/Amber/Green) classification — no DB, no server-only. */

export type RagStatus = "red" | "amber" | "green" | "unknown";
export type KpiDirection = "lower_better" | "higher_better";

export function computeRagStatus(params: {
  value: number | null;
  target: number | null;
  warningThreshold: number | null;
  criticalThreshold: number | null;
  direction: KpiDirection;
}): RagStatus {
  const { value, target, warningThreshold, criticalThreshold, direction } = params;
  if (value == null || target == null) {
    return "unknown";
  }

  if (direction === "lower_better") {
    if (criticalThreshold != null && value > criticalThreshold) return "red";
    if (warningThreshold != null && value > warningThreshold) return "amber";
    return value <= target ? "green" : "amber";
  }

  // higher_better
  if (criticalThreshold != null && value < criticalThreshold) return "red";
  if (warningThreshold != null && value < warningThreshold) return "amber";
  return value >= target ? "green" : "amber";
}

export function computeVariance(current: number | null, comparison: number | null) {
  if (current == null || comparison == null) {
    return { absolute: null, percent: null };
  }
  const absolute = current - comparison;
  const percent = comparison === 0 ? null : (absolute / Math.abs(comparison)) * 100;
  return { absolute, percent };
}

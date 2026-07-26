import type { KpiTileResult } from "@/server/kpi/calculate";
import type { DataQualityRow } from "@/server/dashboard/data-quality";

/**
 * Deterministic, template-based narrative generation from already-computed KPI figures — never
 * an LLM call, never an invented number. Every sentence traces back to a `KpiTileResult` that
 * was itself computed live from the database (src/server/kpi/calculate.ts). If a KPI hasn't been
 * wired into the calculation registry yet, or has no data for the period, the narrative says so
 * explicitly rather than omitting it silently or guessing a value.
 */

function fmt(value: number | null, unit: string): string {
  if (value == null) return "not yet calculable for this period";
  const rounded = Number.isInteger(value) ? value : Math.round(value * 10) / 10;
  if (unit === "%") return `${rounded}%`;
  if (unit === "MUR") return `MUR ${rounded.toLocaleString()}`;
  return `${rounded.toLocaleString()}`;
}

function varianceClause(kpi: KpiTileResult): string {
  if (kpi.currentValue == null || kpi.comparisonValue == null || kpi.variancePct == null) {
    return "no prior-period comparison is available yet";
  }
  if (kpi.variancePct === 0) return "unchanged from the same period last year";
  const direction = kpi.variancePct > 0 ? "up" : "down";
  const desirable =
    (kpi.direction === "lower_better" && kpi.variancePct < 0) ||
    (kpi.direction === "higher_better" && kpi.variancePct > 0);
  const qualifier = desirable ? "an improvement" : "worth board attention";
  return `${direction} ${Math.abs(kpi.variancePct)}% year-on-year (${qualifier})`;
}

function findKpi(kpis: KpiTileResult[], code: string): KpiTileResult | undefined {
  return kpis.find((k) => k.kpiCode === code);
}

export interface BoardNarrativeInput {
  fyLabel: string;
  propertyLabel: string;
  generatedAt: Date;
  kpis: KpiTileResult[];
  dataQuality: DataQualityRow[];
}

export function generateBoardNarrative(input: BoardNarrativeInput): string {
  const { fyLabel, propertyLabel, generatedAt, kpis, dataQuality } = input;
  const lines: string[] = [];

  lines.push(`# Board Health & Safety Narrative — ${fyLabel}`);
  lines.push("");
  lines.push(
    `Scope: ${propertyLabel}. Generated ${generatedAt.toISOString().slice(0, 10)} directly from ` +
      "live SafeGuard records. Every figure below is drawn from the same KPI engine that powers " +
      "the dashboard tiles — this narrative adds no numbers of its own.",
  );
  lines.push("");

  const total = findKpi(kpis, "TOTAL_INCIDENTS");
  const fatalities = findKpi(kpis, "FATALITIES");
  const lti = findKpi(kpis, "LTI");
  const highPotential = findKpi(kpis, "HIGH_POTENTIAL");
  const nearMisses = findKpi(kpis, "NEAR_MISSES");

  lines.push("## Executive summary");
  lines.push("");
  if (total) {
    lines.push(
      `${fmt(total.currentValue, total.unit)} incidents were recorded, ${varianceClause(total)}.`,
    );
  }
  if (fatalities) {
    const fatalCount = fatalities.currentValue ?? 0;
    lines.push(
      fatalCount > 0
        ? `**${fmt(fatalities.currentValue, fatalities.unit)} fatality/fatalities occurred — this requires immediate board attention and is not summarised further here.**`
        : "No fatalities were recorded in the period.",
    );
  }
  if (lti) {
    lines.push(
      `${fmt(lti.currentValue, lti.unit)} lost-time injuries were recorded, ${varianceClause(lti)}.`,
    );
  }
  if (highPotential) {
    lines.push(
      `${fmt(highPotential.currentValue, highPotential.unit)} incidents were classified high-potential ` +
        `(actual outcome minor, but the potential severity was significant) — these are leading indicators ` +
        "worth reviewing individually, not just counting.",
    );
  }
  if (nearMisses) {
    lines.push(
      `${fmt(nearMisses.currentValue, nearMisses.unit)} near-misses were reported, ${varianceClause(nearMisses)}.`,
    );
  }
  lines.push("");

  lines.push("## Injuries and outcomes");
  lines.push("");
  for (const code of [
    "RECORDABLE_INJURIES",
    "HOSPITAL_REFERRALS",
    "REPORTABLE_OSH_CASES",
    "MTC",
  ]) {
    const kpi = findKpi(kpis, code);
    if (!kpi) continue;
    lines.push(
      `- **${kpi.name}**: ${fmt(kpi.currentValue, kpi.unit)} (${varianceClause(kpi)})`,
    );
  }
  const cost = findKpi(kpis, "INCIDENT_COST");
  if (cost) {
    lines.push(
      `- **Incident cost**: ${fmt(cost.currentValue, cost.unit)} (${varianceClause(cost)})`,
    );
  }
  lines.push("");

  lines.push("## Corrective actions and findings");
  lines.push("");
  const capaEff = findKpi(kpis, "CAPA_EFFECTIVENESS");
  const capaOnTime = findKpi(kpis, "CAPA_ON_TIME");
  const openFindings = findKpi(kpis, "OPEN_CRIT_MAJOR_FINDINGS");
  if (capaOnTime) {
    lines.push(
      `${fmt(capaOnTime.currentValue, capaOnTime.unit)} of corrective actions closed in the period were closed on time.`,
    );
  }
  if (capaEff) {
    lines.push(
      `${fmt(capaEff.currentValue, capaEff.unit)} of verified corrective actions were found effective by an ` +
        "independent verifier (owner and verifier are always different people by design).",
    );
  }
  if (openFindings) {
    const n = openFindings.currentValue ?? 0;
    lines.push(
      n > 0
        ? `${fmt(openFindings.currentValue, openFindings.unit)} critical or major audit findings remain open.`
        : "No critical or major audit findings are currently open.",
    );
  }
  lines.push("");

  lines.push("## Framework and legal readiness");
  lines.push("");
  const iso = findKpi(kpis, "ISO45001_READINESS");
  const legal = findKpi(kpis, "LEGAL_COMPLIANCE");
  if (iso) {
    lines.push(
      `ISO 45001 control readiness: ${fmt(iso.currentValue, iso.unit)} (min-of-dimension score, capped by any critical gap).`,
    );
  }
  if (legal) {
    lines.push(
      `Mauritius legal-requirement readiness: ${fmt(legal.currentValue, legal.unit)} (min-of-dimension score, capped by any critical gap).`,
    );
  }
  lines.push("");

  lines.push("## Data quality caveats");
  lines.push("");
  const flagged = dataQuality.filter((r) => r.count > 0);
  if (flagged.length === 0) {
    lines.push("No data-quality gaps were flagged against this period's own records.");
  } else {
    lines.push(
      "The figures above are drawn from records with the following known gaps — reconcile these " +
        "before this narrative is presented externally:",
    );
    for (const row of flagged) {
      lines.push(`- ${row.label}: ${row.count}`);
    }
  }
  lines.push("");
  lines.push(
    "_This narrative is auto-generated from live operational data. It is a management report, " +
      "not an independently assured statement — see the assurance pack export for the ISAE " +
      "3000-aligned evidence bundle and its own disclaimer._",
  );

  return lines.join("\n");
}

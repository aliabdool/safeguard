import type { DataQualityRow, KpiTileResult } from "./kpi-types";

/**
 * Structured, ISAE-3000-aligned evidence export. "Aligned" means it's organised the way an
 * assurance provider would want the evidence bundle organised (scope, criteria, evidence per
 * criterion, exceptions) — it deliberately never claims that an assurance engagement was actually
 * performed. That claim can only be true once a real external provider signs a real assurance
 * statement; this pack exists to make that engagement possible, not to substitute for it.
 */

export interface OpenFindingRow {
  findingNumber: string;
  classification: string;
  controlCode: string | null;
  description: string;
}

export interface AssurancePackInput {
  fyLabel: string;
  propertyLabel: string;
  generatedAt: Date;
  kpis: KpiTileResult[];
  criticalGapControlCount: number;
  openFindings: OpenFindingRow[];
  capaStatusCounts: Record<string, number>;
  dataQuality: DataQualityRow[];
}

function fmtKpiValue(value: number | null, unit: string): string {
  if (value == null) return "n/a";
  const rounded = Number.isInteger(value) ? value : Math.round(value * 10) / 10;
  return unit === "%" ? `${rounded}%` : rounded.toLocaleString();
}

const DISCLAIMER =
  "**This pack is a management self-assessment prepared to support an ISAE 3000 (Revised) type " +
  "assurance engagement. It has NOT been independently assured. No external assurance provider " +
  "has reviewed, verified or attested to any figure in this document unless it is accompanied by " +
  "a separately signed assurance opinion from that provider.**";

export function buildAssurancePackMarkdown(input: AssurancePackInput): string {
  const {
    fyLabel,
    propertyLabel,
    generatedAt,
    kpis,
    criticalGapControlCount,
    openFindings,
    capaStatusCounts,
    dataQuality,
  } = input;
  const lines: string[] = [];

  lines.push(`# Assurance Readiness Pack — ${fyLabel}`);
  lines.push("");
  lines.push(DISCLAIMER);
  lines.push("");
  lines.push(
    `Scope: ${propertyLabel}. Generated ${generatedAt.toISOString().slice(0, 10)} from live ` +
      "SafeGuard records. Criteria: ISO 45001:2018 and the Mauritius OSH Act 2005 control " +
      "library, GRI 403 and IFRS S2 mappings where applicable (see /framework in the app for the " +
      "full control-to-framework mapping).",
  );
  lines.push("");

  lines.push("## 1. KPI evidence table");
  lines.push("");
  lines.push("| KPI | Current | Comparison | Data quality | Records included (n) |");
  lines.push("| --- | --- | --- | --- | --- |");
  for (const kpi of kpis) {
    lines.push(
      `| ${kpi.name} | ${fmtKpiValue(kpi.currentValue, kpi.unit)} | ` +
        `${fmtKpiValue(kpi.comparisonValue, kpi.unit)} | ${kpi.dataQualityStatus} | ` +
        `${kpi.includedRecordIds.length} |`,
    );
  }
  lines.push("");
  lines.push(
    "Each row's underlying record IDs are retained in the `kpi_calculations` snapshot table " +
      "(append-only) so this figure can be reconstructed and traced back to source records at " +
      "any later date — see docs/kpi-catalogue.md §5.",
  );
  lines.push("");

  lines.push("## 2. Control readiness and critical gaps");
  lines.push("");
  lines.push(
    criticalGapControlCount > 0
      ? `**${criticalGapControlCount} control(s) currently carry a critical-gap flag** — by design, ` +
          "a critical gap caps the readiness score for its framework regardless of other dimensions " +
          "scoring well (see the ISO 45001 / legal-compliance KPI rows above)."
      : "No controls currently carry a critical-gap flag against this scope.",
  );
  lines.push("");

  lines.push("## 3. Open critical/major audit findings");
  lines.push("");
  if (openFindings.length === 0) {
    lines.push("No open critical or major non-conformances against this scope.");
  } else {
    lines.push("| Finding | Classification | Control | Description |");
    lines.push("| --- | --- | --- | --- |");
    for (const f of openFindings) {
      lines.push(
        `| ${f.findingNumber} | ${f.classification} | ${f.controlCode ?? "—"} | ${f.description} |`,
      );
    }
  }
  lines.push("");

  lines.push("## 4. Corrective action (CAPA) status");
  lines.push("");
  const statusEntries = Object.entries(capaStatusCounts);
  if (statusEntries.length === 0) {
    lines.push("No corrective actions recorded against this scope.");
  } else {
    lines.push("| Status | Count |");
    lines.push("| --- | --- |");
    for (const [status, count] of statusEntries) {
      lines.push(`| ${status} | ${count} |`);
    }
  }
  lines.push("");

  lines.push("## 5. Data quality exceptions");
  lines.push("");
  const flagged = dataQuality.filter((r) => r.count > 0);
  if (flagged.length === 0) {
    lines.push("No data-quality exceptions flagged against this period's own records.");
  } else {
    lines.push("| Exception | Count |");
    lines.push("| --- | --- |");
    for (const row of flagged) {
      lines.push(`| ${row.label} | ${row.count} |`);
    }
  }
  lines.push("");
  lines.push("---");
  lines.push("");
  lines.push(DISCLAIMER);

  return lines.join("\n");
}

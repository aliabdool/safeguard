import type { KpiTile } from "./types";
import type { FrameworkGaugeData } from "../components/FrameworkStrip";

/** The seven-item framework readiness strip, built from whatever KPI tiles are already on the
 * dashboard response — never a separate live recompute per page load. Labeling rules are exact,
 * per docs/2026-07-zoho-catalyst-access-and-dashboard-model.md §4: never "certification
 * compliance" for anything but ISO 45001, and SASB/UNGC are reference alignment, not a scored %. */
export function buildFrameworkGauges(tiles: KpiTile[]): FrameworkGaugeData[] {
  const find = (code: string) => tiles.find((t) => t.kpiCode === code)?.currentValue ?? null;
  return [
    { code: "ISO45001", label: "ISO 45001", readinessLabel: "Certification readiness", valuePct: find("ISO45001_READINESS"), scored: true },
    { code: "GRI403", label: "GRI 403", readinessLabel: "Disclosure readiness", valuePct: null, scored: true },
    { code: "MU_LEGAL", label: "Mauritius OSH Act", readinessLabel: "Legal readiness", valuePct: find("LEGAL_COMPLIANCE"), scored: true },
    { code: "IFRS_S1", label: "IFRS S1", readinessLabel: "Financial materiality / governance / risk evidence readiness", valuePct: null, scored: true },
    { code: "IFRS_S2", label: "IFRS S2", readinessLabel: "Climate-related H&S risk readiness (not ordinary incidents)", valuePct: null, scored: true },
    { code: "SASB_HOTELS", label: "SASB Hotels & Lodging", readinessLabel: "Indirect alignment only", valuePct: null, scored: false },
    { code: "UNGC_ILO", label: "UNGC / ILO-OSH", readinessLabel: "Alignment", valuePct: null, scored: false },
  ];
}

/**
 * Groups the framework catalogue into the categories the brief calls out (see chat: "never present
 * all frameworks as equivalent certification standards") — a certifiable management system
 * standard, an audit methodology, sustainability disclosure standards, voluntary principles, and
 * SDG contribution mapping are different kinds of things, and the framework list page should read
 * that way. Pure, no DB — the live Frameworks catalogue is fetched by the page and grouped through
 * mapFrameworkCodeToCategory() below, so a framework code with no explicit mapping still surfaces
 * (under "other"), never silently disappearing from the page.
 */

export const FRAMEWORK_CATEGORIES = [
  "certification",
  "audit_methodology",
  "disclosure",
  "principles",
  "sdg",
  "other",
] as const;

export type FrameworkCategory = (typeof FRAMEWORK_CATEGORIES)[number];

export const FRAMEWORK_CATEGORY_LABELS: Record<FrameworkCategory, string> = {
  certification: "Certification / Management System",
  audit_methodology: "Audit Methodology",
  disclosure: "Disclosure / Sustainability",
  principles: "Principles / Alignment",
  sdg: "SDG Contribution",
  other: "Operational & Legal",
};

export const FRAMEWORK_CATEGORY_DESCRIPTIONS: Record<FrameworkCategory, string> = {
  certification: "A certifiable occupational H&S management system standard.",
  audit_methodology:
    "Guidance on how audits themselves are planned and conducted, not a control library to certify against.",
  disclosure:
    "External sustainability/ESG disclosure standards — readiness here means evidence readiness for reporting, not certification.",
  principles: "Voluntary principles and international labour alignment commitments.",
  sdg: 'Contribution mapping against the UN Sustainable Development Goals — never a fabricated "SDG compliance %".',
  other:
    "Frameworks in the live catalogue that are operational or jurisdiction-specific rather than an external certification/disclosure/principles standard.",
};

/**
 * Known live Frameworks.code -> category. Kept as an explicit table (not inferred from the code
 * string) so a new framework code added to the catalogue is a deliberate, reviewable one-line
 * addition here rather than a guess.
 */
const KNOWN_CATEGORY_BY_CODE: Record<string, FrameworkCategory> = {
  ISO45001: "certification",
  ISO19011: "audit_methodology",
  GRI403: "disclosure",
  IFRS_S1: "disclosure",
  IFRS_S2: "disclosure",
  SASB_HOTELS: "disclosure",
  UNGC: "principles",
  ILO_OSH: "principles",
  SDG: "sdg",
  HOTEL_OPS: "other",
  MU_LEGAL: "other",
};

/** A framework code with no explicit entry above maps to "other" rather than being dropped from
 * the page — see module doc comment. */
export function mapFrameworkCodeToCategory(code: string): FrameworkCategory {
  return KNOWN_CATEGORY_BY_CODE[code] ?? "other";
}

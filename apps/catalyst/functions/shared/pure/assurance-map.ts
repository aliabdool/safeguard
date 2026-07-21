/**
 * Pure assurance evidence map filtering/shaping — no DB. The Function assembles already-joined
 * rows (Framework -> Requirement -> Control -> Evidence -> KPI/Finding/CAPA), this module applies
 * the filters and produces the display shape. This is the core differentiator screen management
 * named explicitly — Framework -> Requirement -> Control -> Evidence -> KPI/Finding/CAPA -> Report.
 */
import { computeControlMaturity, type DimensionScores } from "./maturity";

export interface EvidenceLinkSummary {
  documentVersionId: string;
  isCurrentlyValid: boolean;
}

export interface EvidenceMapInputRow {
  frameworkCode: string;
  requirementRef: string;
  requirementTitle: string;
  controlId: string;
  controlCode: string;
  controlTitle: string;
  propertyId: string | null;
  departmentId: string | null;
  latestScores: DimensionScores;
  hasOpenCriticalGap: boolean;
  evidenceLinks: EvidenceLinkSummary[];
  linkedKpiCodes: string[];
  linkedFindingIds: string[];
  linkedCapaIds: string[];
  reportRelevant: boolean;
}

export interface EvidenceMapFilters {
  frameworkCode?: string;
  propertyId?: string;
  departmentId?: string;
  evidenceStatus?: "valid" | "expired" | "missing";
  criticalGapOnly?: boolean;
  expiredEvidenceOnly?: boolean;
  reportRelevantOnly?: boolean;
}

export interface EvidenceMapRow {
  frameworkCode: string;
  requirementRef: string;
  requirementTitle: string;
  controlCode: string;
  controlTitle: string;
  maturityScore: number | null;
  hasCriticalGap: boolean;
  totalEvidenceLinks: number;
  validEvidenceCount: number;
  expiredEvidenceCount: number;
  linkedKpiCodes: string[];
  linkedFindingIds: string[];
  linkedCapaIds: string[];
}

export function buildEvidenceMap(
  rows: EvidenceMapInputRow[],
  filters: EvidenceMapFilters,
): EvidenceMapRow[] {
  return rows
    .filter((r) => !filters.frameworkCode || r.frameworkCode === filters.frameworkCode)
    .filter((r) => !filters.propertyId || r.propertyId === filters.propertyId)
    .filter((r) => !filters.departmentId || r.departmentId === filters.departmentId)
    .filter((r) => !filters.criticalGapOnly || r.hasOpenCriticalGap)
    .filter((r) => !filters.expiredEvidenceOnly || r.evidenceLinks.some((e) => !e.isCurrentlyValid))
    .filter((r) => !filters.reportRelevantOnly || r.reportRelevant)
    .filter((r) => matchesEvidenceStatus(r, filters.evidenceStatus))
    .map((r) => ({
      frameworkCode: r.frameworkCode,
      requirementRef: r.requirementRef,
      requirementTitle: r.requirementTitle,
      controlCode: r.controlCode,
      controlTitle: r.controlTitle,
      maturityScore: computeControlMaturity(r.latestScores),
      hasCriticalGap: r.hasOpenCriticalGap,
      totalEvidenceLinks: r.evidenceLinks.length,
      validEvidenceCount: r.evidenceLinks.filter((e) => e.isCurrentlyValid).length,
      expiredEvidenceCount: r.evidenceLinks.filter((e) => !e.isCurrentlyValid).length,
      linkedKpiCodes: r.linkedKpiCodes,
      linkedFindingIds: r.linkedFindingIds,
      linkedCapaIds: r.linkedCapaIds,
    }));
}

function matchesEvidenceStatus(row: EvidenceMapInputRow, status?: EvidenceMapFilters["evidenceStatus"]): boolean {
  if (!status) return true;
  const valid = row.evidenceLinks.filter((e) => e.isCurrentlyValid).length;
  const expired = row.evidenceLinks.filter((e) => !e.isCurrentlyValid).length;
  if (status === "valid") return valid > 0;
  if (status === "expired") return expired > 0;
  return row.evidenceLinks.length === 0; // "missing"
}

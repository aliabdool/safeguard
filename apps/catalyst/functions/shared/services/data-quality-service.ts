/**
 * Data-quality exception scanning service. Runs the nine pure rules in
 * pure/data-quality-rules.ts against caller-supplied candidate records, then reconciles against
 * currently-open exceptions: a newly-detected problem opens a row, a previously-open exception no
 * longer detected is resolved (never deleted) — same open/resolve discipline as CriticalGaps.
 */
import {
  checkAuditFindingClosedWithoutEvidence,
  checkCapaOverdueWithoutVerifierUpdate,
  checkClimateRiskMissingResidualScore,
  checkControlScoredWithoutApprovedEvidence,
  checkExpiredDocumentStillLinkedAsEvidence,
  checkHospitalReferralPendingReportability,
  checkInvestigationMissingCloseDate,
  checkKpiMissingDenominator,
  checkMaterialTopicMissingFinancialScore,
  type DataQualityException,
} from "../pure/data-quality-rules";

export interface DataQualityExceptionRecord extends DataQualityException {
  id: string;
  status: "open" | "resolved";
}

export interface DataQualityRepo {
  listOpenExceptions(): Promise<DataQualityExceptionRecord[]>;
  insertException(exc: DataQualityException): Promise<DataQualityExceptionRecord>;
  resolveException(id: string): Promise<void>;
}

export interface DataQualityCandidates {
  kpis: Parameters<typeof checkKpiMissingDenominator>[0][];
  investigations: Parameters<typeof checkInvestigationMissingCloseDate>[0][];
  capas: Array<Parameters<typeof checkCapaOverdueWithoutVerifierUpdate>[0]>;
  expiredEvidenceLinks: Parameters<typeof checkExpiredDocumentStillLinkedAsEvidence>[0][];
  hospitalReferralIncidents: Array<Parameters<typeof checkHospitalReferralPendingReportability>[0]>;
  closedFindings: Parameters<typeof checkAuditFindingClosedWithoutEvidence>[0][];
  scoredControls: Parameters<typeof checkControlScoredWithoutApprovedEvidence>[0][];
  materialTopics: Parameters<typeof checkMaterialTopicMissingFinancialScore>[0][];
  climateRisks: Parameters<typeof checkClimateRiskMissingResidualScore>[0][];
}

export async function scanForExceptions(
  repo: DataQualityRepo,
  candidates: DataQualityCandidates,
  asOf: Date,
): Promise<{ opened: DataQualityExceptionRecord[]; resolvedIds: string[] }> {
  const detected: DataQualityException[] = [];
  for (const k of candidates.kpis) addIfPresent(detected, checkKpiMissingDenominator(k));
  for (const i of candidates.investigations) addIfPresent(detected, checkInvestigationMissingCloseDate(i));
  for (const c of candidates.capas) addIfPresent(detected, checkCapaOverdueWithoutVerifierUpdate(c, asOf));
  for (const l of candidates.expiredEvidenceLinks) addIfPresent(detected, checkExpiredDocumentStillLinkedAsEvidence(l));
  for (const inc of candidates.hospitalReferralIncidents) addIfPresent(detected, checkHospitalReferralPendingReportability(inc, asOf));
  for (const f of candidates.closedFindings) addIfPresent(detected, checkAuditFindingClosedWithoutEvidence(f));
  for (const s of candidates.scoredControls) addIfPresent(detected, checkControlScoredWithoutApprovedEvidence(s));
  for (const t of candidates.materialTopics) addIfPresent(detected, checkMaterialTopicMissingFinancialScore(t));
  for (const r of candidates.climateRisks) addIfPresent(detected, checkClimateRiskMissingResidualScore(r));

  const existingOpen = await repo.listOpenExceptions();
  const existingKeys = new Set(existingOpen.map((e) => key(e.module, e.recordId)));
  const detectedKeys = new Set(detected.map((e) => key(e.module, e.recordId)));

  const opened: DataQualityExceptionRecord[] = [];
  for (const exc of detected) {
    if (!existingKeys.has(key(exc.module, exc.recordId))) {
      opened.push(await repo.insertException(exc));
    }
  }

  const resolvedIds: string[] = [];
  for (const existing of existingOpen) {
    if (!detectedKeys.has(key(existing.module, existing.recordId))) {
      await repo.resolveException(existing.id);
      resolvedIds.push(existing.id);
    }
  }

  return { opened, resolvedIds };
}

function addIfPresent(list: DataQualityException[], exc: DataQualityException | null): void {
  if (exc) list.push(exc);
}

function key(module: string, recordId: string): string {
  return `${module}:${recordId}`;
}

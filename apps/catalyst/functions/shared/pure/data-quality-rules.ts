/**
 * Pure data-quality exception rules — no DB. Each function inspects one already-fetched candidate
 * record and returns an exception if the rule is violated, or null if it's fine. The nine rules
 * management named explicitly, in order.
 */

export type ExceptionSeverity = "critical" | "major" | "minor";

export interface DataQualityException {
  severity: ExceptionSeverity;
  module: string;
  recordId: string;
  propertyId: string | null;
  description: string;
  suggestedFix: string;
}

/** 1. Missing denominator — a KPI whose calculation depends on a denominator (e.g. hours worked,
 * occupied room nights) that hasn't been supplied yet. */
export function checkKpiMissingDenominator(kpi: {
  kpiCode: string;
  propertyId: string | null;
  dataQualityStatus: "ok" | "unverified" | "incomplete";
  currentValue: number | null;
}): DataQualityException | null {
  if (kpi.dataQualityStatus !== "incomplete" || kpi.currentValue !== null) return null;
  return {
    severity: "major",
    module: "KPI",
    recordId: kpi.kpiCode,
    propertyId: kpi.propertyId,
    description: `${kpi.kpiCode} could not be calculated — a required denominator or source record is missing.`,
    suggestedFix: "Supply the missing source data (e.g. hours worked, verification records) for this period.",
  };
}

/** 2. Missing investigation close date — an investigation marked complete with no completedAt. */
export function checkInvestigationMissingCloseDate(investigation: {
  id: string;
  propertyId: string;
  status: string;
  completedAt: string | null;
}): DataQualityException | null {
  if (investigation.status !== "completed" || investigation.completedAt) return null;
  return {
    severity: "minor",
    module: "Incidents",
    recordId: investigation.id,
    propertyId: investigation.propertyId,
    description: "Investigation is marked completed but has no close date recorded.",
    suggestedFix: "Set the investigation's completion date.",
  };
}

/** 3. CAPA overdue without verifier update — past due_date, still open/in_progress, and no
 * verification decision has been recorded at all. */
export function checkCapaOverdueWithoutVerifierUpdate(
  capa: { id: string; propertyId: string; dueDate: string; status: string; hasVerification: boolean },
  asOf: Date,
): DataQualityException | null {
  const isOverdue = new Date(`${capa.dueDate}T23:59:59Z`) < asOf;
  const isOpenState = capa.status === "open" || capa.status === "in_progress" || capa.status === "pending_verification";
  if (!isOverdue || !isOpenState || capa.hasVerification) return null;
  return {
    severity: "major",
    module: "CAPA",
    recordId: capa.id,
    propertyId: capa.propertyId,
    description: "CAPA is overdue and the designated verifier has not recorded any update.",
    suggestedFix: "Escalate to the designated verifier for a status update or verification decision.",
  };
}

/** 4. Document expired but still linked as evidence. */
export function checkExpiredDocumentStillLinkedAsEvidence(link: {
  id: string;
  propertyId: string | null;
  isExpired: boolean;
  linkedEntityType: string;
  linkedEntityId: string;
}): DataQualityException | null {
  if (!link.isExpired) return null;
  return {
    severity: "critical",
    module: "Documents",
    recordId: link.id,
    propertyId: link.propertyId,
    description: `An expired document is still linked as evidence to ${link.linkedEntityType} ${link.linkedEntityId}.`,
    suggestedFix: "Upload a renewed version and re-link, or remove the expired link.",
  };
}

/** 5. Incident marked hospital referral but OSH reportability still pending — hospital_referral
 * and reportable_status are deliberately independent fields (Phase 5); a hospital referral should
 * prompt a timely reportability determination, not leave it pending indefinitely. */
export function checkHospitalReferralPendingReportability(incident: {
  id: string;
  propertyId: string;
  hospitalReferral: boolean;
  reportableStatus: string;
  occurredAt: string;
}, asOf: Date, gracePeriodDays = 7): DataQualityException | null {
  if (!incident.hospitalReferral || incident.reportableStatus !== "pending_determination") return null;
  const daysSince = (asOf.getTime() - new Date(incident.occurredAt).getTime()) / 86_400_000;
  if (daysSince < gracePeriodDays) return null;
  return {
    severity: "critical",
    module: "Incidents",
    recordId: incident.id,
    propertyId: incident.propertyId,
    description: "Incident involved a hospital referral but statutory OSH reportability is still pending determination.",
    suggestedFix: "Make and record the statutory reportability determination without further delay.",
  };
}

/** 6. Audit finding closed without evidence. */
export function checkAuditFindingClosedWithoutEvidence(finding: {
  id: string;
  propertyId: string;
  status: string;
  hasEvidence: boolean;
}): DataQualityException | null {
  if (finding.status !== "closed" || finding.hasEvidence) return null;
  return {
    severity: "major",
    module: "Audits",
    recordId: finding.id,
    propertyId: finding.propertyId,
    description: "Audit finding was closed without any evidence linked.",
    suggestedFix: "Link the closure evidence, or reopen the finding until it exists.",
  };
}

/** 7. Control scored without approved evidence — a maturity score of 2 or higher implies
 * something was actually verified, which should have qualifying evidence behind it. */
export function checkControlScoredWithoutApprovedEvidence(assessment: {
  id: string;
  propertyId: string;
  maturityScore: number;
  hasApprovedEvidence: boolean;
}): DataQualityException | null {
  if (assessment.maturityScore < 2 || assessment.hasApprovedEvidence) return null;
  return {
    severity: "major",
    module: "Controls",
    recordId: assessment.id,
    propertyId: assessment.propertyId,
    description: `Control scored ${assessment.maturityScore} with no approved evidence linked.`,
    suggestedFix: "Link approved evidence supporting this score, or lower the score to reflect what's actually verifiable.",
  };
}

/** 8. Materiality topic missing financial score. */
export function checkMaterialTopicMissingFinancialScore(topic: {
  id: string;
  propertyId: string | null;
  ifrsFinancialMaterialityScore: number | null;
}): DataQualityException | null {
  if (topic.ifrsFinancialMaterialityScore != null) return null;
  return {
    severity: "minor",
    module: "Materiality",
    recordId: topic.id,
    propertyId: topic.propertyId,
    description: "Material topic has no IFRS S1 financial materiality score recorded.",
    suggestedFix: "Complete the financial materiality assessment for this topic.",
  };
}

/** 9. Climate risk missing residual risk score. */
export function checkClimateRiskMissingResidualScore(risk: {
  id: string;
  propertyId: string;
  residualRiskScore: number | null;
}): DataQualityException | null {
  if (risk.residualRiskScore != null) return null;
  return {
    severity: "minor",
    module: "Climate",
    recordId: risk.id,
    propertyId: risk.propertyId,
    description: "Climate-related H&S risk has no residual risk score recorded.",
    suggestedFix: "Complete the residual-risk assessment (after controls/adaptation actions) for this risk.",
  };
}

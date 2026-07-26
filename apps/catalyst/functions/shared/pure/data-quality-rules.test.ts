import { describe, expect, it } from "vitest";

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
} from "./data-quality-rules";

const ASOF = new Date("2026-07-21T00:00:00Z");

describe("1. missing denominator", () => {
  it("flags a KPI that could not be calculated", () => {
    const result = checkKpiMissingDenominator({ kpiCode: "LTIFR", propertyId: "prop-a", dataQualityStatus: "incomplete", currentValue: null });
    expect(result?.module).toBe("KPI");
  });
  it("does not flag a KPI with a real, calculated value (including a genuine 0)", () => {
    expect(checkKpiMissingDenominator({ kpiCode: "FATALITIES", propertyId: "prop-a", dataQualityStatus: "ok", currentValue: 0 })).toBeNull();
  });
});

describe("2. missing investigation close date", () => {
  it("flags a completed investigation with no close date", () => {
    const result = checkInvestigationMissingCloseDate({ id: "inv-1", propertyId: "prop-a", status: "completed", completedAt: null });
    expect(result?.module).toBe("Incidents");
  });
  it("does not flag an in-progress investigation", () => {
    expect(checkInvestigationMissingCloseDate({ id: "inv-2", propertyId: "prop-a", status: "in_progress", completedAt: null })).toBeNull();
  });
});

describe("3. CAPA overdue without verifier update", () => {
  it("flags an overdue, open CAPA with no verification recorded", () => {
    const result = checkCapaOverdueWithoutVerifierUpdate(
      { id: "capa-1", propertyId: "prop-a", dueDate: "2026-01-01", status: "in_progress", hasVerification: false },
      ASOF,
    );
    expect(result?.module).toBe("CAPA");
  });
  it("does not flag an overdue CAPA that has at least one verification decision", () => {
    expect(
      checkCapaOverdueWithoutVerifierUpdate(
        { id: "capa-2", propertyId: "prop-a", dueDate: "2026-01-01", status: "pending_verification", hasVerification: true },
        ASOF,
      ),
    ).toBeNull();
  });
});

describe("4. document expired but still linked as evidence", () => {
  it("flags an expired evidence link", () => {
    const result = checkExpiredDocumentStillLinkedAsEvidence({
      id: "link-1", propertyId: "prop-a", isExpired: true, linkedEntityType: "control_assessment", linkedEntityId: "assessment-1",
    });
    expect(result?.severity).toBe("critical");
  });
});

describe("5. hospital referral but OSH reportability pending", () => {
  it("flags after the grace period", () => {
    const result = checkHospitalReferralPendingReportability(
      { id: "inc-1", propertyId: "prop-a", hospitalReferral: true, reportableStatus: "pending_determination", occurredAt: "2026-07-01T00:00:00Z" },
      ASOF,
    );
    expect(result?.severity).toBe("critical");
  });
  it("does not flag within the grace period", () => {
    expect(
      checkHospitalReferralPendingReportability(
        { id: "inc-2", propertyId: "prop-a", hospitalReferral: true, reportableStatus: "pending_determination", occurredAt: "2026-07-20T00:00:00Z" },
        ASOF,
      ),
    ).toBeNull();
  });
  it("does not flag once determined", () => {
    expect(
      checkHospitalReferralPendingReportability(
        { id: "inc-3", propertyId: "prop-a", hospitalReferral: true, reportableStatus: "yes", occurredAt: "2026-07-01T00:00:00Z" },
        ASOF,
      ),
    ).toBeNull();
  });
});

describe("6. audit finding closed without evidence", () => {
  it("flags a closed finding with no evidence", () => {
    const result = checkAuditFindingClosedWithoutEvidence({ id: "finding-1", propertyId: "prop-a", status: "closed", hasEvidence: false });
    expect(result?.module).toBe("Audits");
  });
});

describe("7. control scored without approved evidence", () => {
  it("flags a maturity score >= 2 with no evidence", () => {
    const result = checkControlScoredWithoutApprovedEvidence({ id: "assess-1", propertyId: "prop-a", maturityScore: 3, hasApprovedEvidence: false });
    expect(result?.module).toBe("Controls");
  });
  it("does not flag a low score (nothing was claimed to be verified)", () => {
    expect(checkControlScoredWithoutApprovedEvidence({ id: "assess-2", propertyId: "prop-a", maturityScore: 1, hasApprovedEvidence: false })).toBeNull();
  });
});

describe("8. materiality topic missing financial score", () => {
  it("flags a null IFRS financial materiality score", () => {
    const result = checkMaterialTopicMissingFinancialScore({ id: "topic-1", propertyId: null, ifrsFinancialMaterialityScore: null });
    expect(result?.module).toBe("Materiality");
  });
});

describe("9. climate risk missing residual risk score", () => {
  it("flags a null residual risk score", () => {
    const result = checkClimateRiskMissingResidualScore({ id: "risk-1", propertyId: "prop-a", residualRiskScore: null });
    expect(result?.module).toBe("Climate");
  });
  it("does not flag once a residual score (including 0) is recorded", () => {
    expect(checkClimateRiskMissingResidualScore({ id: "risk-2", propertyId: "prop-a", residualRiskScore: 0 })).toBeNull();
  });
});

import { describe, expect, it } from "vitest";

import {
  checkAuditFindingAssigned,
  checkCapaAssigned,
  checkCapaDueSoon,
  checkCapaOverdue,
  checkCapaVerificationPending,
  checkCriticalFindingOverdue,
  checkCriticalGapCreated,
  checkDocumentApprovalRequired,
  checkDocumentExpired,
  checkDocumentExpiringSoon,
  checkFatalityReported,
  checkIncidentAwaitingInvestigation,
  checkSeriousIncidentReported,
  checkStatutoryReportabilityPending,
} from "./notification-rules";

const ASOF = new Date("2026-07-21T00:00:00Z");

describe("the fourteen named notification triggers", () => {
  it("1. CAPA assigned fires only on the assignment event, not every read", () => {
    expect(checkCapaAssigned({ id: "capa-1", propertyId: "p", ownerId: "u1", justAssigned: true })?.notificationType).toBe("capa_assigned");
    expect(checkCapaAssigned({ id: "capa-1", propertyId: "p", ownerId: "u1", justAssigned: false })).toBeNull();
  });

  it("2. CAPA due in 7 days fires inside the window, not before or after", () => {
    expect(checkCapaDueSoon({ id: "c", propertyId: "p", ownerId: "u1", dueDate: "2026-07-25", status: "in_progress" }, ASOF)).not.toBeNull();
    expect(checkCapaDueSoon({ id: "c", propertyId: "p", ownerId: "u1", dueDate: "2026-09-01", status: "in_progress" }, ASOF)).toBeNull();
    expect(checkCapaDueSoon({ id: "c", propertyId: "p", ownerId: "u1", dueDate: "2026-07-25", status: "verified" }, ASOF)).toBeNull();
  });

  it("3. CAPA overdue fires past due_date while still open", () => {
    expect(checkCapaOverdue({ id: "c", propertyId: "p", ownerId: "u1", dueDate: "2026-01-01", status: "in_progress" }, ASOF)?.severity).toBe("critical");
    expect(checkCapaOverdue({ id: "c", propertyId: "p", ownerId: "u1", dueDate: "2026-01-01", status: "closed" }, ASOF)).toBeNull();
  });

  it("4. CAPA verification pending fires only in pending_verification status", () => {
    expect(checkCapaVerificationPending({ id: "c", propertyId: "p", verifierId: "u2", status: "pending_verification" })?.recipientUserId).toBe("u2");
    expect(checkCapaVerificationPending({ id: "c", propertyId: "p", verifierId: "u2", status: "in_progress" })).toBeNull();
  });

  it("5. Document approval required fires for pending_approval", () => {
    expect(checkDocumentApprovalRequired({ id: "d", propertyId: "p", approverId: "u3", status: "pending_approval" })).not.toBeNull();
  });

  it("6. Document expiring in 30 days fires inside the window", () => {
    expect(checkDocumentExpiringSoon({ id: "d", propertyId: "p", ownerId: "u1", expiryDate: "2026-08-01" }, ASOF)).not.toBeNull();
    expect(checkDocumentExpiringSoon({ id: "d", propertyId: "p", ownerId: "u1", expiryDate: "2027-01-01" }, ASOF)).toBeNull();
  });

  it("7. Document expired fires once past expiry", () => {
    expect(checkDocumentExpired({ id: "d", propertyId: "p", ownerId: "u1", expiryDate: "2026-01-01" }, ASOF)?.severity).toBe("critical");
  });

  it("8. Audit finding assigned fires on assignment", () => {
    expect(checkAuditFindingAssigned({ id: "f", propertyId: "p", ownerId: "u4", justAssigned: true })).not.toBeNull();
  });

  it("9. Critical finding overdue fires past the SLA", () => {
    expect(
      checkCriticalFindingOverdue({ id: "f", propertyId: "p", ownerId: "u4", classification: "critical_nc", status: "open", raisedAt: "2026-06-01T00:00:00Z" }, ASOF),
    ).not.toBeNull();
    expect(
      checkCriticalFindingOverdue({ id: "f", propertyId: "p", ownerId: "u4", classification: "minor_nc", status: "open", raisedAt: "2026-06-01T00:00:00Z" }, ASOF),
    ).toBeNull();
  });

  it("10. Incident awaiting investigation fires after the grace period", () => {
    expect(
      checkIncidentAwaitingInvestigation({ id: "i", propertyId: "p", hsOfficerId: "u5", status: "reported", occurredAt: "2026-07-01T00:00:00Z" }, ASOF),
    ).not.toBeNull();
  });

  it("11. Statutory reportability pending fires after the grace period", () => {
    expect(
      checkStatutoryReportabilityPending({ id: "i", propertyId: "p", hsOfficerId: "u5", reportableStatus: "pending_determination", occurredAt: "2026-07-01T00:00:00Z" }, ASOF)?.severity,
    ).toBe("critical");
  });

  it("12. Critical gap created fires on the create event", () => {
    expect(checkCriticalGapCreated({ id: "g", propertyId: "p", groupHsAdminId: "u6", justCreated: true })).not.toBeNull();
  });

  it("13. Fatality reported always fires as critical", () => {
    expect(checkFatalityReported({ id: "i", propertyId: "p", boardRecipientId: "u7", outcome: "fatality", justReported: true })?.severity).toBe("critical");
    expect(checkFatalityReported({ id: "i", propertyId: "p", boardRecipientId: "u7", outcome: "first_aid", justReported: true })).toBeNull();
  });

  it("14. Serious incident reported fires for hospitalisation/LTI outcomes", () => {
    expect(checkSeriousIncidentReported({ id: "i", propertyId: "p", groupHsAdminId: "u8", outcome: "hospitalisation", justReported: true })).not.toBeNull();
    expect(checkSeriousIncidentReported({ id: "i", propertyId: "p", groupHsAdminId: "u8", outcome: "first_aid", justReported: true })).toBeNull();
  });
});

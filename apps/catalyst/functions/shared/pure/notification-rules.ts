/**
 * Pure notification trigger rules — no DB. The fourteen triggers management named explicitly.
 * Each function inspects one already-fetched candidate record and returns a notification to send,
 * or null. Scaffolded per management's instruction ("implement or scaffold") — the rule logic
 * here is real and tested; actual mail/SMS delivery is deferred to when a provider is configured
 * (see the migration plan doc), same honesty pattern as every other "only you can do this part"
 * item in this migration. Today, a triggered notification is written to the Notifications table
 * for in-app display; nothing here fabricates a delivery that didn't happen.
 */

export type NotificationSeverity = "info" | "warning" | "critical";

export interface NotificationCandidate {
  recipientUserId: string;
  notificationType: string;
  message: string;
  entityType: string;
  entityId: string;
  propertyId: string | null;
  severity: NotificationSeverity;
}

function daysBetween(a: Date, b: Date): number {
  return (b.getTime() - a.getTime()) / 86_400_000;
}

/** 1. CAPA assigned. */
export function checkCapaAssigned(capa: { id: string; propertyId: string; ownerId: string; justAssigned: boolean }): NotificationCandidate | null {
  if (!capa.justAssigned) return null;
  return { recipientUserId: capa.ownerId, notificationType: "capa_assigned", message: "You have been assigned a new corrective action.", entityType: "CAPA", entityId: capa.id, propertyId: capa.propertyId, severity: "info" };
}

/** 2. CAPA due in 7 days. */
export function checkCapaDueSoon(capa: { id: string; propertyId: string; ownerId: string; dueDate: string; status: string }, asOf: Date): NotificationCandidate | null {
  if (capa.status === "closed" || capa.status === "verified") return null;
  const days = daysBetween(asOf, new Date(`${capa.dueDate}T00:00:00Z`));
  if (days < 0 || days > 7) return null;
  return { recipientUserId: capa.ownerId, notificationType: "capa_due_soon", message: `Corrective action is due in ${Math.ceil(days)} day(s).`, entityType: "CAPA", entityId: capa.id, propertyId: capa.propertyId, severity: "warning" };
}

/** 3. CAPA overdue. */
export function checkCapaOverdue(capa: { id: string; propertyId: string; ownerId: string; dueDate: string; status: string }, asOf: Date): NotificationCandidate | null {
  if (capa.status === "closed" || capa.status === "verified") return null;
  if (new Date(`${capa.dueDate}T23:59:59Z`) >= asOf) return null;
  return { recipientUserId: capa.ownerId, notificationType: "capa_overdue", message: "Corrective action is overdue.", entityType: "CAPA", entityId: capa.id, propertyId: capa.propertyId, severity: "critical" };
}

/** 4. CAPA verification pending. */
export function checkCapaVerificationPending(capa: { id: string; propertyId: string; verifierId: string; status: string }): NotificationCandidate | null {
  if (capa.status !== "pending_verification") return null;
  return { recipientUserId: capa.verifierId, notificationType: "capa_verification_pending", message: "A corrective action is awaiting your verification.", entityType: "CAPA", entityId: capa.id, propertyId: capa.propertyId, severity: "warning" };
}

/** 5. Document approval required. */
export function checkDocumentApprovalRequired(doc: { id: string; propertyId: string | null; approverId: string; status: string }): NotificationCandidate | null {
  if (doc.status !== "pending_approval") return null;
  return { recipientUserId: doc.approverId, notificationType: "document_approval_required", message: "A document is awaiting your approval.", entityType: "DocumentVersions", entityId: doc.id, propertyId: doc.propertyId, severity: "info" };
}

/** 6. Document expiring in 30 days. */
export function checkDocumentExpiringSoon(doc: { id: string; propertyId: string | null; ownerId: string; expiryDate: string | null }, asOf: Date): NotificationCandidate | null {
  if (!doc.expiryDate) return null;
  const days = daysBetween(asOf, new Date(`${doc.expiryDate}T00:00:00Z`));
  if (days < 0 || days > 30) return null;
  return { recipientUserId: doc.ownerId, notificationType: "document_expiring_soon", message: `Document expires in ${Math.ceil(days)} day(s).`, entityType: "DocumentVersions", entityId: doc.id, propertyId: doc.propertyId, severity: "warning" };
}

/** 7. Document expired. */
export function checkDocumentExpired(doc: { id: string; propertyId: string | null; ownerId: string; expiryDate: string | null }, asOf: Date): NotificationCandidate | null {
  if (!doc.expiryDate || new Date(`${doc.expiryDate}T23:59:59Z`) >= asOf) return null;
  return { recipientUserId: doc.ownerId, notificationType: "document_expired", message: "Document has expired and needs renewal.", entityType: "DocumentVersions", entityId: doc.id, propertyId: doc.propertyId, severity: "critical" };
}

/** 8. Audit finding assigned. */
export function checkAuditFindingAssigned(finding: { id: string; propertyId: string; ownerId: string; justAssigned: boolean }): NotificationCandidate | null {
  if (!finding.justAssigned) return null;
  return { recipientUserId: finding.ownerId, notificationType: "audit_finding_assigned", message: "You have been assigned an audit finding.", entityType: "AuditFindings", entityId: finding.id, propertyId: finding.propertyId, severity: "info" };
}

/** 9. Critical finding overdue. */
export function checkCriticalFindingOverdue(finding: { id: string; propertyId: string; ownerId: string; classification: string; status: string; raisedAt: string }, asOf: Date, slaDays = 14): NotificationCandidate | null {
  if (finding.classification !== "critical_nc" || finding.status === "closed") return null;
  if (daysBetween(new Date(finding.raisedAt), asOf) < slaDays) return null;
  return { recipientUserId: finding.ownerId, notificationType: "critical_finding_overdue", message: "A critical audit finding remains open beyond its target resolution time.", entityType: "AuditFindings", entityId: finding.id, propertyId: finding.propertyId, severity: "critical" };
}

/** 10. Incident awaiting investigation. */
export function checkIncidentAwaitingInvestigation(incident: { id: string; propertyId: string; hsOfficerId: string; status: string; occurredAt: string }, asOf: Date, graceDays = 2): NotificationCandidate | null {
  if (incident.status !== "reported") return null;
  if (daysBetween(new Date(incident.occurredAt), asOf) < graceDays) return null;
  return { recipientUserId: incident.hsOfficerId, notificationType: "incident_awaiting_investigation", message: "Incident is awaiting investigation.", entityType: "Incidents", entityId: incident.id, propertyId: incident.propertyId, severity: "warning" };
}

/** 11. Statutory reportability review pending. */
export function checkStatutoryReportabilityPending(incident: { id: string; propertyId: string; hsOfficerId: string; reportableStatus: string; occurredAt: string }, asOf: Date, graceDays = 7): NotificationCandidate | null {
  if (incident.reportableStatus !== "pending_determination") return null;
  if (daysBetween(new Date(incident.occurredAt), asOf) < graceDays) return null;
  return { recipientUserId: incident.hsOfficerId, notificationType: "statutory_reportability_pending", message: "Statutory OSH reportability determination is still pending.", entityType: "IncidentOSHReportability", entityId: incident.id, propertyId: incident.propertyId, severity: "critical" };
}

/** 12. Critical gap created. */
export function checkCriticalGapCreated(gap: { id: string; propertyId: string; groupHsAdminId: string; justCreated: boolean }): NotificationCandidate | null {
  if (!gap.justCreated) return null;
  return { recipientUserId: gap.groupHsAdminId, notificationType: "critical_gap_created", message: "A new critical control gap has been identified.", entityType: "CriticalGaps", entityId: gap.id, propertyId: gap.propertyId, severity: "critical" };
}

/** 13. Fatality reported. */
export function checkFatalityReported(incident: { id: string; propertyId: string; boardRecipientId: string; outcome: string; justReported: boolean }): NotificationCandidate | null {
  if (incident.outcome !== "fatality" || !incident.justReported) return null;
  return { recipientUserId: incident.boardRecipientId, notificationType: "fatality_reported", message: "A fatality has been reported — immediate board attention required.", entityType: "Incidents", entityId: incident.id, propertyId: incident.propertyId, severity: "critical" };
}

/** 14. Serious incident reported. */
export function checkSeriousIncidentReported(incident: { id: string; propertyId: string; groupHsAdminId: string; outcome: string; justReported: boolean }): NotificationCandidate | null {
  const seriousOutcomes = ["hospitalisation", "lost_time_injury"];
  if (!seriousOutcomes.includes(incident.outcome) || !incident.justReported) return null;
  return { recipientUserId: incident.groupHsAdminId, notificationType: "serious_incident_reported", message: "A serious incident has been reported.", entityType: "Incidents", entityId: incident.id, propertyId: incident.propertyId, severity: "warning" };
}

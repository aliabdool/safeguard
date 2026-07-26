// Mirrors functions/shared/pure/permissions.ts RoleCode — kept in sync by hand since the client
// is a separate TypeScript project (no build-time path across the client/functions boundary).
export type RoleCode =
  | "SUPER_ADMIN"
  | "GROUP_HS_ADMIN"
  | "HOTEL_GENERAL_MANAGER"
  | "PROPERTY_HS_OFFICER"
  | "INTERNAL_AUDITOR"
  | "DEPARTMENT_MANAGER"
  | "DUTY_MANAGER"
  | "NURSE_MEDICAL"
  | "INCIDENT_REPORTER"
  | "EXECUTIVE_READONLY"
  | "EXTERNAL_AUDITOR_READONLY"
  | "STANDARD_VIEWER";

export interface AuthMe {
  userId: string;
  status: "pending_approval" | "active" | "suspended" | "rejected";
  roleCodes: RoleCode[];
  propertyIds: string[];
  departmentAccess: Record<string, string[]>;
  medicalPermissions: Array<"view" | "edit" | "export">;
}

export type RagStatus = "red" | "amber" | "green" | "unknown";

export interface IncidentRow {
  id: string;
  incidentNumber: string;
  propertyId: string;
  departmentId: string;
  occurredAt: string;
  reportedBy: string;
  personEventType: string;
  incidentType: string;
  outcome: string;
  hospitalReferral: boolean;
  status: string;
}

export interface CapaRow {
  id: string;
  capaNumber: string;
  propertyId: string;
  departmentId: string | null;
  title: string;
  description: string | null;
  sourceType: string;
  sourceId: string | null;
  ownerId: string;
  verifierId: string;
  dueDate: string;
  status: string;
}

export interface DocumentRow {
  documentId: string;
  title: string;
  category: string;
  propertyId: string | null;
  latestVersionId: string | null;
  status: string | null;
  expiryDate: string | null;
  reviewDate: string | null;
}

export interface DashboardSummary {
  scope: { propertyId: string | null; financialYear: string };
  safetyStatus: {
    total: number;
    fatalities: number;
    seriousIncidents: number;
    statutoryReportable: number;
    hospitalReferrals: number;
    nearMisses: number;
    unsafeConditions: number;
  };
  capaStatus: { open: number; inProgress: number; pendingVerification: number; verified: number; closed: number; overdue: number };
  criticalGaps: Array<{ id: string; controlId: string; propertyId: string; reason: string; identifiedAt: string }>;
  auditStatus: { openCritical: number; openMajor: number; openMinor: number };
  kpiOverview: { tiles: KpiTile[]; notYetCalculableCount: number; evidenceCompletenessPct: number };
  assuranceReadiness: { evidenceCompletenessPct: number; dataQualityExceptionCount: number; openAssuranceBlockers: number };
  boardAlerts: Array<{ severity: "critical" | "warning"; message: string }>;
  generatedAt: string;
}

export interface KpiTile {
  kpiCode: string;
  name: string;
  unit: string;
  classification: string;
  direction: "lower_better" | "higher_better";
  currentValue: number | null;
  comparisonValue: number | null;
  varianceAbs: number | null;
  variancePct: number | null;
  target: number | null;
  ragStatus: RagStatus;
  dataThroughDate: string;
  dataQualityStatus: string;
  isYtdClipped: boolean;
  includedRecordIds: string[];
  fyLabel: string;
  isImplemented: boolean;
}

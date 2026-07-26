import { pgEnum } from "drizzle-orm/pg-core";

// Identity & access
export const profileStatusEnum = pgEnum("profile_status", [
  "pending_approval",
  "active",
  "suspended",
  "rejected",
]);
export const registrationStatusEnum = pgEnum("registration_status", [
  "pending",
  "approved",
  "rejected",
]);

// Incidents
export const personTypeEnum = pgEnum("person_type", [
  "employee",
  "trainee",
  "contractor",
  "guest",
  "visitor",
  "supplier",
  "public",
  "none",
  "near_miss",
  "unsafe_condition",
]);
// Statutory-notification status under the applicable OSH regime (Mauritius OSH Act in scope for
// v1). Deliberately distinct from `hospital_referral` — a case can be hospital-referred without
// being a statutory reportable event, and vice versa (see docs/framework-model.md).
export const oshReportableStatusEnum = pgEnum("osh_reportable_status", [
  "yes",
  "no",
  "pending_determination",
]);
export const injuryMechanismEnum = pgEnum("injury_mechanism", [
  "slip_trip_fall_same_level",
  "fall_from_height",
  "cut_laceration",
  "burn_scald",
  "manual_handling",
  "struck_by_object",
  "struck_against_object",
  "falling_object",
  "chemical_exposure",
  "electrical_contact",
  "vehicle_related",
  "ergonomic_repetitive_strain",
  "food_allergen_exposure",
  "marine_swimming",
  "other",
]);
export const incidentStatusEnum = pgEnum("incident_status", [
  "reported",
  "investigating",
  "corrective_action",
  "verifying",
  "closed",
]);
export const causeTypeEnum = pgEnum("cause_type", ["immediate", "root"]);
export const investigationStatusEnum = pgEnum("investigation_status", [
  "assigned",
  "in_progress",
  "pending_approval",
  "approved",
  "completed",
]);

// CAPA
export const capaSourceTypeEnum = pgEnum("capa_source_type", [
  "incident",
  "audit_finding",
  "legal_gap",
  "inspection",
  "management_review",
]);
export const hierarchyOfControlEnum = pgEnum("hierarchy_of_control", [
  "elimination",
  "substitution",
  "engineering",
  "administrative",
  "ppe",
]);
export const capaPriorityEnum = pgEnum("capa_priority", ["low", "medium", "high", "critical"]);
export const capaStatusEnum = pgEnum("capa_status", [
  "open",
  "in_progress",
  "pending_verification",
  "verified",
  "closed",
  "overdue",
]);
export const capaVerificationOutcomeEnum = pgEnum("capa_verification_outcome", [
  "effective",
  "not_effective",
]);

// Framework
export const frameworkCodeEnum = pgEnum("framework_code", [
  "ISO45001",
  "HOTEL_OPS",
  "MU_LEGAL",
  "GRI403",
  "IFRS_S1",
  "IFRS_S2",
  "SASB_HOTELS",
  "UNGC",
  "ILO_OSH",
]);
export const maturityDimensionEnum = pgEnum("maturity_dimension", [
  "policy",
  "procedure",
  "implementation",
  "effectiveness",
]);

// Audits
export const auditTypeEnum = pgEnum("audit_type", [
  "self_assessment",
  "department_inspection",
  "internal_audit",
  "legal_compliance_audit",
  "iso45001_readiness",
  "external_assurance",
]);
export const auditStatusEnum = pgEnum("audit_status", [
  "planned",
  "in_progress",
  "reporting",
  "closed",
]);
export const findingClassificationEnum = pgEnum("finding_classification", [
  "critical_nc",
  "major_nc",
  "minor_nc",
  "observation",
  "ofi",
]);
export const findingStatusEnum = pgEnum("finding_status", [
  "open",
  "action_assigned",
  "verified",
  "closed",
]);

// Documents & evidence
export const documentStatusEnum = pgEnum("document_status", [
  "draft",
  "under_review",
  "approved",
  "expired",
  "superseded",
  "archived",
]);
export const confidentialityLevelEnum = pgEnum("confidentiality_level", [
  "public",
  "internal",
  "confidential",
  "restricted",
]);
export const documentApprovalActionEnum = pgEnum("document_approval_action", [
  "submitted",
  "approved",
  "rejected",
  "superseded",
]);
export const evidenceLinkedEntityTypeEnum = pgEnum("evidence_linked_entity_type", [
  "control_assessment",
  "kpi_definition",
  "audit",
  "audit_finding",
  "capa_action",
  "disclosure",
  "incident",
  "climate_risk",
  "material_topic",
]);
export const evidenceLevelEnum = pgEnum("evidence_level", [
  "policy",
  "procedure",
  "implementation",
  "effectiveness",
]);
export const verificationStatusEnum = pgEnum("verification_status", [
  "unverified",
  "verified",
  "rejected",
]);

// Files
export const storageBucketEnum = pgEnum("storage_bucket", [
  "incident-evidence",
  "controlled-documents",
  "audit-evidence",
  "capa-evidence",
  "restricted-medical",
]);
export const fileValidationStatusEnum = pgEnum("file_validation_status", [
  "pending",
  "passed",
  "rejected",
]);
export const fileAccessActionEnum = pgEnum("file_access_action", ["view", "download"]);

// KPI
export const kpiClassificationEnum = pgEnum("kpi_classification", [
  "leading",
  "lagging",
  "assurance",
]);
export const dataQualityStatusEnum = pgEnum("data_quality_status", [
  "ok",
  "unverified",
  "incomplete",
]);

// Shared draft/review/approval trail for materiality assessments and the climate-risk register —
// deliberately generic (not "materiality_status") so both modules share one lifecycle concept.
export const assessmentStatusEnum = pgEnum("assessment_status", [
  "draft",
  "under_review",
  "approved",
]);

// Materiality module (docs/framework-model.md §materiality). GRI 3 (double/impact materiality)
// and IFRS S1 (single/financial materiality) are scored independently on the same topic — never
// blended into one number. See src/server/materiality/scoring.ts for the classification logic.
export const griImpactTypeEnum = pgEnum("gri_impact_type", ["actual", "potential"]);
export const griImpactValenceEnum = pgEnum("gri_impact_valence", ["positive", "negative"]);
export const ifrsRiskOrOpportunityEnum = pgEnum("ifrs_risk_or_opportunity", [
  "risk",
  "opportunity",
]);
export const timeHorizonEnum = pgEnum("time_horizon", [
  "short_term",
  "medium_term",
  "long_term",
]);
export const consultationTypeEnum = pgEnum("consultation_type", ["stakeholder", "expert"]);

// Climate-risk register (IFRS S2). A hazard is exactly one of these three categories — never
// blended, since acute/chronic physical risk and transition risk have different disclosure
// expectations under IFRS S2.
export const climateRiskCategoryEnum = pgEnum("climate_risk_category", [
  "acute_physical",
  "chronic_physical",
  "transition",
]);
export const climateHazardEnum = pgEnum("climate_hazard", [
  // Acute physical
  "cyclone",
  "flood",
  "extreme_rainfall",
  "storm_surge",
  "coastal_erosion",
  "heatwave",
  "fire",
  // Chronic physical
  "rising_temperature",
  "heat_stress",
  "water_scarcity",
  "sea_level_rise",
  "vector_borne_disease",
  "changing_working_conditions",
  // Transition
  "regulation",
  "carbon_pricing",
  "insurance_cost",
  "energy_requirements",
  "disclosure_requirements",
  "technology_changes",
  "reputation_customer_expectations",
]);

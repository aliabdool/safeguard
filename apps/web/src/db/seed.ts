/**
 * Reference-data seed: roles, frameworks, a starter master-control library, a handful of demo
 * properties/departments, and the v1 KPI catalogue. Run with `npm run db:seed` against a real
 * Supabase Postgres connection (DATABASE_URL). Not executed in this session — no live database
 * exists yet (see docs/implementation-plan.md §3). Idempotent: safe to re-run.
 */
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema";

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set.");
  }
  const client = postgres(connectionString, { prepare: false });
  const db = drizzle(client, { schema });

  console.log("Seeding roles...");
  const roleRows: Array<{ code: string; name: string; description: string }> = [
    {
      code: "SUPER_ADMIN",
      name: "Super Administrator",
      description: "All properties, all admin functions, no medical access by default.",
    },
    {
      code: "GROUP_HS_ADMIN",
      name: "Group Health and Safety Administrator",
      description: "All properties, H&S data, admin functions except identity/infra config.",
    },
    {
      code: "PROPERTY_HS_OFFICER",
      name: "Property Health and Safety Officer",
      description: "Assigned properties, all departments within them.",
    },
    {
      code: "INTERNAL_AUDITOR",
      name: "Internal Auditor",
      description: "Assigned properties, full audit module access.",
    },
    {
      code: "DEPARTMENT_MANAGER",
      name: "Department Manager",
      description: "Assigned property + department(s).",
    },
    {
      code: "DUTY_MANAGER",
      name: "Duty Manager",
      description: "Assigned property, cross-department first response.",
    },
    {
      code: "NURSE_MEDICAL",
      name: "Nurse or Medical User",
      description: "Requires separate medical-data permission grant.",
    },
    {
      code: "INCIDENT_REPORTER",
      name: "Incident Reporter",
      description: "Report-only, no investigation/CAPA authority.",
    },
    {
      code: "EXECUTIVE_READONLY",
      name: "Executive Read-Only User",
      description: "Group-wide, read-only, aggregated/redacted views.",
    },
    {
      code: "EXTERNAL_AUDITOR_READONLY",
      name: "External Auditor Read-Only User",
      description: "Specific properties/audits, read-only, time-boxed.",
    },
  ];
  await db
    .insert(schema.roles)
    .values(roleRows)
    .onConflictDoNothing({ target: schema.roles.code });

  console.log("Seeding frameworks...");
  const frameworkRows: Array<{
    code: (typeof schema.frameworkCodeEnum.enumValues)[number];
    name: string;
    description: string;
  }> = [
    {
      code: "ISO45001",
      name: "ISO 45001",
      description: "Occupational health and safety management systems.",
    },
    {
      code: "HOTEL_OPS",
      name: "Hotel Operational Controls",
      description: "Property-level operational controls not otherwise codified.",
    },
    {
      code: "MU_LEGAL",
      name: "Mauritius Legal Requirements",
      description: "Occupational Safety and Health Act and related Mauritian legislation.",
    },
    {
      code: "GRI403",
      name: "GRI 403",
      description: "GRI 403: Occupational Health and Safety.",
    },
    {
      code: "IFRS_S1",
      name: "IFRS S1",
      description: "General sustainability-related disclosures, H&S-relevant subset.",
    },
    {
      code: "IFRS_S2",
      name: "IFRS S2",
      description:
        "Climate-related disclosures, H&S intersection (heat stress, business continuity).",
    },
    {
      code: "SASB_HOTELS",
      name: "SASB Hotels & Lodging",
      description: "SASB Hotels & Lodging standard, H&S-relevant metrics.",
    },
    {
      code: "UNGC",
      name: "UN Global Compact",
      description: "UN Global Compact Principles 1-2.",
    },
    { code: "ILO_OSH", name: "ILO-OSH", description: "ILO-OSH 2001 guidelines." },
  ];
  await db
    .insert(schema.frameworks)
    .values(frameworkRows)
    .onConflictDoNothing({ target: schema.frameworks.code });

  console.log("Seeding departments...");
  const departmentRows = [
    { code: "HOUSEKEEPING", name: "Housekeeping" },
    { code: "FOOD_BEVERAGE", name: "Food & Beverage" },
    { code: "ENGINEERING", name: "Engineering & Maintenance" },
    { code: "FRONT_OFFICE", name: "Front Office" },
    { code: "SECURITY", name: "Security" },
    { code: "SPA_WELLNESS", name: "Spa & Wellness" },
    { code: "GROUNDS_LANDSCAPING", name: "Grounds & Landscaping" },
    { code: "HUMAN_RESOURCES", name: "Human Resources" },
    { code: "FINANCE", name: "Finance" },
    { code: "SALES_MARKETING", name: "Sales & Marketing" },
    { code: "EXECUTIVE", name: "Executive Office" },
  ];
  await db
    .insert(schema.departments)
    .values(departmentRows)
    .onConflictDoNothing({ target: schema.departments.code });

  console.log("Seeding demo properties (Development/Demonstration environments only)...");
  const propertyRows = [
    {
      code: "SL-BEACH",
      name: "Sunlife Beach Resort & Spa",
      brand: "Sunlife Collection",
      country: "Mauritius",
    },
    {
      code: "SL-LAGOON",
      name: "Sunlife Lagoon Hotel",
      brand: "Sunlife Collection",
      country: "Mauritius",
    },
  ];
  await db
    .insert(schema.properties)
    .values(propertyRows)
    .onConflictDoNothing({ target: schema.properties.code });

  console.log("Seeding starter master control library (representative subset)...");
  const controlRows = [
    {
      controlCode: "PTW-001",
      title: "Permit-to-work for hot work, confined space, working at height",
      category: "High-risk work control",
      isLifeSafetyCritical: true,
    },
    {
      controlCode: "FIRE-001",
      title: "Fire detection, suppression and evacuation readiness",
      category: "Fire & life safety",
      isLifeSafetyCritical: true,
    },
    {
      controlCode: "LEGIO-001",
      title: "Legionella / water hygiene management",
      category: "Health hazard control",
      isLifeSafetyCritical: true,
    },
    {
      controlCode: "POOL-001",
      title: "Pool and water-feature safety (lifeguarding, chemical dosing, signage)",
      category: "Guest safety",
      isLifeSafetyCritical: true,
    },
    {
      controlCode: "CHEM-001",
      title: "Hazardous chemical storage, handling and SDS management",
      category: "Hazardous substances",
      isLifeSafetyCritical: false,
    },
    {
      controlCode: "CONTR-001",
      title: "Contractor pre-qualification and site induction",
      category: "Contractor management",
      isLifeSafetyCritical: false,
    },
    {
      controlCode: "INC-001",
      title: "Incident reporting and investigation procedure",
      category: "Incident management",
      isLifeSafetyCritical: false,
    },
    {
      controlCode: "TRAIN-001",
      title: "Mandatory H&S induction and refresher training",
      category: "Competence",
      isLifeSafetyCritical: false,
    },
    {
      controlCode: "PPE-001",
      title: "Personal protective equipment provision and use",
      category: "PPE",
      isLifeSafetyCritical: false,
    },
    {
      controlCode: "ERGO-001",
      title: "Manual handling and ergonomic risk assessment",
      category: "Ergonomics",
      isLifeSafetyCritical: false,
    },
  ];
  await db
    .insert(schema.controls)
    .values(controlRows)
    .onConflictDoNothing({ target: schema.controls.controlCode });

  console.log("Seeding KPI catalogue (docs/kpi-catalogue.md §2)...");
  const kpiRows: Array<typeof schema.kpiDefinitions.$inferInsert> = [
    {
      kpiCode: "FATALITIES",
      name: "Fatalities",
      definition: "Count of incidents with outcome = fatality.",
      formula: "count(incidents where outcome='fatality')",
      unit: "count",
      classification: "lagging",
      direction: "lower_better",
      reportingFrequency: "monthly",
      sourceTables: ["incidents"],
      effectiveFrom: "2026-07-01",
    },
    {
      kpiCode: "TOTAL_INCIDENTS",
      name: "Total incidents",
      definition: "Count of all incident records in scope.",
      formula: "count(incidents)",
      unit: "count",
      classification: "lagging",
      direction: "lower_better",
      reportingFrequency: "monthly",
      sourceTables: ["incidents"],
      effectiveFrom: "2026-07-01",
    },
    {
      kpiCode: "EMPLOYEE_INCIDENTS",
      name: "Employee incidents",
      definition: "Incidents where person_type = employee.",
      formula: "count(incidents where person_type='employee')",
      unit: "count",
      classification: "lagging",
      direction: "lower_better",
      reportingFrequency: "monthly",
      sourceTables: ["incidents"],
      effectiveFrom: "2026-07-01",
    },
    {
      kpiCode: "CONTRACTOR_INCIDENTS",
      name: "Contractor incidents",
      definition: "Incidents where person_type = contractor.",
      formula: "count(incidents where person_type='contractor')",
      unit: "count",
      classification: "lagging",
      direction: "lower_better",
      reportingFrequency: "monthly",
      sourceTables: ["incidents"],
      effectiveFrom: "2026-07-01",
    },
    {
      kpiCode: "GUEST_INCIDENTS",
      name: "Guest incidents",
      definition: "Incidents where person_type = guest.",
      formula: "count(incidents where person_type='guest')",
      unit: "count",
      classification: "lagging",
      direction: "lower_better",
      reportingFrequency: "monthly",
      sourceTables: ["incidents"],
      effectiveFrom: "2026-07-01",
    },
    {
      kpiCode: "LTI",
      name: "Lost-time injuries",
      definition: "Incidents with at least one lost workday.",
      formula: "count(incidents where lost_workdays > 0)",
      unit: "count",
      classification: "lagging",
      direction: "lower_better",
      reportingFrequency: "monthly",
      sourceTables: ["incidents"],
      effectiveFrom: "2026-07-01",
    },
    {
      kpiCode: "LTIFR",
      name: "Lost-Time Injury Frequency Rate",
      definition: "LTI per 200,000 hours worked.",
      formula: "(LTI * 200000) / total_hours_worked",
      unit: "rate",
      classification: "lagging",
      direction: "lower_better",
      reportingFrequency: "monthly",
      sourceTables: ["incidents", "exposure_data"],
      effectiveFrom: "2026-07-01",
    },
    {
      kpiCode: "RECORDABLE_INJURIES",
      name: "Recordable injuries",
      definition: "Incidents with a recordable outcome.",
      formula: "count(incidents where outcome in recordable_set)",
      unit: "count",
      classification: "lagging",
      direction: "lower_better",
      reportingFrequency: "monthly",
      sourceTables: ["incidents"],
      effectiveFrom: "2026-07-01",
    },
    {
      kpiCode: "TRIR",
      name: "Total Recordable Injury Rate",
      definition: "Recordable injuries per 200,000 hours worked.",
      formula: "(RECORDABLE_INJURIES * 200000) / total_hours_worked",
      unit: "rate",
      classification: "lagging",
      direction: "lower_better",
      reportingFrequency: "monthly",
      sourceTables: ["incidents", "exposure_data"],
      effectiveFrom: "2026-07-01",
    },
    {
      kpiCode: "SEVERITY_RATE",
      name: "Severity rate",
      definition: "Lost workdays per 200,000 hours worked.",
      formula: "(sum(lost_workdays) * 200000) / total_hours_worked",
      unit: "rate",
      classification: "lagging",
      direction: "lower_better",
      reportingFrequency: "monthly",
      sourceTables: ["incidents", "exposure_data"],
      effectiveFrom: "2026-07-01",
    },
    {
      kpiCode: "LOST_WORKDAYS",
      name: "Lost workdays",
      definition: "Sum of lost workdays across incidents.",
      formula: "sum(incidents.lost_workdays)",
      unit: "days",
      classification: "lagging",
      direction: "lower_better",
      reportingFrequency: "monthly",
      sourceTables: ["incidents"],
      effectiveFrom: "2026-07-01",
    },
    {
      kpiCode: "RESTRICTED_DUTY_CASES",
      name: "Restricted-duty cases",
      definition: "Incidents with restricted-duty days > 0.",
      formula: "count(incidents where restricted_duty_days > 0)",
      unit: "count",
      classification: "lagging",
      direction: "lower_better",
      reportingFrequency: "monthly",
      sourceTables: ["incidents"],
      effectiveFrom: "2026-07-01",
    },
    {
      kpiCode: "RESTRICTED_DUTY_DAYS",
      name: "Restricted-duty days",
      definition: "Sum of restricted-duty days.",
      formula: "sum(incidents.restricted_duty_days)",
      unit: "days",
      classification: "lagging",
      direction: "lower_better",
      reportingFrequency: "monthly",
      sourceTables: ["incidents"],
      effectiveFrom: "2026-07-01",
    },
    {
      kpiCode: "MTC",
      name: "Medical-treatment cases",
      definition: "Incidents with outcome = medical_treatment.",
      formula: "count(incidents where outcome='medical_treatment')",
      unit: "count",
      classification: "lagging",
      direction: "lower_better",
      reportingFrequency: "monthly",
      sourceTables: ["incidents"],
      effectiveFrom: "2026-07-01",
    },
    {
      kpiCode: "OCC_ILLNESS",
      name: "Occupational illnesses",
      definition: "Incidents with incident_type = occupational_illness.",
      formula: "count(incidents where incident_type='occupational_illness')",
      unit: "count",
      classification: "lagging",
      direction: "lower_better",
      reportingFrequency: "monthly",
      sourceTables: ["incidents"],
      effectiveFrom: "2026-07-01",
    },
    {
      kpiCode: "HIGH_POTENTIAL",
      name: "High-potential incidents",
      definition: "Incidents flagged is_high_potential.",
      formula: "count(incidents where is_high_potential)",
      unit: "count",
      classification: "lagging",
      direction: "lower_better",
      reportingFrequency: "monthly",
      sourceTables: ["incidents"],
      effectiveFrom: "2026-07-01",
    },
    {
      kpiCode: "NEAR_MISSES",
      name: "Near misses",
      definition: "Incidents where person_type = near_miss.",
      formula: "count(incidents where person_type='near_miss')",
      unit: "count",
      classification: "leading",
      direction: "higher_better",
      reportingFrequency: "monthly",
      sourceTables: ["incidents"],
      effectiveFrom: "2026-07-01",
    },
    {
      kpiCode: "UNSAFE_CONDITIONS",
      name: "Unsafe conditions",
      definition: "Incidents where person_type = unsafe_condition.",
      formula: "count(incidents where person_type='unsafe_condition')",
      unit: "count",
      classification: "leading",
      direction: "higher_better",
      reportingFrequency: "monthly",
      sourceTables: ["incidents"],
      effectiveFrom: "2026-07-01",
    },
    {
      kpiCode: "HOSPITAL_REFERRALS",
      name: "Hospital referrals",
      definition: "Incidents with hospital_referral = true.",
      formula: "count(incidents where hospital_referral)",
      unit: "count",
      classification: "lagging",
      direction: "lower_better",
      reportingFrequency: "monthly",
      sourceTables: ["incidents"],
      effectiveFrom: "2026-07-01",
    },
    {
      kpiCode: "REPEAT_INCIDENTS",
      name: "Repeat incidents",
      definition: "Incidents sharing location/root cause with another incident in period.",
      formula: "count(incidents grouped by location/root_cause having count > 1)",
      unit: "count",
      classification: "lagging",
      direction: "lower_better",
      reportingFrequency: "quarterly",
      sourceTables: ["incidents", "investigation_causes"],
      effectiveFrom: "2026-07-01",
    },
    {
      kpiCode: "INCIDENT_COST",
      name: "Incident cost",
      definition: "Sum of incident_cost across incidents.",
      formula: "sum(incidents.incident_cost)",
      unit: "MUR",
      classification: "lagging",
      direction: "lower_better",
      reportingFrequency: "monthly",
      sourceTables: ["incidents"],
      effectiveFrom: "2026-07-01",
    },
    {
      kpiCode: "GUEST_INC_PER_1000_RN",
      name: "Guest incidents per 1,000 occupied room nights",
      definition: "Guest incidents normalised by occupied room nights.",
      formula: "(GUEST_INCIDENTS * 1000) / occupied_room_nights",
      unit: "rate",
      classification: "lagging",
      direction: "lower_better",
      reportingFrequency: "monthly",
      sourceTables: ["incidents", "exposure_data"],
      effectiveFrom: "2026-07-01",
    },
    {
      kpiCode: "CURRENT_RISK_ASSESSMENTS",
      name: "Current risk assessments",
      definition: "Proportion of required risk assessments that are current.",
      formula: "count(valid risk assessments) / count(required)",
      unit: "%",
      classification: "assurance",
      direction: "higher_better",
      reportingFrequency: "quarterly",
      sourceTables: ["document_versions", "evidence_links"],
      effectiveFrom: "2026-07-01",
    },
    {
      kpiCode: "VALID_CERTIFICATES",
      name: "Valid statutory certificates",
      definition: "Proportion of statutory certificates that are current.",
      formula: "count(valid certificates) / count(required)",
      unit: "%",
      classification: "assurance",
      direction: "higher_better",
      reportingFrequency: "quarterly",
      sourceTables: ["document_versions"],
      effectiveFrom: "2026-07-01",
    },
    {
      kpiCode: "INSPECTIONS_COMPLETED",
      name: "Planned inspections completed",
      definition: "Proportion of planned department inspections closed.",
      formula: "count(closed department_inspection audits) / count(planned)",
      unit: "%",
      classification: "leading",
      direction: "higher_better",
      reportingFrequency: "monthly",
      sourceTables: ["audits"],
      effectiveFrom: "2026-07-01",
    },
    {
      kpiCode: "AUDIT_PLAN_COMPLETED",
      name: "Audit plan completed",
      definition: "Proportion of the annual audit plan closed.",
      formula: "count(closed audits) / count(planned audits)",
      unit: "%",
      classification: "assurance",
      direction: "higher_better",
      reportingFrequency: "quarterly",
      sourceTables: ["audits"],
      effectiveFrom: "2026-07-01",
    },
    {
      kpiCode: "INDUCTION_COMPLETION",
      name: "Employee induction completion",
      definition: "Proportion of employees with completed H&S induction.",
      formula: "induction_records / headcount",
      unit: "%",
      classification: "leading",
      direction: "higher_better",
      reportingFrequency: "monthly",
      sourceTables: ["evidence_links"],
      effectiveFrom: "2026-07-01",
    },
    {
      kpiCode: "MANDATORY_TRAINING",
      name: "Mandatory training completion",
      definition: "Proportion of required mandatory training completed.",
      formula: "training_records / required_headcount",
      unit: "%",
      classification: "leading",
      direction: "higher_better",
      reportingFrequency: "monthly",
      sourceTables: ["evidence_links"],
      effectiveFrom: "2026-07-01",
    },
    {
      kpiCode: "CAPA_ON_TIME",
      name: "Corrective actions closed on time",
      definition: "Proportion of closed CAPA actions closed by their due date.",
      formula: "count(capa closed by due_date) / count(capa closed)",
      unit: "%",
      classification: "assurance",
      direction: "higher_better",
      reportingFrequency: "monthly",
      sourceTables: ["capa_actions"],
      effectiveFrom: "2026-07-01",
    },
    {
      kpiCode: "ISO45001_READINESS",
      name: "ISO 45001 readiness",
      definition:
        "Rollup of control assessments mapped to ISO 45001, min-of-dimension with critical-gap cap.",
      formula: "rollup(control_assessments where framework=ISO45001)",
      unit: "score 0-4",
      classification: "assurance",
      direction: "higher_better",
      reportingFrequency: "quarterly",
      sourceTables: ["control_assessments", "control_framework_mappings"],
      effectiveFrom: "2026-07-01",
    },
    {
      kpiCode: "LEGAL_COMPLIANCE",
      name: "Legal compliance",
      definition:
        "Rollup of control assessments mapped to Mauritius legal requirements, min-of-dimension with critical-gap cap.",
      formula: "rollup(control_assessments where framework=MU_LEGAL)",
      unit: "score 0-4",
      classification: "assurance",
      direction: "higher_better",
      reportingFrequency: "quarterly",
      sourceTables: [
        "control_assessments",
        "control_framework_mappings",
        "legal_requirement_details",
      ],
      effectiveFrom: "2026-07-01",
    },
    {
      kpiCode: "GRI403_READINESS",
      name: "GRI 403 readiness",
      definition: "Rollup of control assessments mapped to GRI 403.",
      formula: "rollup(control_assessments where framework=GRI403)",
      unit: "score 0-4",
      classification: "assurance",
      direction: "higher_better",
      reportingFrequency: "quarterly",
      sourceTables: ["control_assessments", "control_framework_mappings"],
      effectiveFrom: "2026-07-01",
    },
    {
      kpiCode: "IFRS_S1_READINESS",
      name: "IFRS S1 readiness",
      definition: "Rollup of control assessments mapped to IFRS S1.",
      formula: "rollup(control_assessments where framework=IFRS_S1)",
      unit: "score 0-4",
      classification: "assurance",
      direction: "higher_better",
      reportingFrequency: "quarterly",
      sourceTables: ["control_assessments", "control_framework_mappings"],
      effectiveFrom: "2026-07-01",
    },
    {
      kpiCode: "IFRS_S2_READINESS",
      name: "IFRS S2 readiness",
      definition: "Rollup of control assessments mapped to IFRS S2.",
      formula: "rollup(control_assessments where framework=IFRS_S2)",
      unit: "score 0-4",
      classification: "assurance",
      direction: "higher_better",
      reportingFrequency: "quarterly",
      sourceTables: ["control_assessments", "control_framework_mappings"],
      effectiveFrom: "2026-07-01",
    },
    {
      kpiCode: "OPEN_CRIT_MAJOR_FINDINGS",
      name: "Open critical and major findings",
      definition: "Open audit findings classified critical or major.",
      formula:
        "count(audit_findings where classification in (critical_nc,major_nc) and status != closed)",
      unit: "count",
      classification: "lagging",
      direction: "lower_better",
      reportingFrequency: "monthly",
      sourceTables: ["audit_findings"],
      effectiveFrom: "2026-07-01",
    },
    {
      kpiCode: "EXPIRED_EVIDENCE",
      name: "Expired evidence",
      definition: "Document versions past expiry that are not superseded/archived.",
      formula:
        "count(document_versions where expiry_date < now() and status not in (superseded,archived))",
      unit: "count",
      classification: "assurance",
      direction: "lower_better",
      reportingFrequency: "monthly",
      sourceTables: ["document_versions"],
      effectiveFrom: "2026-07-01",
    },
    {
      kpiCode: "CONTROLS_NO_EVIDENCE",
      name: "Controls without evidence",
      definition: "Control assessments scoring >= 2 with no qualifying evidence link.",
      formula: "count(control_assessments with score >= 2 and no evidence_links)",
      unit: "count",
      classification: "assurance",
      direction: "lower_better",
      reportingFrequency: "quarterly",
      sourceTables: ["control_assessments", "evidence_links"],
      effectiveFrom: "2026-07-01",
    },
    {
      kpiCode: "CAPA_EFFECTIVENESS",
      name: "CAPA effectiveness rate",
      definition: "Proportion of CAPA verifications marked effective.",
      formula: "count(capa_verifications where outcome=effective) / count(capa_verifications)",
      unit: "%",
      classification: "assurance",
      direction: "higher_better",
      reportingFrequency: "quarterly",
      sourceTables: ["capa_verifications"],
      effectiveFrom: "2026-07-01",
    },
  ];
  await db
    .insert(schema.kpiDefinitions)
    .values(kpiRows)
    .onConflictDoNothing({ target: schema.kpiDefinitions.kpiCode });

  console.log("Seed complete.");
  await client.end();
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});

-- Reference-data seed: mirrors src/db/seed.ts exactly (roles, frameworks, departments, two demo
-- properties, a starter master control library, and the v1 KPI catalogue). Idempotent — every
-- insert uses ON CONFLICT DO NOTHING keyed on the same unique column drizzle-kit seed.ts uses, so
-- it's safe to paste this whole file into the Supabase SQL Editor more than once.
--
-- Generated as a raw-SQL equivalent of `npm run db:seed` because this session's sandboxed egress
-- proxy cannot open raw Postgres TCP connections (only HTTPS) — see docs/implementation-plan.md
-- for the ADR. Run AFTER 0000_init_schema.sql, 0001_auth_helpers_and_rls.sql, and
-- 0002_control_assessments_unique_idx.sql have all been applied.

-- Roles
insert into roles (code, name, description) values
  ('SUPER_ADMIN', 'Super Administrator', 'All properties, all admin functions, no medical access by default.'),
  ('GROUP_HS_ADMIN', 'Group Health and Safety Administrator', 'All properties, H&S data, admin functions except identity/infra config.'),
  ('PROPERTY_HS_OFFICER', 'Property Health and Safety Officer', 'Assigned properties, all departments within them.'),
  ('INTERNAL_AUDITOR', 'Internal Auditor', 'Assigned properties, full audit module access.'),
  ('DEPARTMENT_MANAGER', 'Department Manager', 'Assigned property + department(s).'),
  ('DUTY_MANAGER', 'Duty Manager', 'Assigned property, cross-department first response.'),
  ('NURSE_MEDICAL', 'Nurse or Medical User', 'Requires separate medical-data permission grant.'),
  ('INCIDENT_REPORTER', 'Incident Reporter', 'Report-only, no investigation/CAPA authority.'),
  ('EXECUTIVE_READONLY', 'Executive Read-Only User', 'Group-wide, read-only, aggregated/redacted views.'),
  ('EXTERNAL_AUDITOR_READONLY', 'External Auditor Read-Only User', 'Specific properties/audits, read-only, time-boxed.')
on conflict (code) do nothing;

-- Frameworks
insert into frameworks (code, name, description) values
  ('ISO45001', 'ISO 45001', 'Occupational health and safety management systems.'),
  ('HOTEL_OPS', 'Hotel Operational Controls', 'Property-level operational controls not otherwise codified.'),
  ('MU_LEGAL', 'Mauritius Legal Requirements', 'Occupational Safety and Health Act and related Mauritian legislation.'),
  ('GRI403', 'GRI 403', 'GRI 403: Occupational Health and Safety.'),
  ('IFRS_S1', 'IFRS S1', 'General sustainability-related disclosures, H&S-relevant subset.'),
  ('IFRS_S2', 'IFRS S2', 'Climate-related disclosures, H&S intersection (heat stress, business continuity).'),
  ('SASB_HOTELS', 'SASB Hotels & Lodging', 'SASB Hotels & Lodging standard, H&S-relevant metrics.'),
  ('UNGC', 'UN Global Compact', 'UN Global Compact Principles 1-2.'),
  ('ILO_OSH', 'ILO-OSH', 'ILO-OSH 2001 guidelines.')
on conflict (code) do nothing;

-- Departments
insert into departments (code, name) values
  ('HOUSEKEEPING', 'Housekeeping'),
  ('FOOD_BEVERAGE', 'Food & Beverage'),
  ('ENGINEERING', 'Engineering & Maintenance'),
  ('FRONT_OFFICE', 'Front Office'),
  ('SECURITY', 'Security'),
  ('SPA_WELLNESS', 'Spa & Wellness'),
  ('GROUNDS_LANDSCAPING', 'Grounds & Landscaping'),
  ('HUMAN_RESOURCES', 'Human Resources'),
  ('FINANCE', 'Finance'),
  ('SALES_MARKETING', 'Sales & Marketing'),
  ('EXECUTIVE', 'Executive Office')
on conflict (code) do nothing;

-- Demo properties (Development/Demonstration environments only)
insert into properties (code, name, brand, country) values
  ('SL-BEACH', 'Sunlife Beach Resort & Spa', 'Sunlife Collection', 'Mauritius'),
  ('SL-LAGOON', 'Sunlife Lagoon Hotel', 'Sunlife Collection', 'Mauritius')
on conflict (code) do nothing;

-- Starter master control library (representative subset)
insert into controls (control_code, title, category, is_life_safety_critical) values
  ('PTW-001', 'Permit-to-work for hot work, confined space, working at height', 'High-risk work control', true),
  ('FIRE-001', 'Fire detection, suppression and evacuation readiness', 'Fire & life safety', true),
  ('LEGIO-001', 'Legionella / water hygiene management', 'Health hazard control', true),
  ('POOL-001', 'Pool and water-feature safety (lifeguarding, chemical dosing, signage)', 'Guest safety', true),
  ('CHEM-001', 'Hazardous chemical storage, handling and SDS management', 'Hazardous substances', false),
  ('CONTR-001', 'Contractor pre-qualification and site induction', 'Contractor management', false),
  ('INC-001', 'Incident reporting and investigation procedure', 'Incident management', false),
  ('TRAIN-001', 'Mandatory H&S induction and refresher training', 'Competence', false),
  ('PPE-001', 'Personal protective equipment provision and use', 'PPE', false),
  ('ERGO-001', 'Manual handling and ergonomic risk assessment', 'Ergonomics', false)
on conflict (control_code) do nothing;

-- KPI catalogue (docs/kpi-catalogue.md §2)
insert into kpi_definitions (kpi_code, name, definition, formula, unit, classification, direction, reporting_frequency, source_tables, effective_from) values
  ('FATALITIES', 'Fatalities', 'Count of incidents with outcome = fatality.', 'count(incidents where outcome=''fatality'')', 'count', 'lagging', 'lower_better', 'monthly', array['incidents'], '2026-07-01'),
  ('TOTAL_INCIDENTS', 'Total incidents', 'Count of all incident records in scope.', 'count(incidents)', 'count', 'lagging', 'lower_better', 'monthly', array['incidents'], '2026-07-01'),
  ('EMPLOYEE_INCIDENTS', 'Employee incidents', 'Incidents where person_type = employee.', 'count(incidents where person_type=''employee'')', 'count', 'lagging', 'lower_better', 'monthly', array['incidents'], '2026-07-01'),
  ('CONTRACTOR_INCIDENTS', 'Contractor incidents', 'Incidents where person_type = contractor.', 'count(incidents where person_type=''contractor'')', 'count', 'lagging', 'lower_better', 'monthly', array['incidents'], '2026-07-01'),
  ('GUEST_INCIDENTS', 'Guest incidents', 'Incidents where person_type = guest.', 'count(incidents where person_type=''guest'')', 'count', 'lagging', 'lower_better', 'monthly', array['incidents'], '2026-07-01'),
  ('LTI', 'Lost-time injuries', 'Incidents with at least one lost workday.', 'count(incidents where lost_workdays > 0)', 'count', 'lagging', 'lower_better', 'monthly', array['incidents'], '2026-07-01'),
  ('LTIFR', 'Lost-Time Injury Frequency Rate', 'LTI per 200,000 hours worked.', '(LTI * 200000) / total_hours_worked', 'rate', 'lagging', 'lower_better', 'monthly', array['incidents','exposure_data'], '2026-07-01'),
  ('RECORDABLE_INJURIES', 'Recordable injuries', 'Incidents with a recordable outcome.', 'count(incidents where outcome in recordable_set)', 'count', 'lagging', 'lower_better', 'monthly', array['incidents'], '2026-07-01'),
  ('TRIR', 'Total Recordable Injury Rate', 'Recordable injuries per 200,000 hours worked.', '(RECORDABLE_INJURIES * 200000) / total_hours_worked', 'rate', 'lagging', 'lower_better', 'monthly', array['incidents','exposure_data'], '2026-07-01'),
  ('SEVERITY_RATE', 'Severity rate', 'Lost workdays per 200,000 hours worked.', '(sum(lost_workdays) * 200000) / total_hours_worked', 'rate', 'lagging', 'lower_better', 'monthly', array['incidents','exposure_data'], '2026-07-01'),
  ('LOST_WORKDAYS', 'Lost workdays', 'Sum of lost workdays across incidents.', 'sum(incidents.lost_workdays)', 'days', 'lagging', 'lower_better', 'monthly', array['incidents'], '2026-07-01'),
  ('RESTRICTED_DUTY_CASES', 'Restricted-duty cases', 'Incidents with restricted-duty days > 0.', 'count(incidents where restricted_duty_days > 0)', 'count', 'lagging', 'lower_better', 'monthly', array['incidents'], '2026-07-01'),
  ('RESTRICTED_DUTY_DAYS', 'Restricted-duty days', 'Sum of restricted-duty days.', 'sum(incidents.restricted_duty_days)', 'days', 'lagging', 'lower_better', 'monthly', array['incidents'], '2026-07-01'),
  ('MTC', 'Medical-treatment cases', 'Incidents with outcome = medical_treatment.', 'count(incidents where outcome=''medical_treatment'')', 'count', 'lagging', 'lower_better', 'monthly', array['incidents'], '2026-07-01'),
  ('OCC_ILLNESS', 'Occupational illnesses', 'Incidents with incident_type = occupational_illness.', 'count(incidents where incident_type=''occupational_illness'')', 'count', 'lagging', 'lower_better', 'monthly', array['incidents'], '2026-07-01'),
  ('HIGH_POTENTIAL', 'High-potential incidents', 'Incidents flagged is_high_potential.', 'count(incidents where is_high_potential)', 'count', 'lagging', 'lower_better', 'monthly', array['incidents'], '2026-07-01'),
  ('NEAR_MISSES', 'Near misses', 'Incidents where person_type = near_miss.', 'count(incidents where person_type=''near_miss'')', 'count', 'leading', 'higher_better', 'monthly', array['incidents'], '2026-07-01'),
  ('UNSAFE_CONDITIONS', 'Unsafe conditions', 'Incidents where person_type = unsafe_condition.', 'count(incidents where person_type=''unsafe_condition'')', 'count', 'leading', 'higher_better', 'monthly', array['incidents'], '2026-07-01'),
  ('HOSPITAL_REFERRALS', 'Hospital referrals', 'Incidents with hospital_referral = true.', 'count(incidents where hospital_referral)', 'count', 'lagging', 'lower_better', 'monthly', array['incidents'], '2026-07-01'),
  ('TRAINEE_INCIDENTS', 'Trainee incidents', 'Incidents where person_type = trainee.', 'count(incidents where person_type=''trainee'')', 'count', 'lagging', 'lower_better', 'monthly', array['incidents'], '2026-07-01'),
  ('REPORTABLE_OSH_CASES', 'Reportable OSH cases', 'Incidents with a statutory OSH-notification status of yes, per the applicable OSH regime. Deliberately distinct from hospital_referral.', 'count(incidents where reportable_status=''yes'')', 'count', 'lagging', 'lower_better', 'monthly', array['incidents'], '2026-07-01'),
  ('REPEAT_INCIDENTS', 'Repeat incidents', 'Incidents sharing location/root cause with another incident in period.', 'count(incidents grouped by location/root_cause having count > 1)', 'count', 'lagging', 'lower_better', 'quarterly', array['incidents','investigation_causes'], '2026-07-01'),
  ('INCIDENT_COST', 'Incident cost', 'Sum of incident_cost across incidents.', 'sum(incidents.incident_cost)', 'MUR', 'lagging', 'lower_better', 'monthly', array['incidents'], '2026-07-01'),
  ('GUEST_INC_PER_1000_RN', 'Guest incidents per 1,000 occupied room nights', 'Guest incidents normalised by occupied room nights.', '(GUEST_INCIDENTS * 1000) / occupied_room_nights', 'rate', 'lagging', 'lower_better', 'monthly', array['incidents','exposure_data'], '2026-07-01'),
  ('CURRENT_RISK_ASSESSMENTS', 'Current risk assessments', 'Proportion of required risk assessments that are current.', 'count(valid risk assessments) / count(required)', '%', 'assurance', 'higher_better', 'quarterly', array['document_versions','evidence_links'], '2026-07-01'),
  ('VALID_CERTIFICATES', 'Valid statutory certificates', 'Proportion of statutory certificates that are current.', 'count(valid certificates) / count(required)', '%', 'assurance', 'higher_better', 'quarterly', array['document_versions'], '2026-07-01'),
  ('INSPECTIONS_COMPLETED', 'Planned inspections completed', 'Proportion of planned department inspections closed.', 'count(closed department_inspection audits) / count(planned)', '%', 'leading', 'higher_better', 'monthly', array['audits'], '2026-07-01'),
  ('AUDIT_PLAN_COMPLETED', 'Audit plan completed', 'Proportion of the annual audit plan closed.', 'count(closed audits) / count(planned audits)', '%', 'assurance', 'higher_better', 'quarterly', array['audits'], '2026-07-01'),
  ('INDUCTION_COMPLETION', 'Employee induction completion', 'Proportion of employees with completed H&S induction.', 'induction_records / headcount', '%', 'leading', 'higher_better', 'monthly', array['evidence_links'], '2026-07-01'),
  ('MANDATORY_TRAINING', 'Mandatory training completion', 'Proportion of required mandatory training completed.', 'training_records / required_headcount', '%', 'leading', 'higher_better', 'monthly', array['evidence_links'], '2026-07-01'),
  ('CAPA_ON_TIME', 'Corrective actions closed on time', 'Proportion of closed CAPA actions closed by their due date.', 'count(capa closed by due_date) / count(capa closed)', '%', 'assurance', 'higher_better', 'monthly', array['capa_actions'], '2026-07-01'),
  ('ISO45001_READINESS', 'ISO 45001 readiness', 'Rollup of control assessments mapped to ISO 45001, min-of-dimension with critical-gap cap.', 'rollup(control_assessments where framework=ISO45001)', 'score 0-4', 'assurance', 'higher_better', 'quarterly', array['control_assessments','control_framework_mappings'], '2026-07-01'),
  ('LEGAL_COMPLIANCE', 'Legal compliance', 'Rollup of control assessments mapped to Mauritius legal requirements, min-of-dimension with critical-gap cap.', 'rollup(control_assessments where framework=MU_LEGAL)', 'score 0-4', 'assurance', 'higher_better', 'quarterly', array['control_assessments','control_framework_mappings','legal_requirement_details'], '2026-07-01'),
  ('GRI403_READINESS', 'GRI 403 readiness', 'Rollup of control assessments mapped to GRI 403.', 'rollup(control_assessments where framework=GRI403)', 'score 0-4', 'assurance', 'higher_better', 'quarterly', array['control_assessments','control_framework_mappings'], '2026-07-01'),
  ('IFRS_S1_READINESS', 'IFRS S1 readiness', 'Rollup of control assessments mapped to IFRS S1.', 'rollup(control_assessments where framework=IFRS_S1)', 'score 0-4', 'assurance', 'higher_better', 'quarterly', array['control_assessments','control_framework_mappings'], '2026-07-01'),
  ('IFRS_S2_READINESS', 'IFRS S2 readiness', 'Rollup of control assessments mapped to IFRS S2.', 'rollup(control_assessments where framework=IFRS_S2)', 'score 0-4', 'assurance', 'higher_better', 'quarterly', array['control_assessments','control_framework_mappings'], '2026-07-01'),
  ('OPEN_CRIT_MAJOR_FINDINGS', 'Open critical and major findings', 'Open audit findings classified critical or major.', 'count(audit_findings where classification in (critical_nc,major_nc) and status != closed)', 'count', 'lagging', 'lower_better', 'monthly', array['audit_findings'], '2026-07-01'),
  ('EXPIRED_EVIDENCE', 'Expired evidence', 'Document versions past expiry that are not superseded/archived.', 'count(document_versions where expiry_date < now() and status not in (superseded,archived))', 'count', 'assurance', 'lower_better', 'monthly', array['document_versions'], '2026-07-01'),
  ('CONTROLS_NO_EVIDENCE', 'Controls without evidence', 'Control assessments scoring >= 2 with no qualifying evidence link.', 'count(control_assessments with score >= 2 and no evidence_links)', 'count', 'assurance', 'lower_better', 'quarterly', array['control_assessments','evidence_links'], '2026-07-01'),
  ('CAPA_EFFECTIVENESS', 'CAPA effectiveness rate', 'Proportion of CAPA verifications marked effective.', 'count(capa_verifications where outcome=effective) / count(capa_verifications)', '%', 'assurance', 'higher_better', 'quarterly', array['capa_verifications'], '2026-07-01')
on conflict (kpi_code) do nothing;

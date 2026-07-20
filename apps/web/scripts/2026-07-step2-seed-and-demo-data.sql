-- =============================================================================================
-- STEP 2 of 2 — Seed-data fixes + the 10-record sanitised demo dataset.
--
-- Run this AFTER 2026-07-step1-migrations.sql has completed successfully, as a separate paste
-- in the Supabase SQL Editor. Prerequisite: the 6 demo accounts below must already exist
-- (registered through /register, roles/status set exactly as your real Super Admin was):
--   aliabdool@hotmail.co.uk      (Super Admin — already promoted)
--   hso-demo@example.com          Priya Naidoo        H&S Officer
--   nurse-demo@example.com        Jennyta Ramgoolam   Nurse (reporting + medical)
--   dutymanager-demo@example.com  Kevin Ramsamy       Duty Manager (no medical access)
--   exec-demo@example.com         Executive Committee Executive read-only
--   auditor-demo@example.com      Marc Dubois         Internal Auditor
--
-- Safe to re-run: the seed section uses ON CONFLICT DO NOTHING throughout (adds only what's
-- missing — the 2 new KPI rows, mainly). The demo-data section explicitly DELETEs any existing
-- DEMO-* rows first, so it's safe whether you've never run demo data before or ran an earlier
-- (6-incident) version of it — either way you end up with exactly the current 10-incident set.
-- =============================================================================================

-- --------------------------------------------------------------------------------------------
-- 2a. Full reference-data seed (idempotent) — re-adds anything missing, including the new
--     TRAINEE_INCIDENTS / REPORTABLE_OSH_CASES KPI catalogue rows.
-- --------------------------------------------------------------------------------------------
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
  ('SASB_HOTELS', 'SASB Hotels & Lodging', 'SASB Hotels & Lodging''s material topics are Energy & Water Management, Ecosystem Protection & Climate Adaptation, and Fair Labor Practices — there is no standalone occupational H&S topic in this standard. Controls mapped here support Fair Labor Practices indirectly (workforce health & safety conditions); this is not a formal SASB H&S metric and should not be presented as one.'),
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

-- --------------------------------------------------------------------------------------------
-- 2b. SASB framework description correction. The insert above uses ON CONFLICT DO NOTHING, so
--     if the SASB_HOTELS row already existed with the old ("H&S-relevant metrics") description,
--     the insert silently skipped it. This UPDATE fixes it explicitly either way.
-- --------------------------------------------------------------------------------------------
update public.frameworks
set description = 'SASB Hotels & Lodging''s material topics are Energy & Water Management, Ecosystem Protection & Climate Adaptation, and Fair Labor Practices — there is no standalone occupational H&S topic in this standard. Controls mapped here support Fair Labor Practices indirectly (workforce health & safety conditions); this is not a formal SASB H&S metric and should not be presented as one.'
where code = 'SASB_HOTELS';

-- --------------------------------------------------------------------------------------------
-- 2c. Clean up any pre-existing demo data before loading the current 10-incident set, so this
--     script is safe to run whether or not an earlier version of demo-data.sql was ever run.
--     Cascades handle the rest: deleting an audit cascades to its findings; deleting a CAPA
--     action cascades to its verifications; deleting an incident cascades to its persons,
--     investigation, investigation causes/five-whys/witnesses.
-- --------------------------------------------------------------------------------------------
delete from public.audits where audit_reference like 'DEMO-AUD-%';
delete from public.capa_actions where action_number like 'DEMO-CAPA-%';
delete from public.incidents where incident_number like 'DEMO-%';

-- --------------------------------------------------------------------------------------------
-- 2d. demo-data.sql — 10 sanitised, fictional incidents (never the real historical register,
--     no real names or health data), 6 investigations, 9 CAPA actions, 40 control assessments,
--     2 audits, 3 findings.
-- --------------------------------------------------------------------------------------------
-- Demo / showcase dataset for management demonstrations.
--
-- Populates REAL rows in the real tables (incidents, investigations, CAPA actions, control
-- assessments, audits, findings) so every dashboard, KPI tile and heatmap in the app computes
-- live from this data exactly as it would from real operational data — nothing is hard-coded in
-- the UI. Intentionally does NOT touch `documents`/`document_versions`/`files`: those require a
-- real uploaded object in Supabase Storage with a checksum, so fabricating rows there would
-- create "approved" evidence with nothing real behind it. Upload 2-3 real files through
-- /documents in the app instead — see docs/implementation-plan.md ADR-0008.
--
-- Exactly 10 sanitised, fictional incident records per the brainstorming brief (never the real
-- 460-record Ambre register, never real names/health histories): one each illustrating Employee,
-- Trainee, Guest, Contractor, Near miss, Major injury, Minor injury, Lost-time injury, Hospital
-- referral, and High-potential incident — several records naturally satisfy more than one of
-- these (e.g. the guest slip is both "Guest" and "Major injury" and "Hospital referral"), which
-- is expected: those are dimensions of the same incident, not mutually exclusive buckets.
--
-- Prerequisite: all 6 accounts below must already exist (register through /register, exactly
-- as the real Super Admin was created — this script does not create logins, only assigns roles
-- and data to accounts that already exist):
--   aliabdool@hotmail.co.uk   (Super Admin — already promoted)
--   hso-demo@example.com        Priya Naidoo       H&S Officer
--   nurse-demo@example.com      Jennyta Ramgoolam  Nurse (reporting + medical)
--   dutymanager-demo@example.com Kevin Ramsamy     Duty Manager (no medical access)
--   exec-demo@example.com       Executive Committee Executive read-only
--   auditor-demo@example.com    Marc Dubois        Internal Auditor
--
-- Idempotency: NOT fully idempotent (incident/action/finding/audit numbers are fixed strings so
-- a second run will hit unique-constraint errors on those, which is the intended guard against
-- accidentally doubling the demo data — if you need to re-run, delete the DEMO-* rows first).

do $$
declare
  uid_super uuid;
  uid_hso uuid;
  uid_nurse uuid;
  uid_dm uuid;
  uid_exec uuid;
  uid_aud uuid;

  role_hso uuid; role_nurse uuid; role_reporter uuid; role_dm uuid; role_exec uuid; role_aud uuid;

  prop_beach uuid;

  dept_hk uuid; dept_fb uuid; dept_eng uuid; dept_grounds uuid; dept_sec uuid; dept_front uuid;

  ctrl_ptw uuid; ctrl_fire uuid; ctrl_legio uuid; ctrl_pool uuid; ctrl_chem uuid;
  ctrl_contr uuid; ctrl_inc uuid; ctrl_train uuid; ctrl_ppe uuid; ctrl_ergo uuid;

  fw_iso uuid; fw_legal uuid; fw_gri uuid; fw_hotel uuid;

  inc1 uuid; inc2 uuid; inc3 uuid; inc4 uuid; inc5 uuid;
  inc6 uuid; inc7 uuid; inc8 uuid; inc9 uuid; inc10 uuid;
  inv1 uuid; inv2 uuid; inv3 uuid; inv4 uuid; inv5 uuid; inv6 uuid;
  aud1 uuid; aud2 uuid;
  f1 uuid; f2 uuid; f3 uuid;
begin
  ---------------------------------------------------------------------------
  -- 0. Resolve the 6 accounts. Fail fast with a clear message if any are missing.
  ---------------------------------------------------------------------------
  select id into uid_super from auth.users where email = 'aliabdool@hotmail.co.uk';
  select id into uid_hso from auth.users where email = 'hso-demo@example.com';
  select id into uid_nurse from auth.users where email = 'nurse-demo@example.com';
  select id into uid_dm from auth.users where email = 'dutymanager-demo@example.com';
  select id into uid_exec from auth.users where email = 'exec-demo@example.com';
  select id into uid_aud from auth.users where email = 'auditor-demo@example.com';

  if uid_super is null or uid_hso is null or uid_nurse is null or uid_dm is null
     or uid_exec is null or uid_aud is null then
    raise exception 'One or more demo accounts have not registered yet. Register all 5 demo accounts through /register first, then re-run this script.';
  end if;

  select id into role_hso from public.roles where code = 'PROPERTY_HS_OFFICER';
  select id into role_nurse from public.roles where code = 'NURSE_MEDICAL';
  select id into role_reporter from public.roles where code = 'INCIDENT_REPORTER';
  select id into role_dm from public.roles where code = 'DUTY_MANAGER';
  select id into role_exec from public.roles where code = 'EXECUTIVE_READONLY';
  select id into role_aud from public.roles where code = 'INTERNAL_AUDITOR';

  select id into prop_beach from public.properties where code = 'SL-BEACH';

  select id into dept_hk from public.departments where code = 'HOUSEKEEPING';
  select id into dept_fb from public.departments where code = 'FOOD_BEVERAGE';
  select id into dept_eng from public.departments where code = 'ENGINEERING';
  select id into dept_grounds from public.departments where code = 'GROUNDS_LANDSCAPING';
  select id into dept_sec from public.departments where code = 'SECURITY';
  select id into dept_front from public.departments where code = 'FRONT_OFFICE';

  select id into ctrl_ptw from public.controls where control_code = 'PTW-001';
  select id into ctrl_fire from public.controls where control_code = 'FIRE-001';
  select id into ctrl_legio from public.controls where control_code = 'LEGIO-001';
  select id into ctrl_pool from public.controls where control_code = 'POOL-001';
  select id into ctrl_chem from public.controls where control_code = 'CHEM-001';
  select id into ctrl_contr from public.controls where control_code = 'CONTR-001';
  select id into ctrl_inc from public.controls where control_code = 'INC-001';
  select id into ctrl_train from public.controls where control_code = 'TRAIN-001';
  select id into ctrl_ppe from public.controls where control_code = 'PPE-001';
  select id into ctrl_ergo from public.controls where control_code = 'ERGO-001';

  select id into fw_iso from public.frameworks where code = 'ISO45001';
  select id into fw_legal from public.frameworks where code = 'MU_LEGAL';
  select id into fw_gri from public.frameworks where code = 'GRI403';
  select id into fw_hotel from public.frameworks where code = 'HOTEL_OPS';

  if prop_beach is null or dept_hk is null or ctrl_fire is null or fw_iso is null then
    raise exception 'Reference data missing — run scripts/seed.sql before this script.';
  end if;

  ---------------------------------------------------------------------------
  -- 1. Activate the 5 demo profiles and assign roles.
  ---------------------------------------------------------------------------
  update public.profiles set status = 'active', approved_by = uid_super, approved_at = now(), updated_at = now()
    where id in (uid_hso, uid_nurse, uid_dm, uid_exec, uid_aud) and status <> 'active';

  insert into public.user_roles (user_id, role_id, granted_by) values
    (uid_hso, role_hso, uid_super),
    (uid_nurse, role_nurse, uid_super),
    (uid_nurse, role_reporter, uid_super),
    (uid_dm, role_dm, uid_super),
    (uid_exec, role_exec, uid_super),
    (uid_aud, role_aud, uid_super)
  on conflict do nothing;

  -- Medical-data access is a separate explicit grant, never implied by role — only the Nurse
  -- gets it. The Duty Manager and H&S Officer deliberately do NOT, demonstrating the real
  -- segregation-of-duties model (stricter than the original prototype).
  insert into public.user_medical_permission (user_id, granted_by, reason)
    values (uid_nurse, uid_super, 'Demo dataset: Nurse persona requires clinical-notes access.')
  on conflict do nothing;

  insert into public.user_property_access (user_id, property_id, granted_by) values
    (uid_hso, prop_beach, uid_super),
    (uid_nurse, prop_beach, uid_super),
    (uid_dm, prop_beach, uid_super),
    (uid_aud, prop_beach, uid_super)
  on conflict do nothing;

  insert into public.property_departments (property_id, department_id) values
    (prop_beach, dept_hk), (prop_beach, dept_fb), (prop_beach, dept_eng),
    (prop_beach, dept_grounds), (prop_beach, dept_sec), (prop_beach, dept_front)
  on conflict do nothing;

  insert into public.user_department_access (user_id, property_id, department_id, granted_by)
    select u, prop_beach, d, uid_super
    from (values (uid_hso), (uid_nurse), (uid_dm)) as users(u)
    cross join (values (dept_hk), (dept_fb), (dept_eng), (dept_grounds), (dept_sec), (dept_front)) as depts(d)
  on conflict do nothing;

  ---------------------------------------------------------------------------
  -- 2. Ten sanitised demo incidents, using the Phase-1 fields (injury_mechanism,
  --    reportable_status) so the dashboard's new KPIs and filters have real data behind them.
  ---------------------------------------------------------------------------

  -- 1. Employee + Minor injury
  insert into public.incidents (incident_number, property_id, department_id, location_detail,
    occurred_at, reported_by, person_type, incident_type, injury_mechanism, injury_type, body_part,
    outcome, actual_severity, potential_severity, is_high_potential, hospital_referral,
    reportable_status, lost_workdays, restricted_duty_days, incident_cost,
    business_interruption_days, immediate_actions, status)
  values (
    'DEMO-2026-000101', prop_beach, dept_hk, 'Housekeeping store room',
    '2026-07-14 09:20+04', uid_dm, 'employee', 'Injury', 'cut_laceration',
    'Cut / laceration', 'Hand / wrist / finger', 'first_aid', 1, 2, false, false,
    'no', 0, 0, 800, 0, 'First aid applied on site; box-cutter guard checked.', 'closed'
  ) returning id into inc1;
  insert into public.incident_persons (incident_id, person_type, is_primary, details) values (
    inc1, 'employee', true,
    '{"personType":"employee","employeeNumber":"E-2201","department":"Housekeeping","jobTitle":"Room Attendant","hrConfirmed":true}'::jsonb
  );

  -- 2. Trainee
  insert into public.incidents (incident_number, property_id, department_id, location_detail,
    occurred_at, reported_by, person_type, incident_type, injury_mechanism, injury_type, body_part,
    outcome, actual_severity, potential_severity, is_high_potential, hospital_referral,
    reportable_status, lost_workdays, restricted_duty_days, incident_cost,
    business_interruption_days, immediate_actions, status)
  values (
    'DEMO-2026-000102', prop_beach, dept_fb, 'Main kitchen, prep line 1',
    '2026-07-08 11:40+04', uid_nurse, 'trainee', 'Injury', 'slip_trip_fall_same_level',
    'Bruise / contusion', 'Hip / thigh', 'first_aid', 1, 2, false, false,
    'no', 0, 0, 0, 0, 'Trainee assisted; floor mats checked and wet-floor signage placed.',
    'investigating'
  ) returning id into inc2;
  insert into public.incident_persons (incident_id, person_type, is_primary, details) values (
    inc2, 'trainee', true,
    '{"personType":"trainee","trainingInstitution":"Mauritius Hotel School","placementSupervisor":"K. Ramsamy","trainingDepartment":"Food & Beverage","inductionStatus":"completed"}'::jsonb
  );

  -- 3. Guest + Major injury + Hospital referral
  insert into public.incidents (incident_number, property_id, department_id, location_detail,
    occurred_at, reported_by, person_type, incident_type, injury_mechanism, injury_type, body_part,
    outcome, actual_severity, potential_severity, is_high_potential, hospital_referral,
    reportable_status, lost_workdays, restricted_duty_days, incident_cost,
    business_interruption_days, immediate_actions, status)
  values (
    'DEMO-2026-000103', prop_beach, dept_front, 'Main lobby, entrance mat area',
    '2026-06-30 16:05+04', uid_nurse, 'guest', 'Injury', 'slip_trip_fall_same_level',
    'Fracture', 'Hip / thigh', 'hospitalisation', 4, 4, true, true,
    'yes', 0, 0, 42000, 0,
    'Guest assisted; ambulance called; wet-floor signage repositioned and mat re-secured.',
    'corrective_action'
  ) returning id into inc3;
  insert into public.incident_persons (incident_id, person_type, is_primary, details) values (
    inc3, 'guest', true,
    '{"personType":"guest","roomNumber":"412","guestRelationsFollowUp":true,"medicalReferral":true,"insuranceNotified":true}'::jsonb
  );

  -- 4. Contractor
  insert into public.incidents (incident_number, property_id, department_id, location_detail,
    occurred_at, reported_by, person_type, incident_type, injury_mechanism, injury_type, body_part,
    outcome, actual_severity, potential_severity, is_high_potential, hospital_referral,
    reportable_status, lost_workdays, restricted_duty_days, incident_cost,
    business_interruption_days, immediate_actions, status)
  values (
    'DEMO-2026-000104', prop_beach, dept_eng, 'Plant room, main switchboard',
    '2026-06-25 14:15+04', uid_dm, 'contractor', 'Injury', 'electrical_contact',
    'Other', 'Hand / wrist / finger', 'medical_treatment', 2, 4, true, false,
    'yes', 0, 2, 5000, 0, 'Power isolated; contractor assessed by nurse and referred to clinic.',
    'corrective_action'
  ) returning id into inc4;
  insert into public.incident_persons (incident_id, person_type, is_primary, details) values (
    inc4, 'contractor', true,
    '{"personType":"contractor","contractorCompany":"Volt Electrical Services","contractOwner":"Chief Engineer","permitToWorkStatus":"valid","contractorInductionCompleted":true}'::jsonb
  );

  -- 5. Near miss + High-potential incident
  insert into public.incidents (incident_number, property_id, department_id, location_detail,
    occurred_at, reported_by, person_type, incident_type, injury_mechanism, injury_type, body_part,
    outcome, actual_severity, potential_severity, is_high_potential, hospital_referral,
    reportable_status, lost_workdays, restricted_duty_days, incident_cost,
    business_interruption_days, immediate_actions, status)
  values (
    'DEMO-2026-000105', prop_beach, dept_eng, 'Block C façade, scaffold level 3',
    '2026-06-20 15:40+04', uid_dm, 'near_miss', 'High-potential near miss', 'falling_object',
    null, null, 'no_injury', 1, 5, true, false,
    'no', 0, 0, 0, 0, 'Façade works suspended; exclusion zone extended below the scaffold.',
    'corrective_action'
  ) returning id into inc5;

  -- 6. Lost-time injury
  insert into public.incidents (incident_number, property_id, department_id, location_detail,
    occurred_at, reported_by, person_type, incident_type, injury_mechanism, injury_type, body_part,
    outcome, actual_severity, potential_severity, is_high_potential, hospital_referral,
    reportable_status, lost_workdays, restricted_duty_days, incident_cost,
    business_interruption_days, immediate_actions, status)
  values (
    'DEMO-2026-000106', prop_beach, dept_hk, 'Room 235',
    '2026-06-15 11:05+04', uid_dm, 'employee', 'Injury', 'manual_handling',
    'Sprain / strain', 'Neck / back', 'lost_time_injury', 3, 3, false, false,
    'no', 6, 5, 8000, 0, 'Employee assisted; task stopped pending two-person lift review.',
    'verifying'
  ) returning id into inc6;
  insert into public.incident_persons (incident_id, person_type, is_primary, details) values (
    inc6, 'employee', true,
    '{"personType":"employee","employeeNumber":"E-2244","department":"Housekeeping","jobTitle":"Room Attendant","hrConfirmed":true}'::jsonb
  );

  -- 7. No person affected (property damage, weather-related — extra realism beyond the 10 required categories)
  insert into public.incidents (incident_number, property_id, department_id, location_detail,
    occurred_at, reported_by, person_type, incident_type, injury_mechanism, injury_type, body_part,
    outcome, actual_severity, potential_severity, is_high_potential, hospital_referral,
    reportable_status, lost_workdays, restricted_duty_days, incident_cost,
    business_interruption_days, immediate_actions, status)
  values (
    'DEMO-2026-000107', prop_beach, dept_grounds, 'Beach kiosk, north',
    '2026-05-28 08:10+04', uid_dm, 'none', 'Property / equipment damage', 'other',
    null, null, 'no_injury', 1, 4, false, false,
    'no', 0, 0, 14000, 1, 'Area cordoned pending repair; kiosk closed for the day.', 'closed'
  ) returning id into inc7;

  -- 8. Guest — food-allergen exposure (second guest scenario, distinct mechanism)
  insert into public.incidents (incident_number, property_id, department_id, location_detail,
    occurred_at, reported_by, person_type, incident_type, injury_mechanism, injury_type, body_part,
    outcome, actual_severity, potential_severity, is_high_potential, hospital_referral,
    reportable_status, lost_workdays, restricted_duty_days, incident_cost,
    business_interruption_days, immediate_actions, status)
  values (
    'DEMO-2026-000108', prop_beach, dept_fb, 'Banquet hall',
    '2026-05-18 13:45+04', uid_nurse, 'guest', 'Food-safety incident', 'food_allergen_exposure',
    'Allergic reaction', null, 'medical_treatment', 2, 3, false, false,
    'no', 0, 0, 1200, 0, 'Antihistamine administered by nurse; guest monitored 90 minutes.',
    'closed'
  ) returning id into inc8;
  insert into public.incident_persons (incident_id, person_type, is_primary, details) values (
    inc8, 'guest', true,
    '{"personType":"guest","roomNumber":"—","guestRelationsFollowUp":true,"medicalReferral":false,"insuranceNotified":false}'::jsonb
  );

  -- 9. Contractor — freshly reported, no investigation yet (status variety)
  insert into public.incidents (incident_number, property_id, department_id, location_detail,
    occurred_at, reported_by, person_type, incident_type, injury_mechanism, injury_type, body_part,
    outcome, actual_severity, potential_severity, is_high_potential, hospital_referral,
    reportable_status, lost_workdays, restricted_duty_days, incident_cost,
    business_interruption_days, immediate_actions, status)
  values (
    'DEMO-2026-000109', prop_beach, dept_eng, 'Back of house, loading bay',
    '2026-07-16 09:00+04', uid_dm, 'contractor', 'Near miss', 'struck_against_object',
    null, null, 'no_injury', 1, 2, false, false,
    'pending_determination', 0, 0, 0, 0, 'Delivery pallet re-stacked; area inspected.', 'reported'
  ) returning id into inc9;

  -- 10. Unsafe condition — freshly reported (status variety)
  insert into public.incidents (incident_number, property_id, department_id, location_detail,
    occurred_at, reported_by, person_type, incident_type, injury_mechanism, injury_type, body_part,
    outcome, actual_severity, potential_severity, is_high_potential, hospital_referral,
    reportable_status, lost_workdays, restricted_duty_days, incident_cost,
    business_interruption_days, immediate_actions, status)
  values (
    'DEMO-2026-000110', prop_beach, dept_front, 'Stairwell B',
    '2026-07-17 07:30+04', uid_dm, 'unsafe_condition', 'Unsafe condition', 'other',
    null, null, 'no_injury', 1, 3, false, false,
    'pending_determination', 0, 0, 0, 0, 'Handrail flagged; stairwell taped off pending repair.',
    'reported'
  ) returning id into inc10;

  ---------------------------------------------------------------------------
  -- 3. Investigations, causes, five-whys/witnesses — on the incidents beyond "reported".
  ---------------------------------------------------------------------------
  insert into public.investigations (incident_id, investigator_id, event_reconstruction, status)
    values (inc2, uid_hso, 'Trainee slipped on a wet section of kitchen floor near the wash-up area.', 'in_progress')
    returning id into inv1;
  insert into public.investigation_causes (investigation_id, cause_type, category, description) values
    (inv1, 'immediate', 'Unsafe condition', 'Wet floor not signed while wash-up was in progress'),
    (inv1, 'root', 'Training or competency gap', 'Trainee induction did not cover wet-floor signage protocol for that station');

  insert into public.investigations (incident_id, investigator_id, event_reconstruction, status)
    values (inc3, uid_hso, 'Guest slipped on the lobby entrance mat during a rain shower; sustained a hip fracture.', 'completed')
    returning id into inv2;
  insert into public.investigation_causes (investigation_id, cause_type, category, description) values
    (inv2, 'immediate', 'Unsafe condition', 'Entrance mat had shifted, exposing wet marble underneath'),
    (inv2, 'root', 'Maintenance failure', 'Mat-anchoring system had not been inspected since installation');
  insert into public.investigation_five_whys (investigation_id, sequence, question, answer) values
    (inv2, 1, 'Why did the guest slip?', 'Wet marble was exposed where the entrance mat had shifted'),
    (inv2, 2, 'Why had the mat shifted?', 'The anchoring strips were worn and no longer gripped the floor'),
    (inv2, 3, 'Why was this not caught earlier?', 'There is no scheduled inspection for entrance-mat condition in wet weather');

  insert into public.investigations (incident_id, investigator_id, event_reconstruction, status)
    values (inc4, uid_hso, 'Contractor received a minor electrical shock while inspecting the main switchboard.', 'completed')
    returning id into inv3;
  insert into public.investigation_causes (investigation_id, cause_type, category, description) values
    (inv3, 'immediate', 'Procedure not followed', 'Isolation was not fully verified before panel access'),
    (inv3, 'root', 'Contractor-management failure', 'Lock-out/tag-out verification step not enforced by the permit sign-off');
  insert into public.investigation_witnesses (investigation_id, name, role, statement) values
    (inv3, 'Site supervisor', 'Volt Electrical Services', 'Confirmed isolation had not been re-checked after a shift handover.');

  insert into public.investigations (incident_id, investigator_id, event_reconstruction, status)
    values (inc5, uid_hso, 'Scaffold plank became dislodged during façade works and fell approximately 4 metres; no one was struck.', 'completed')
    returning id into inv4;
  insert into public.investigation_causes (investigation_id, cause_type, category, description) values
    (inv4, 'immediate', 'Contractor control weakness', 'Plank was not clipped at both ends after a mid-shift reposition'),
    (inv4, 'root', 'Contractor-management failure', 'Permit-to-work checklist has no scaffold-integrity line item');
  insert into public.investigation_five_whys (investigation_id, sequence, question, answer) values
    (inv4, 1, 'Why did the plank fall?', 'It was not clipped at both ends'),
    (inv4, 2, 'Why was it not clipped?', 'It had been repositioned mid-shift and not re-secured'),
    (inv4, 3, 'Why did the permit-to-work not catch this?', 'The checklist has no scaffold-integrity verification item');

  insert into public.investigations (incident_id, investigator_id, event_reconstruction, status)
    values (inc6, uid_hso, 'Room attendant sustained an acute lower-back strain lifting a king mattress alone.', 'completed')
    returning id into inv5;
  insert into public.investigation_causes (investigation_id, cause_type, category, description) values
    (inv5, 'immediate', 'Unsafe action', 'Mattress lifted alone rather than as a two-person task'),
    (inv5, 'root', 'Staffing or workload', 'Room-pairing broken by absence cover with no buffer at peak occupancy');

  insert into public.investigations (incident_id, investigator_id, event_reconstruction, status)
    values (inc7, uid_hso, 'Two roof panels detached from the beach kiosk during heavy gusts; area was pre-closed.', 'completed')
    returning id into inv6;
  insert into public.investigation_causes (investigation_id, cause_type, category, description) values
    (inv6, 'immediate', 'Weather condition', 'Roof-panel fixings failed under gust loading'),
    (inv6, 'root', 'Maintenance failure', 'Coastal-exposure corrosion on fixings not covered by the standard inspection cycle');

  ---------------------------------------------------------------------------
  -- 4. CAPA actions on incidents — owner and verifier are always different people.
  ---------------------------------------------------------------------------
  insert into public.capa_actions (action_number, source_type, source_id, description,
    hierarchy_of_control, owner_id, property_id, department_id, priority, due_date, cost,
    status, verification_owner_id)
  values
    ('DEMO-CAPA-0001', 'incident', inc2, 'Add wet-floor signage protocol to trainee induction checklist',
      'administrative', uid_hso, prop_beach, dept_fb, 'medium', '2026-08-01', null, 'open', uid_dm),
    ('DEMO-CAPA-0002', 'incident', inc3, 'Replace entrance-mat anchoring system; add wet-weather inspection to daily FOH checklist',
      'engineering', uid_dm, prop_beach, dept_front, 'critical', '2026-07-20', 22000, 'in_progress', uid_hso),
    ('DEMO-CAPA-0003', 'incident', inc4, 'Add lock-out/tag-out re-verification step to the electrical permit-to-work',
      'administrative', uid_hso, prop_beach, dept_eng, 'high', '2026-07-28', null, 'open', uid_aud),
    ('DEMO-CAPA-0004', 'incident', inc5, 'Add scaffold-integrity checklist item to permit-to-work; toolbox talk every shift',
      'administrative', uid_hso, prop_beach, dept_eng, 'critical', '2026-07-20', null, 'in_progress', uid_aud),
    ('DEMO-CAPA-0005', 'incident', inc6, 'Fit mattress-lifting handles to all king mattresses',
      'engineering', uid_dm, prop_beach, dept_hk, 'high', '2026-07-15', 31000, 'verified', uid_hso),
    ('DEMO-CAPA-0006', 'incident', inc7, 'Cyclone-rated fixing retrofit on all beach structures',
      'engineering', uid_dm, prop_beach, dept_grounds, 'high', '2026-07-31', 45000, 'verified', uid_hso);

  insert into public.capa_verifications (capa_id, verifier_id, outcome, comment)
    select id, uid_hso, 'effective', 'Handles fitted across all king rooms; housekeeping confirmed in use.'
    from public.capa_actions where action_number = 'DEMO-CAPA-0005';
  insert into public.capa_verifications (capa_id, verifier_id, outcome, comment)
    select id, uid_hso, 'effective', 'Retrofit completed and re-inspected ahead of the next cyclone season.'
    from public.capa_actions where action_number = 'DEMO-CAPA-0006';

  ---------------------------------------------------------------------------
  -- 5. Control-framework mappings and legal-requirement flags (needed for the readiness KPIs).
  ---------------------------------------------------------------------------
  insert into public.control_framework_mappings (control_id, framework_id, clause_reference) values
    (ctrl_ptw, fw_iso, '§8.1.4'), (ctrl_ptw, fw_legal, 'OSH Act — high-risk work'),
    (ctrl_fire, fw_iso, '§8.1'), (ctrl_fire, fw_legal, 'Mauritius fire-safety certification'),
    (ctrl_legio, fw_iso, '§8.1'), (ctrl_legio, fw_legal, 'OSH Act — water hygiene'),
    (ctrl_pool, fw_iso, '§8.1'), (ctrl_pool, fw_gri, 'GRI 403-7'),
    (ctrl_chem, fw_iso, '§8.1'), (ctrl_chem, fw_legal, 'OSH Act — chemical safety'),
    (ctrl_contr, fw_iso, '§8.1.4'), (ctrl_contr, fw_hotel, 'Contractor management'),
    (ctrl_inc, fw_iso, '§10.2'), (ctrl_inc, fw_gri, 'GRI 403-2'),
    (ctrl_train, fw_iso, '§7.2'), (ctrl_train, fw_gri, 'GRI 403-5'),
    (ctrl_ppe, fw_iso, '§8.1'), (ctrl_ppe, fw_hotel, 'PPE provision'),
    (ctrl_ergo, fw_iso, '§8.1'), (ctrl_ergo, fw_gri, 'GRI 403-2')
  on conflict do nothing;

  insert into public.legal_requirement_details (control_id, citation, regulator, renewal_frequency) values
    (ctrl_fire, 'Mauritius fire-safety certification requirements', 'Mauritius Fire and Rescue Service', 'Annual'),
    (ctrl_legio, 'OSH Act 2005 — water hygiene / Legionella control duties', 'Ministry of Labour', 'Annual'),
    (ctrl_ptw, 'OSH Act 2005 — permit-to-work for high-risk activities', 'Ministry of Labour', 'N/A'),
    (ctrl_chem, 'OSH Act 2005 — hazardous-substance management', 'Ministry of Labour', 'N/A')
  on conflict do nothing;

  ---------------------------------------------------------------------------
  -- 6. Control assessments — deliberately includes one critical legal gap (FIRE-001) so the
  --    critical-gap override is actually demonstrable, not just documented.
  ---------------------------------------------------------------------------
  insert into public.control_assessments (control_id, property_id, period_label, dimension, maturity_score, is_critical_gap, assessed_by, notes) values
    (ctrl_ptw, prop_beach, '2026-Q3', 'policy', 3, false, uid_aud, null),
    (ctrl_ptw, prop_beach, '2026-Q3', 'procedure', 3, false, uid_aud, null),
    (ctrl_ptw, prop_beach, '2026-Q3', 'implementation', 2, false, uid_aud, null),
    (ctrl_ptw, prop_beach, '2026-Q3', 'effectiveness', 2, false, uid_aud, null),

    (ctrl_fire, prop_beach, '2026-Q3', 'policy', 3, false, uid_aud, 'Policy current.'),
    (ctrl_fire, prop_beach, '2026-Q3', 'procedure', 3, false, uid_aud, 'Procedure documented.'),
    (ctrl_fire, prop_beach, '2026-Q3', 'implementation', 1, true, uid_aud, 'Fire certificates expired — see finding DEMO-F-2026-01.'),
    (ctrl_fire, prop_beach, '2026-Q3', 'effectiveness', 1, true, uid_aud, 'Cannot be considered effective while certification is lapsed.'),

    (ctrl_legio, prop_beach, '2026-Q3', 'policy', 3, false, uid_aud, null),
    (ctrl_legio, prop_beach, '2026-Q3', 'procedure', 3, false, uid_aud, null),
    (ctrl_legio, prop_beach, '2026-Q3', 'implementation', 3, false, uid_aud, null),
    (ctrl_legio, prop_beach, '2026-Q3', 'effectiveness', 2, false, uid_aud, null),

    (ctrl_pool, prop_beach, '2026-Q3', 'policy', 3, false, uid_aud, null),
    (ctrl_pool, prop_beach, '2026-Q3', 'procedure', 3, false, uid_aud, null),
    (ctrl_pool, prop_beach, '2026-Q3', 'implementation', 3, false, uid_aud, null),
    (ctrl_pool, prop_beach, '2026-Q3', 'effectiveness', 3, false, uid_aud, null),

    (ctrl_chem, prop_beach, '2026-Q3', 'policy', 3, false, uid_aud, null),
    (ctrl_chem, prop_beach, '2026-Q3', 'procedure', 3, false, uid_aud, null),
    (ctrl_chem, prop_beach, '2026-Q3', 'implementation', 3, false, uid_aud, null),
    (ctrl_chem, prop_beach, '2026-Q3', 'effectiveness', 2, false, uid_aud, null),

    (ctrl_contr, prop_beach, '2026-Q3', 'policy', 3, false, uid_aud, null),
    (ctrl_contr, prop_beach, '2026-Q3', 'procedure', 3, false, uid_aud, null),
    (ctrl_contr, prop_beach, '2026-Q3', 'implementation', 2, false, uid_aud, 'Scaffold-integrity gap — see DEMO-2026-000105.'),
    (ctrl_contr, prop_beach, '2026-Q3', 'effectiveness', 2, false, uid_aud, null),

    (ctrl_inc, prop_beach, '2026-Q3', 'policy', 4, false, uid_aud, null),
    (ctrl_inc, prop_beach, '2026-Q3', 'procedure', 4, false, uid_aud, null),
    (ctrl_inc, prop_beach, '2026-Q3', 'implementation', 3, false, uid_aud, null),
    (ctrl_inc, prop_beach, '2026-Q3', 'effectiveness', 3, false, uid_aud, null),

    (ctrl_train, prop_beach, '2026-Q3', 'policy', 3, false, uid_aud, null),
    (ctrl_train, prop_beach, '2026-Q3', 'procedure', 3, false, uid_aud, null),
    (ctrl_train, prop_beach, '2026-Q3', 'implementation', 2, false, uid_aud, 'Induction gap identified — see finding DEMO-F-2026-02.'),
    (ctrl_train, prop_beach, '2026-Q3', 'effectiveness', 2, false, uid_aud, null),

    (ctrl_ppe, prop_beach, '2026-Q3', 'policy', 3, false, uid_aud, null),
    (ctrl_ppe, prop_beach, '2026-Q3', 'procedure', 3, false, uid_aud, null),
    (ctrl_ppe, prop_beach, '2026-Q3', 'implementation', 3, false, uid_aud, null),
    (ctrl_ppe, prop_beach, '2026-Q3', 'effectiveness', 3, false, uid_aud, null),

    (ctrl_ergo, prop_beach, '2026-Q3', 'policy', 2, false, uid_aud, null),
    (ctrl_ergo, prop_beach, '2026-Q3', 'procedure', 2, false, uid_aud, null),
    (ctrl_ergo, prop_beach, '2026-Q3', 'implementation', 1, false, uid_aud, 'Ergonomic risk of manual-handling tasks not yet formally assessed.'),
    (ctrl_ergo, prop_beach, '2026-Q3', 'effectiveness', 1, false, uid_aud, null)
  on conflict (control_id, property_id, department_id, period_label, dimension) do nothing;

  ---------------------------------------------------------------------------
  -- 7. Audit programme + findings (with matching CAPA, owner != verifier).
  ---------------------------------------------------------------------------
  insert into public.audits (audit_reference, type, scope, criteria, property_id, lead_auditor_id,
    planned_start, planned_end, actual_start, actual_end, status)
  values ('DEMO-AUD-2026-03', 'internal_audit', 'Sections A-I, Sunlife Beach Resort & Spa',
    'ISO 45001:2018 + ISO 19011 methodology', prop_beach, uid_aud,
    '2026-07-06', '2026-07-10', '2026-07-06', '2026-07-10', 'closed')
  returning id into aud1;

  insert into public.audits (audit_reference, type, scope, criteria, property_id, lead_auditor_id,
    planned_start, planned_end, status)
  values ('DEMO-AUD-2026-04', 'legal_compliance_audit', 'OSH Act register, licences, notifications',
    'Mauritius OSH Act 2005 and subsidiary regulations', prop_beach, uid_aud,
    '2026-08-18', '2026-08-18', 'planned')
  returning id into aud2;

  insert into public.audit_findings (audit_id, finding_number, control_id, classification, description, evidence, raised_by, status)
    values (aud1, 'DEMO-F-2026-01', ctrl_fire, 'critical_nc',
      'Fire certificates for all blocks expired; renewal inspection not yet scheduled. Property operating without valid certification.',
      'Certificate register reviewed on-site; all entries showed expiry dates in the past.', uid_aud, 'action_assigned')
    returning id into f1;
  insert into public.audit_findings (audit_id, finding_number, control_id, classification, description, evidence, raised_by, status)
    values (aud1, 'DEMO-F-2026-02', ctrl_train, 'major_nc',
      'Wet-floor signage protocol not covered in trainee induction — mirrors incident DEMO-2026-000102 root cause.',
      'Induction pack review.', uid_aud, 'action_assigned')
    returning id into f2;
  insert into public.audit_findings (audit_id, finding_number, control_id, classification, description, evidence, raised_by, status)
    values (aud1, 'DEMO-F-2026-03', ctrl_ergo, 'minor_nc',
      'No documented ergonomic assessment for repetitive manual-handling tasks in housekeeping.',
      'Risk-assessment register review.', uid_aud, 'open')
    returning id into f3;

  insert into public.capa_actions (action_number, source_type, source_id, description,
    hierarchy_of_control, owner_id, property_id, priority, due_date, status, verification_owner_id, required_evidence)
  values
    ('DEMO-CAPA-0007', 'audit_finding', f1, 'Emergency renewal inspection; interim fire-watch measures in place',
      'administrative', uid_hso, prop_beach, 'critical', '2026-07-25', 'in_progress', uid_super, 'New fire certificates uploaded to the evidence library'),
    ('DEMO-CAPA-0008', 'audit_finding', f2, 'Wet-floor signage protocol added to trainee induction; backlog cleared',
      'administrative', uid_dm, prop_beach, 'high', '2026-08-15', 'open', uid_hso, 'Updated induction pack'),
    ('DEMO-CAPA-0009', 'audit_finding', f3, 'Ergonomic assessment of top manual-handling tasks in housekeeping',
      'administrative', uid_hso, prop_beach, 'medium', '2026-09-30', 'open', uid_aud, 'Approved ergonomic assessment report');

  raise notice 'Demo dataset loaded: 10 incidents, 6 investigations, 9 CAPA actions, 40 control assessments, 2 audits, 3 findings.';
end $$;

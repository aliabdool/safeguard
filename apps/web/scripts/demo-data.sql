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

  inc1 uuid; inc2 uuid; inc3 uuid; inc4 uuid; inc5 uuid; inc6 uuid;
  inv1 uuid; inv2 uuid; inv3 uuid; inv4 uuid;
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
  -- 2. Incidents — a realistic spread across statuses, severities and person types.
  ---------------------------------------------------------------------------
  insert into public.incidents (incident_number, property_id, department_id, location_detail,
    occurred_at, reported_by, person_type, incident_type, injury_type, body_part, outcome,
    actual_severity, potential_severity, is_high_potential, hospital_referral, lost_workdays,
    restricted_duty_days, incident_cost, business_interruption_days, immediate_actions, status)
  values (
    'DEMO-2026-000101', prop_beach, dept_grounds, 'Garden, near beachfront restaurant',
    '2026-07-09 20:31+04', uid_nurse, 'guest', 'Injury', 'Bruise / contusion', 'Hip / thigh',
    'first_aid', 2, 4, true, false, 0, 0, 63000, 0,
    'Cold spray applied; area inspected and roped off.', 'corrective_action'
  ) returning id into inc1;

  insert into public.incidents (incident_number, property_id, department_id, location_detail,
    occurred_at, reported_by, person_type, incident_type, injury_type, body_part, outcome,
    actual_severity, potential_severity, is_high_potential, hospital_referral, lost_workdays,
    restricted_duty_days, incident_cost, business_interruption_days, immediate_actions, status)
  values (
    'DEMO-2026-000102', prop_beach, dept_fb, 'Main kitchen, prep line 2',
    '2026-07-06 10:15+04', uid_dm, 'employee', 'Injury', 'Cut / laceration', 'Hand / wrist / finger',
    'medical_treatment', 3, 3, false, true, 0, 5, 12400, 0,
    'First aid applied; referred to clinic for sutures.', 'corrective_action'
  ) returning id into inc2;

  insert into public.incidents (incident_number, property_id, department_id, location_detail,
    occurred_at, reported_by, person_type, incident_type, injury_type, body_part, outcome,
    actual_severity, potential_severity, is_high_potential, hospital_referral, lost_workdays,
    restricted_duty_days, incident_cost, business_interruption_days, immediate_actions, status)
  values (
    'DEMO-2026-000103', prop_beach, dept_eng, 'Block C façade, scaffold level 3',
    '2026-06-28 15:40+04', uid_dm, 'contractor', 'High-potential near miss', null, null,
    'no_injury', 1, 5, true, false, 0, 0, 85000, 0,
    'Façade works suspended; exclusion zone extended.', 'corrective_action'
  ) returning id into inc3;

  insert into public.incidents (incident_number, property_id, department_id, location_detail,
    occurred_at, reported_by, person_type, incident_type, injury_type, body_part, outcome,
    actual_severity, potential_severity, is_high_potential, hospital_referral, lost_workdays,
    restricted_duty_days, incident_cost, business_interruption_days, immediate_actions, status)
  values (
    'DEMO-2026-000104', prop_beach, dept_hk, 'Room 235',
    '2026-06-21 11:05+04', uid_dm, 'employee', 'Injury', 'Sprain / strain', 'Neck / back',
    'lost_time_injury', 3, 3, false, false, 6, 5, 58000, 0,
    'Employee assisted; task stopped pending two-person lift review.', 'verifying'
  ) returning id into inc4;

  insert into public.incidents (incident_number, property_id, department_id, location_detail,
    occurred_at, reported_by, person_type, incident_type, injury_type, body_part, outcome,
    actual_severity, potential_severity, is_high_potential, hospital_referral, lost_workdays,
    restricted_duty_days, incident_cost, business_interruption_days, immediate_actions, status)
  values (
    'DEMO-2026-000105', prop_beach, dept_front, 'Main lobby, entrance mat area',
    '2026-05-18 13:45+04', uid_nurse, 'guest', 'Injury', 'Bruise / contusion', 'Hip / thigh',
    'medical_treatment', 2, 3, false, false, 0, 0, 9000, 0,
    'Guest assisted; wet-floor signage repositioned.', 'closed'
  ) returning id into inc5;

  insert into public.incidents (incident_number, property_id, department_id, location_detail,
    occurred_at, reported_by, person_type, incident_type, injury_type, body_part, outcome,
    actual_severity, potential_severity, is_high_potential, hospital_referral, lost_workdays,
    restricted_duty_days, incident_cost, business_interruption_days, immediate_actions, status)
  values (
    'DEMO-2026-000106', prop_beach, dept_sec, 'Back-of-house corridor, dish area',
    '2026-07-12 07:55+04', uid_dm, 'near_miss', 'Near miss', null, null,
    'no_injury', 1, 3, false, false, 0, 0, 0, 0,
    'Area cordoned and dried immediately.', 'reported'
  ) returning id into inc6;

  ---------------------------------------------------------------------------
  -- 3. Investigations, causes, five-whys — on incidents 1-4.
  ---------------------------------------------------------------------------
  insert into public.investigations (incident_id, investigator_id, event_reconstruction, status)
    values (inc1, uid_hso, 'Guest struck by a falling branch while seated in the garden dining area during light winds.', 'completed')
    returning id into inv1;
  insert into public.investigation_causes (investigation_id, cause_type, category, description) values
    (inv1, 'immediate', 'Environmental condition', 'Overhanging branch not identified as a drop hazard'),
    (inv1, 'root', 'Risk assessment missing or inadequate', 'Garden risk assessment does not cover overhead drop hazards near seating');
  insert into public.investigation_five_whys (investigation_id, sequence, question, answer) values
    (inv1, 1, 'Why did the branch fall onto the seating area?', 'Dead branch above guest seating was not identified during routine grounds maintenance'),
    (inv1, 2, 'Why was it not identified?', 'Grounds inspection checklist does not include an overhead-hazard check'),
    (inv1, 3, 'Why does the checklist not cover this?', 'The checklist was written for ground-level hazards only and has not been reviewed since introduction');

  insert into public.investigations (incident_id, investigator_id, event_reconstruction, status)
    values (inc2, uid_hso, 'Commis chef lacerated a finger while dicing vegetables; blade slipped on a wet board.', 'completed')
    returning id into inv2;
  insert into public.investigation_causes (investigation_id, cause_type, category, description) values
    (inv2, 'immediate', 'Unsafe condition', 'Cutting board not secured; surface wet'),
    (inv2, 'root', 'Training or competency gap', 'New commis had not completed knife-skills induction before first solo prep shift');
  insert into public.investigation_witnesses (investigation_id, name, role, statement) values
    (inv2, 'D. Li', 'Sous Chef', 'Saw the board slide during the cut.');

  insert into public.investigations (incident_id, investigator_id, event_reconstruction, status)
    values (inc3, uid_hso, 'Scaffold plank became dislodged during façade works and fell approximately 4 metres; no one was struck.', 'completed')
    returning id into inv3;
  insert into public.investigation_causes (investigation_id, cause_type, category, description) values
    (inv3, 'immediate', 'Contractor control weakness', 'Plank was not clipped at both ends after a mid-shift reposition'),
    (inv3, 'root', 'Contractor-management failure', 'Permit-to-work checklist has no scaffold-integrity line item');
  insert into public.investigation_witnesses (investigation_id, name, role, statement) values
    (inv3, 'Site foreman', 'Contractor supervisor', 'Confirmed the plank was unclipped after the morning reposition.');

  insert into public.investigations (incident_id, investigator_id, event_reconstruction, status)
    values (inc4, uid_hso, 'Room attendant sustained an acute lower-back strain lifting a king mattress alone.', 'completed')
    returning id into inv4;
  insert into public.investigation_causes (investigation_id, cause_type, category, description) values
    (inv4, 'immediate', 'Unsafe action', 'Mattress lifted alone rather than as a two-person task'),
    (inv4, 'root', 'Staffing or workload', 'Room-pairing broken by absence cover with no buffer at peak occupancy');

  ---------------------------------------------------------------------------
  -- 4. CAPA actions on incidents — owner and verifier are always different people.
  ---------------------------------------------------------------------------
  insert into public.capa_actions (action_number, source_type, source_id, description,
    hierarchy_of_control, owner_id, property_id, department_id, priority, due_date, cost,
    status, verification_owner_id)
  values
    ('DEMO-CAPA-0001', 'incident', inc1, 'Inspect and clear overhead branches across all guest garden seating areas',
      'elimination', uid_dm, prop_beach, dept_grounds, 'high', '2026-07-25', 18000, 'verified', uid_hso),
    ('DEMO-CAPA-0002', 'incident', inc1, 'Add overhead drop-hazard check to the monthly grounds risk assessment',
      'administrative', uid_hso, prop_beach, dept_grounds, 'medium', '2026-08-15', null, 'open', uid_aud),
    ('DEMO-CAPA-0003', 'incident', inc2, 'Non-slip cutting-board mats on all prep stations',
      'engineering', uid_dm, prop_beach, dept_fb, 'high', '2026-07-18', 9500, 'in_progress', uid_hso),
    ('DEMO-CAPA-0004', 'incident', inc2, 'Knife-skills induction gate before first solo prep shift (roster policy change)',
      'administrative', uid_hso, prop_beach, dept_fb, 'medium', '2026-07-30', null, 'open', uid_dm),
    ('DEMO-CAPA-0005', 'incident', inc3, 'Add scaffold-integrity checklist item to permit-to-work; toolbox talk every shift',
      'administrative', uid_hso, prop_beach, dept_eng, 'critical', '2026-07-20', null, 'in_progress', uid_aud),
    ('DEMO-CAPA-0006', 'incident', inc4, 'Fit mattress-lifting handles to all king mattresses',
      'engineering', uid_dm, prop_beach, dept_hk, 'high', '2026-07-15', 31000, 'verified', uid_hso);

  insert into public.capa_verifications (capa_id, verifier_id, outcome, comment)
    select id, uid_hso, 'effective', 'Confirmed cleared and re-inspected; no repeat incidents in the review window.'
    from public.capa_actions where action_number = 'DEMO-CAPA-0001';
  insert into public.capa_verifications (capa_id, verifier_id, outcome, comment)
    select id, uid_hso, 'effective', 'Handles fitted across all king rooms; housekeeping confirmed in use.'
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
    (ctrl_contr, prop_beach, '2026-Q3', 'implementation', 2, false, uid_aud, 'Scaffold-integrity gap — see DEMO-2026-000103.'),
    (ctrl_contr, prop_beach, '2026-Q3', 'effectiveness', 2, false, uid_aud, null),

    (ctrl_inc, prop_beach, '2026-Q3', 'policy', 4, false, uid_aud, null),
    (ctrl_inc, prop_beach, '2026-Q3', 'procedure', 4, false, uid_aud, null),
    (ctrl_inc, prop_beach, '2026-Q3', 'implementation', 3, false, uid_aud, null),
    (ctrl_inc, prop_beach, '2026-Q3', 'effectiveness', 3, false, uid_aud, null),

    (ctrl_train, prop_beach, '2026-Q3', 'policy', 3, false, uid_aud, null),
    (ctrl_train, prop_beach, '2026-Q3', 'procedure', 3, false, uid_aud, null),
    (ctrl_train, prop_beach, '2026-Q3', 'implementation', 2, false, uid_aud, 'Induction backlog identified — see finding DEMO-F-2026-02.'),
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
      'Knife-skills induction not completed before first solo prep shift for a sample of new kitchen staff — mirrors incident DEMO-2026-000102 root cause.',
      'Training matrix sample review, 4 of 9 new starters.', uid_aud, 'action_assigned')
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
    ('DEMO-CAPA-0008', 'audit_finding', f2, 'Induction gate added to roster system before first solo shift; backlog cleared',
      'administrative', uid_dm, prop_beach, 'high', '2026-08-15', 'open', uid_hso, 'Updated training matrix'),
    ('DEMO-CAPA-0009', 'audit_finding', f3, 'Ergonomic assessment of top manual-handling tasks in housekeeping',
      'administrative', uid_hso, prop_beach, 'medium', '2026-09-30', 'open', uid_aud, 'Approved ergonomic assessment report');

  raise notice 'Demo dataset loaded: 6 incidents, 4 investigations, 9 CAPA actions, 40 control assessments, 2 audits, 3 findings.';
end $$;

-- =============================================================================================
-- SafeGuard: Supabase Auth wiring, RLS helper functions, and Row-Level Security policies.
--
-- Hand-written (not drizzle-kit generated) because it references Supabase-managed `auth.*`
-- objects that live outside our Drizzle schema, and because RLS policy authoring benefits from
-- being reviewed as readable SQL rather than diffed as generated DDL. See docs/security-model.md
-- for the design this migration implements — keep the two in sync if either changes.
--
-- This migration is NOT YET APPLIED to any live database (no Supabase project exists in this
-- session — see docs/implementation-plan.md §3). It is written and reviewable now so that
-- `drizzle-kit migrate` / `supabase db push` can run it the moment a project exists.
-- =============================================================================================

-- -------------------------------------------------------------------------------------------
-- 1. app_auth schema — RLS helper functions (created before use, referenced throughout)
-- -------------------------------------------------------------------------------------------

create schema if not exists app_auth;

create or replace function app_auth.current_profile_status()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select status::text from profiles where id = auth.uid();
$$;

create or replace function app_auth.is_active()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select status = 'active' from profiles where id = auth.uid()), false);
$$;

create or replace function app_auth.has_role(role_code text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from user_roles ur
    join roles r on r.id = ur.role_id
    where ur.user_id = auth.uid() and r.code = role_code
  );
$$;

create or replace function app_auth.has_any_role(role_codes text[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from user_roles ur
    join roles r on r.id = ur.role_id
    where ur.user_id = auth.uid() and r.code = any(role_codes)
  );
$$;

create or replace function app_auth.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select app_auth.has_any_role(array['SUPER_ADMIN', 'GROUP_HS_ADMIN']);
$$;

create or replace function app_auth.has_property_access(p_property_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    app_auth.is_admin()
    or app_auth.has_role('EXECUTIVE_READONLY')
    or exists (
      select 1 from user_property_access upa
      where upa.user_id = auth.uid() and upa.property_id = p_property_id
    );
$$;

create or replace function app_auth.has_department_access(p_property_id uuid, p_department_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    app_auth.is_admin()
    or p_department_id is null
    or exists (
      select 1 from user_department_access uda
      where uda.user_id = auth.uid()
        and uda.property_id = p_property_id
        and uda.department_id = p_department_id
    );
$$;

create or replace function app_auth.has_medical_permission()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from user_medical_permission ump
    where ump.user_id = auth.uid() and ump.revoked_at is null
  );
$$;

create or replace function app_auth.is_audit_team_member(p_audit_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from audit_team_members atm
    where atm.audit_id = p_audit_id and atm.user_id = auth.uid()
  );
$$;

-- -------------------------------------------------------------------------------------------
-- 2. profiles <-> auth.users wiring
-- -------------------------------------------------------------------------------------------

alter table "profiles"
  add constraint "profiles_id_auth_users_fk"
  foreign key ("id") references auth.users (id) on delete cascade;

-- New Supabase Auth users always start PENDING_APPROVAL with no role/property/department grants.
-- There is no in-app path that creates an already-approved user — see docs/roles-permissions.md §5.
create or replace function app_auth.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, status)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', new.email), 'pending_approval');
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function app_auth.handle_new_auth_user();

-- -------------------------------------------------------------------------------------------
-- 3. Grants — RLS policies are the real gate, but the underlying GRANT must exist too.
-- -------------------------------------------------------------------------------------------

grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
alter default privileges in schema public grant select, insert, update, delete on tables to authenticated;
-- `anon` never gets table grants in this app — every screen requires an authenticated session.

-- -------------------------------------------------------------------------------------------
-- 4. Enable + FORCE row level security on every table
-- -------------------------------------------------------------------------------------------

do $$
declare
  t text;
begin
  for t in
    select tablename from pg_tables where schemaname = 'public'
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
  end loop;
end $$;

-- -------------------------------------------------------------------------------------------
-- 5. Reference & organisation tables — readable by any active user, writable by admins only
-- -------------------------------------------------------------------------------------------

create policy properties_select on properties for select
  using (app_auth.is_active());
create policy properties_write on properties for all
  using (app_auth.is_active() and app_auth.is_admin())
  with check (app_auth.is_active() and app_auth.is_admin());

create policy departments_select on departments for select
  using (app_auth.is_active());
create policy departments_write on departments for all
  using (app_auth.is_active() and app_auth.is_admin())
  with check (app_auth.is_active() and app_auth.is_admin());

create policy property_departments_select on property_departments for select
  using (app_auth.is_active());
create policy property_departments_write on property_departments for all
  using (app_auth.is_active() and app_auth.is_admin())
  with check (app_auth.is_active() and app_auth.is_admin());

create policy frameworks_select on frameworks for select
  using (app_auth.is_active());
create policy frameworks_write on frameworks for all
  using (app_auth.is_active() and app_auth.is_admin())
  with check (app_auth.is_active() and app_auth.is_admin());

create policy roles_select on roles for select
  using (app_auth.is_active());
create policy roles_write on roles for all
  using (app_auth.is_active() and app_auth.has_role('SUPER_ADMIN'))
  with check (app_auth.is_active() and app_auth.has_role('SUPER_ADMIN'));

-- -------------------------------------------------------------------------------------------
-- 6. Identity & access
-- -------------------------------------------------------------------------------------------

-- Every authenticated user (any status) can read their own profile row — required so a
-- PENDING_APPROVAL user can see their own "awaiting approval" screen. They can never see anyone
-- else's profile unless admin, and can never change their own status/role/property grants
-- (those columns are only ever written by admin server actions using the service-role client,
-- which bypasses RLS deliberately and is audited).
create policy profiles_select_self_or_admin on profiles for select
  using (id = auth.uid() or app_auth.is_admin());
create policy profiles_update_self on profiles for update
  using (id = auth.uid())
  with check (id = auth.uid());
create policy profiles_admin_write on profiles for update
  using (app_auth.is_admin())
  with check (app_auth.is_admin());
create policy profiles_admin_insert on profiles for insert
  with check (app_auth.is_admin());

create policy user_roles_select on user_roles for select
  using (user_id = auth.uid() or app_auth.is_admin());
create policy user_roles_write on user_roles for all
  using (app_auth.is_admin())
  with check (app_auth.is_admin());

create policy user_property_access_select on user_property_access for select
  using (user_id = auth.uid() or app_auth.is_admin());
create policy user_property_access_write on user_property_access for all
  using (app_auth.is_admin())
  with check (app_auth.is_admin());

create policy user_department_access_select on user_department_access for select
  using (user_id = auth.uid() or app_auth.is_admin());
create policy user_department_access_write on user_department_access for all
  using (app_auth.is_admin())
  with check (app_auth.is_admin());

-- Medical permission grants: visible to the grantee and admins, but only Super Admin/Group HS
-- Admin can create/revoke a grant. Holding the grant does NOT require SUPER_ADMIN role, and
-- SUPER_ADMIN does not imply this table's predicate elsewhere (see §8 medical_records below).
create policy user_medical_permission_select on user_medical_permission for select
  using (user_id = auth.uid() or app_auth.is_admin());
create policy user_medical_permission_write on user_medical_permission for all
  using (app_auth.is_admin())
  with check (app_auth.is_admin());

create policy registration_requests_select on registration_requests for select
  using (user_id = auth.uid() or app_auth.is_admin());
create policy registration_requests_insert on registration_requests for insert
  with check (user_id = auth.uid());
create policy registration_requests_admin_update on registration_requests for update
  using (app_auth.is_admin())
  with check (app_auth.is_admin());

-- -------------------------------------------------------------------------------------------
-- 7. Incident management
-- -------------------------------------------------------------------------------------------

create policy incidents_select on incidents for select
  using (
    app_auth.is_active()
    and app_auth.has_property_access(property_id)
    and (
      app_auth.is_admin()
      or app_auth.has_department_access(property_id, department_id)
      or app_auth.has_role('EXECUTIVE_READONLY')
      or app_auth.has_role('INTERNAL_AUDITOR')
    )
  );
create policy incidents_insert on incidents for insert
  with check (
    app_auth.is_active()
    and app_auth.has_property_access(property_id)
    and app_auth.has_any_role(array[
      'INCIDENT_REPORTER','DUTY_MANAGER','DEPARTMENT_MANAGER',
      'PROPERTY_HS_OFFICER','GROUP_HS_ADMIN','SUPER_ADMIN'
    ])
  );
create policy incidents_update on incidents for update
  using (
    app_auth.is_active()
    and app_auth.has_property_access(property_id)
    and app_auth.has_any_role(array[
      'PROPERTY_HS_OFFICER','GROUP_HS_ADMIN','SUPER_ADMIN','DUTY_MANAGER','DEPARTMENT_MANAGER'
    ])
  )
  with check (app_auth.has_property_access(property_id));

create policy incident_persons_rw on incident_persons for all
  using (app_auth.is_active() and exists (
    select 1 from incidents i where i.id = incident_persons.incident_id
      and app_auth.has_property_access(i.property_id)
  ))
  with check (exists (
    select 1 from incidents i where i.id = incident_persons.incident_id
      and app_auth.has_property_access(i.property_id)
  ));

create policy incident_notifications_rw on incident_notifications for all
  using (app_auth.is_active() and exists (
    select 1 from incidents i where i.id = incident_notifications.incident_id
      and app_auth.has_property_access(i.property_id)
  ))
  with check (exists (
    select 1 from incidents i where i.id = incident_notifications.incident_id
      and app_auth.has_property_access(i.property_id)
  ));

create policy incident_attachments_rw on incident_attachments for all
  using (app_auth.is_active() and exists (
    select 1 from incidents i where i.id = incident_attachments.incident_id
      and app_auth.has_property_access(i.property_id)
  ))
  with check (exists (
    select 1 from incidents i where i.id = incident_attachments.incident_id
      and app_auth.has_property_access(i.property_id)
  ));

create policy investigations_rw on investigations for all
  using (app_auth.is_active() and exists (
    select 1 from incidents i where i.id = investigations.incident_id
      and app_auth.has_property_access(i.property_id)
      and (
        app_auth.is_admin()
        or investigations.investigator_id = auth.uid()
        or app_auth.has_department_access(i.property_id, i.department_id)
      )
  ))
  with check (exists (
    select 1 from incidents i where i.id = investigations.incident_id
      and app_auth.has_property_access(i.property_id)
  ));

create policy investigation_causes_rw on investigation_causes for all
  using (app_auth.is_active() and exists (
    select 1 from investigations inv
    join incidents i on i.id = inv.incident_id
    where inv.id = investigation_causes.investigation_id
      and app_auth.has_property_access(i.property_id)
  ))
  with check (exists (
    select 1 from investigations inv
    join incidents i on i.id = inv.incident_id
    where inv.id = investigation_causes.investigation_id
      and app_auth.has_property_access(i.property_id)
  ));

create policy investigation_five_whys_rw on investigation_five_whys for all
  using (app_auth.is_active() and exists (
    select 1 from investigations inv
    join incidents i on i.id = inv.incident_id
    where inv.id = investigation_five_whys.investigation_id
      and app_auth.has_property_access(i.property_id)
  ))
  with check (exists (
    select 1 from investigations inv
    join incidents i on i.id = inv.incident_id
    where inv.id = investigation_five_whys.investigation_id
      and app_auth.has_property_access(i.property_id)
  ));

create policy investigation_witnesses_rw on investigation_witnesses for all
  using (app_auth.is_active() and exists (
    select 1 from investigations inv
    join incidents i on i.id = inv.incident_id
    where inv.id = investigation_witnesses.investigation_id
      and app_auth.has_property_access(i.property_id)
  ))
  with check (exists (
    select 1 from investigations inv
    join incidents i on i.id = inv.incident_id
    where inv.id = investigation_witnesses.investigation_id
      and app_auth.has_property_access(i.property_id)
  ));

create policy investigation_linked_procedures_rw on investigation_linked_procedures for all
  using (app_auth.is_active() and exists (
    select 1 from investigations inv
    join incidents i on i.id = inv.incident_id
    where inv.id = investigation_linked_procedures.investigation_id
      and app_auth.has_property_access(i.property_id)
  ))
  with check (exists (
    select 1 from investigations inv
    join incidents i on i.id = inv.incident_id
    where inv.id = investigation_linked_procedures.investigation_id
      and app_auth.has_property_access(i.property_id)
  ));

create policy investigation_approvals_rw on investigation_approvals for all
  using (app_auth.is_active() and exists (
    select 1 from investigations inv
    join incidents i on i.id = inv.incident_id
    where inv.id = investigation_approvals.investigation_id
      and app_auth.has_property_access(i.property_id)
      and app_auth.has_any_role(array['PROPERTY_HS_OFFICER','GROUP_HS_ADMIN','SUPER_ADMIN'])
  ))
  with check (app_auth.has_any_role(array['PROPERTY_HS_OFFICER','GROUP_HS_ADMIN','SUPER_ADMIN']));

-- -------------------------------------------------------------------------------------------
-- 8. Restricted medical records — medical permission only, role is irrelevant (incl. Super Admin)
-- -------------------------------------------------------------------------------------------

create policy medical_records_select on medical_records for select
  using (
    app_auth.is_active()
    and app_auth.has_medical_permission()
    and exists (
      select 1 from incidents i
      where i.id = medical_records.incident_id
        and app_auth.has_property_access(i.property_id)
    )
  );
create policy medical_records_write on medical_records for insert
  with check (
    app_auth.is_active()
    and app_auth.has_medical_permission()
    and exists (
      select 1 from incidents i
      where i.id = medical_records.incident_id
        and app_auth.has_property_access(i.property_id)
    )
  );
create policy medical_records_update on medical_records for update
  using (app_auth.is_active() and app_auth.has_medical_permission())
  with check (app_auth.has_medical_permission());

create policy medical_attachments_select on medical_attachments for select
  using (
    app_auth.is_active() and app_auth.has_medical_permission()
    and exists (select 1 from medical_records mr where mr.id = medical_attachments.medical_record_id)
  );
create policy medical_attachments_write on medical_attachments for insert
  with check (
    app_auth.is_active() and app_auth.has_medical_permission()
    and exists (select 1 from medical_records mr where mr.id = medical_attachments.medical_record_id)
  );

-- -------------------------------------------------------------------------------------------
-- 9. CAPA — owner is never the sole gate on verification/closure
-- -------------------------------------------------------------------------------------------

create policy capa_actions_select on capa_actions for select
  using (
    app_auth.is_active()
    and app_auth.has_property_access(property_id)
    and (
      app_auth.is_admin()
      or owner_id = auth.uid()
      or verification_owner_id = auth.uid()
      or app_auth.has_department_access(property_id, department_id)
      or app_auth.has_role('INTERNAL_AUDITOR')
    )
  );
create policy capa_actions_insert on capa_actions for insert
  with check (app_auth.is_active() and app_auth.has_property_access(property_id));
create policy capa_actions_update on capa_actions for update
  using (
    app_auth.is_active()
    and app_auth.has_property_access(property_id)
    and (
      app_auth.is_admin()
      or owner_id = auth.uid()
      or verification_owner_id = auth.uid()
    )
  )
  with check (
    -- Second, independent check beyond the application layer: a transition into 'closed' can
    -- never be performed by the same user who is also the owner.
    status <> 'closed' or final_approved_by is null or final_approved_by <> owner_id
  );

create policy capa_verifications_rw on capa_verifications for all
  using (app_auth.is_active() and exists (
    select 1 from capa_actions c where c.id = capa_verifications.capa_id
      and app_auth.has_property_access(c.property_id)
  ))
  with check (
    verifier_id <> (select owner_id from capa_actions where id = capa_verifications.capa_id)
  );

-- -------------------------------------------------------------------------------------------
-- 10. H&S Framework — master control library
-- -------------------------------------------------------------------------------------------

create policy controls_select on controls for select using (app_auth.is_active());
create policy controls_write on controls for all
  using (app_auth.is_admin()) with check (app_auth.is_admin());

create policy control_framework_mappings_select on control_framework_mappings for select
  using (app_auth.is_active());
create policy control_framework_mappings_write on control_framework_mappings for all
  using (app_auth.is_admin()) with check (app_auth.is_admin());

create policy legal_requirement_details_select on legal_requirement_details for select
  using (app_auth.is_active());
create policy legal_requirement_details_write on legal_requirement_details for all
  using (app_auth.is_admin()) with check (app_auth.is_admin());

create policy control_assessments_select on control_assessments for select
  using (
    app_auth.is_active()
    and app_auth.has_property_access(property_id)
    and (
      app_auth.is_admin()
      or app_auth.has_department_access(property_id, department_id)
      or app_auth.has_role('EXECUTIVE_READONLY')
      or app_auth.has_role('INTERNAL_AUDITOR')
      or app_auth.has_role('EXTERNAL_AUDITOR_READONLY')
    )
  );
create policy control_assessments_write on control_assessments for insert
  with check (
    app_auth.is_active()
    and app_auth.has_property_access(property_id)
    and app_auth.has_any_role(array['PROPERTY_HS_OFFICER','GROUP_HS_ADMIN','SUPER_ADMIN','INTERNAL_AUDITOR'])
  );
create policy control_assessments_update on control_assessments for update
  using (
    app_auth.has_property_access(property_id)
    and app_auth.has_any_role(array['PROPERTY_HS_OFFICER','GROUP_HS_ADMIN','SUPER_ADMIN','INTERNAL_AUDITOR'])
  )
  with check (app_auth.has_property_access(property_id));

-- -------------------------------------------------------------------------------------------
-- 11. Audit & assurance
-- -------------------------------------------------------------------------------------------

create policy audits_select on audits for select
  using (
    app_auth.is_active()
    and (
      app_auth.has_property_access(property_id)
      or app_auth.is_audit_team_member(id)
    )
  );
create policy audits_write on audits for insert
  with check (
    app_auth.is_active()
    and app_auth.has_any_role(array['INTERNAL_AUDITOR','PROPERTY_HS_OFFICER','GROUP_HS_ADMIN','SUPER_ADMIN'])
  );
create policy audits_update on audits for update
  using (
    app_auth.has_any_role(array['INTERNAL_AUDITOR','GROUP_HS_ADMIN','SUPER_ADMIN'])
    or app_auth.is_audit_team_member(id)
  )
  with check (true);

create policy audit_departments_rw on audit_departments for all
  using (app_auth.is_active() and exists (
    select 1 from audits a where a.id = audit_departments.audit_id
      and (app_auth.has_property_access(a.property_id) or app_auth.is_audit_team_member(a.id))
  ))
  with check (exists (select 1 from audits a where a.id = audit_departments.audit_id));

create policy audit_team_members_select on audit_team_members for select
  using (app_auth.is_active() and (user_id = auth.uid() or app_auth.is_admin() or exists (
    select 1 from audits a where a.id = audit_team_members.audit_id and app_auth.has_property_access(a.property_id)
  )));
create policy audit_team_members_write on audit_team_members for all
  using (app_auth.has_any_role(array['INTERNAL_AUDITOR','GROUP_HS_ADMIN','SUPER_ADMIN']))
  with check (app_auth.has_any_role(array['INTERNAL_AUDITOR','GROUP_HS_ADMIN','SUPER_ADMIN']));

create policy audit_checklist_items_rw on audit_checklist_items for all
  using (app_auth.is_active() and exists (
    select 1 from audits a where a.id = audit_checklist_items.audit_id
      and (app_auth.has_property_access(a.property_id) or app_auth.is_audit_team_member(a.id))
  ))
  with check (exists (
    select 1 from audits a where a.id = audit_checklist_items.audit_id
      and app_auth.is_audit_team_member(a.id)
  ));

create policy audit_assessments_rw on audit_assessments for all
  using (app_auth.is_active() and exists (
    select 1 from audit_checklist_items aci
    join audits a on a.id = aci.audit_id
    where aci.id = audit_assessments.checklist_item_id
      and (app_auth.has_property_access(a.property_id) or app_auth.is_audit_team_member(a.id))
  ))
  with check (exists (
    select 1 from audit_checklist_items aci
    join audits a on a.id = aci.audit_id
    where aci.id = audit_assessments.checklist_item_id
      and app_auth.is_audit_team_member(a.id)
  ));

create policy audit_findings_select on audit_findings for select
  using (app_auth.is_active() and exists (
    select 1 from audits a where a.id = audit_findings.audit_id
      and (app_auth.has_property_access(a.property_id) or app_auth.is_audit_team_member(a.id))
  ));
create policy audit_findings_write on audit_findings for insert
  with check (exists (
    select 1 from audits a where a.id = audit_findings.audit_id and app_auth.is_audit_team_member(a.id)
  ));
create policy audit_findings_update on audit_findings for update
  using (exists (
    select 1 from audits a where a.id = audit_findings.audit_id
      and (app_auth.is_audit_team_member(a.id) or app_auth.has_any_role(array['GROUP_HS_ADMIN','SUPER_ADMIN']))
  ))
  with check (true);

-- -------------------------------------------------------------------------------------------
-- 12. Central document & evidence library
-- -------------------------------------------------------------------------------------------

create policy documents_select on documents for select using (app_auth.is_active());
create policy documents_insert on documents for insert
  with check (app_auth.is_active() and app_auth.has_any_role(array[
    'PROPERTY_HS_OFFICER','GROUP_HS_ADMIN','SUPER_ADMIN','INTERNAL_AUDITOR','DEPARTMENT_MANAGER'
  ]));
create policy documents_update on documents for update
  using (app_auth.is_active() and (owner_id = auth.uid() or app_auth.is_admin()))
  with check (true);

create policy document_versions_select on document_versions for select using (app_auth.is_active());
create policy document_versions_insert on document_versions for insert
  with check (app_auth.is_active() and exists (
    select 1 from documents d where d.id = document_versions.document_id
      and (d.owner_id = auth.uid() or app_auth.is_admin())
  ));
create policy document_versions_update on document_versions for update
  using (app_auth.has_any_role(array['PROPERTY_HS_OFFICER','GROUP_HS_ADMIN','SUPER_ADMIN']))
  with check (true);

create policy document_property_applicability_rw on document_property_applicability for all
  using (app_auth.is_active()) with check (app_auth.is_active());
create policy document_department_applicability_rw on document_department_applicability for all
  using (app_auth.is_active()) with check (app_auth.is_active());

create policy document_approval_history_select on document_approval_history for select
  using (app_auth.is_active());
create policy document_approval_history_insert on document_approval_history for insert
  with check (app_auth.has_any_role(array['PROPERTY_HS_OFFICER','GROUP_HS_ADMIN','SUPER_ADMIN']));

create policy evidence_links_select on evidence_links for select using (app_auth.is_active());
create policy evidence_links_insert on evidence_links for insert
  with check (app_auth.is_active());
create policy evidence_links_update on evidence_links for update
  using (app_auth.has_any_role(array['PROPERTY_HS_OFFICER','GROUP_HS_ADMIN','SUPER_ADMIN','INTERNAL_AUDITOR']))
  with check (true);

-- -------------------------------------------------------------------------------------------
-- 13. File registry
-- -------------------------------------------------------------------------------------------

create policy files_select on files for select using (app_auth.is_active());
create policy files_insert on files for insert with check (app_auth.is_active() and uploaded_by = auth.uid());

create policy file_access_log_select on file_access_log for select
  using (app_auth.is_admin() or accessed_by = auth.uid());
create policy file_access_log_insert on file_access_log for insert
  with check (accessed_by = auth.uid());

-- -------------------------------------------------------------------------------------------
-- 14. KPI catalogue & calculations
-- -------------------------------------------------------------------------------------------

create policy kpi_definitions_select on kpi_definitions for select using (app_auth.is_active());
create policy kpi_definitions_write on kpi_definitions for all
  using (app_auth.is_admin()) with check (app_auth.is_admin());

create policy kpi_framework_mappings_select on kpi_framework_mappings for select
  using (app_auth.is_active());
create policy kpi_framework_mappings_write on kpi_framework_mappings for all
  using (app_auth.is_admin()) with check (app_auth.is_admin());

create policy kpi_calculations_select on kpi_calculations for select
  using (
    app_auth.is_active()
    and (property_id is null or app_auth.has_property_access(property_id))
  );
create policy kpi_calculations_insert on kpi_calculations for insert
  with check (property_id is null or app_auth.has_property_access(property_id));

create policy exposure_data_select on exposure_data for select
  using (app_auth.is_active() and app_auth.has_property_access(property_id));
create policy exposure_data_write on exposure_data for insert
  with check (app_auth.has_any_role(array['PROPERTY_HS_OFFICER','GROUP_HS_ADMIN','SUPER_ADMIN'])
    and app_auth.has_property_access(property_id));
create policy exposure_data_update on exposure_data for update
  using (app_auth.has_any_role(array['GROUP_HS_ADMIN','SUPER_ADMIN']))
  with check (true);

-- -------------------------------------------------------------------------------------------
-- 15. Audit trail — append-only, no update/delete policy at all (default-deny)
-- -------------------------------------------------------------------------------------------

create policy audit_log_insert on audit_log for insert with check (true);
create policy audit_log_select on audit_log for select
  using (app_auth.is_admin() or actor_id = auth.uid());

revoke update, delete on audit_log from authenticated;

-- -------------------------------------------------------------------------------------------
-- 16. Notifications & reminders
-- -------------------------------------------------------------------------------------------

create policy notifications_rw on notifications for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy scheduled_reminders_select on scheduled_reminders for select
  using (app_auth.is_admin());
create policy scheduled_reminders_write on scheduled_reminders for all
  using (app_auth.is_admin()) with check (app_auth.is_admin());

-- -------------------------------------------------------------------------------------------
-- 17. Storage buckets + policies
-- -------------------------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('incident-evidence', 'incident-evidence', false, 15728640,
    array['image/jpeg','image/png','image/webp','image/heic','application/pdf']),
  ('controlled-documents', 'controlled-documents', false, 52428800,
    array['application/pdf','application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']),
  ('audit-evidence', 'audit-evidence', false, 52428800,
    array['application/pdf','image/jpeg','image/png',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']),
  ('capa-evidence', 'capa-evidence', false, 52428800,
    array['application/pdf','image/jpeg','image/png',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document']),
  ('restricted-medical', 'restricted-medical', false, 15728640,
    array['application/pdf','image/jpeg','image/png'])
on conflict (id) do nothing;

-- All five buckets: authenticated users can only touch objects when active. Uploads/downloads
-- issued by server actions go through the service-role client and bypass these policies
-- entirely — these exist as a second, independent gate for any direct client access attempt.
-- The `restricted-medical` bucket additionally requires medical permission.

create policy storage_incident_evidence on storage.objects for all
  using (bucket_id = 'incident-evidence' and app_auth.is_active())
  with check (bucket_id = 'incident-evidence' and app_auth.is_active());

create policy storage_controlled_documents on storage.objects for all
  using (bucket_id = 'controlled-documents' and app_auth.is_active())
  with check (bucket_id = 'controlled-documents' and app_auth.is_active());

create policy storage_audit_evidence on storage.objects for all
  using (bucket_id = 'audit-evidence' and app_auth.is_active())
  with check (bucket_id = 'audit-evidence' and app_auth.is_active());

create policy storage_capa_evidence on storage.objects for all
  using (bucket_id = 'capa-evidence' and app_auth.is_active())
  with check (bucket_id = 'capa-evidence' and app_auth.is_active());

create policy storage_restricted_medical on storage.objects for all
  using (bucket_id = 'restricted-medical' and app_auth.is_active() and app_auth.has_medical_permission())
  with check (bucket_id = 'restricted-medical' and app_auth.is_active() and app_auth.has_medical_permission());

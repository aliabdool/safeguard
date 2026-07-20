-- Custom SQL migration file, put your code below! --

-- =============================================================================================
-- RLS for the materiality and climate-risk tables added in 0004. Hand-written for the same
-- reason 0001 is: these reference the app_auth.* helper functions and benefit from being
-- reviewed as readable SQL. 0001's "enable + force RLS on every public table" loop ran before
-- these tables existed, so they need it explicitly here.
-- =============================================================================================

do $$
declare
  t text;
begin
  for t in select unnest(array['material_topics', 'materiality_consultations', 'climate_risks'])
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
  end loop;
end $$;

-- material_topics: read is broader than write (governance visibility for auditors/executives),
-- following the exact same shape as control_assessments in 0001 for consistency. Group-wide rows
-- (property_id is null) are only visible/writable to admins and Executive read-only, since
-- has_property_access(null) resolves to their bypass and nobody else's explicit grant.
create policy material_topics_select on material_topics for select
  using (
    app_auth.is_active()
    and (app_auth.has_property_access(property_id) or app_auth.has_role('INTERNAL_AUDITOR'))
  );
create policy material_topics_insert on material_topics for insert
  with check (
    app_auth.is_active()
    and app_auth.has_property_access(property_id)
    and app_auth.has_any_role(array['PROPERTY_HS_OFFICER', 'GROUP_HS_ADMIN', 'SUPER_ADMIN'])
  );
create policy material_topics_update on material_topics for update
  using (
    app_auth.has_property_access(property_id)
    and app_auth.has_any_role(array['PROPERTY_HS_OFFICER', 'GROUP_HS_ADMIN', 'SUPER_ADMIN'])
  )
  with check (app_auth.has_property_access(property_id));

create policy materiality_consultations_rw on materiality_consultations for all
  using (
    app_auth.is_active()
    and exists (
      select 1 from material_topics mt
      where mt.id = materiality_consultations.material_topic_id
        and (app_auth.has_property_access(mt.property_id) or app_auth.has_role('INTERNAL_AUDITOR'))
    )
  )
  with check (
    exists (
      select 1 from material_topics mt
      where mt.id = materiality_consultations.material_topic_id
        and app_auth.has_property_access(mt.property_id)
        and app_auth.has_any_role(array['PROPERTY_HS_OFFICER', 'GROUP_HS_ADMIN', 'SUPER_ADMIN'])
    )
  );

-- climate_risks: identical shape to material_topics — Sustainability/H&S governance data, same
-- read-broader-than-write rationale.
create policy climate_risks_select on climate_risks for select
  using (
    app_auth.is_active()
    and (app_auth.has_property_access(property_id) or app_auth.has_role('INTERNAL_AUDITOR'))
  );
create policy climate_risks_insert on climate_risks for insert
  with check (
    app_auth.is_active()
    and app_auth.has_property_access(property_id)
    and app_auth.has_any_role(array['PROPERTY_HS_OFFICER', 'GROUP_HS_ADMIN', 'SUPER_ADMIN'])
  );
create policy climate_risks_update on climate_risks for update
  using (
    app_auth.has_property_access(property_id)
    and app_auth.has_any_role(array['PROPERTY_HS_OFFICER', 'GROUP_HS_ADMIN', 'SUPER_ADMIN'])
  )
  with check (app_auth.has_property_access(property_id));

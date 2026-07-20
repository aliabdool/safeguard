-- =============================================================================================
-- STEP 1 of 2 — Schema migrations only (0003, 0004, 0005).
--
-- Run this ENTIRE file as ONE paste in the Supabase SQL Editor, then wait for it to finish
-- successfully before running step 2 (2026-07-step2-seed-and-demo-data.sql).
--
-- SAFE TO RE-RUN, including after a partial failure. Every statement below either uses an
-- "IF NOT EXISTS" form or is wrapped in a DO block that swallows a "already exists" error
-- (SQLSTATE 42710, duplicate_object) — so if a previous attempt got partway through and errored,
-- just run this whole file again unmodified. It will skip everything that already exists and
-- create/complete whatever is still missing, including the RLS policies at the end.
--
-- Why two separate steps and not one: this file adds new values to two ALREADY-EXISTING enum
-- types (person_type gets 'trainee', evidence_linked_entity_type gets 'incident'/'climate_risk'/
-- 'material_topic' via ALTER TYPE ... ADD VALUE). Postgres will not let a freshly-added enum
-- value be USED (inserted, compared, cast) inside the same transaction that added it, and
-- Supabase's SQL Editor runs one pasted block as a single implicit transaction. Step 2 inserts
-- rows using 'trainee' etc., so it must run as a separate paste, after this one has committed.
-- =============================================================================================

-- --------------------------------------------------------------------------------------------
-- 0003_trainee_reportable_injury_mechanism.sql
-- --------------------------------------------------------------------------------------------
do $$ begin
  create type "public"."injury_mechanism" as enum('slip_trip_fall_same_level', 'fall_from_height', 'cut_laceration', 'burn_scald', 'manual_handling', 'struck_by_object', 'struck_against_object', 'falling_object', 'chemical_exposure', 'electrical_contact', 'vehicle_related', 'ergonomic_repetitive_strain', 'food_allergen_exposure', 'marine_swimming', 'other');
exception when duplicate_object then null; end $$;

do $$ begin
  create type "public"."osh_reportable_status" as enum('yes', 'no', 'pending_determination');
exception when duplicate_object then null; end $$;

alter type "public"."evidence_linked_entity_type" add value if not exists 'incident';
alter type "public"."person_type" add value if not exists 'trainee' before 'contractor';

alter table "incident_persons" add column if not exists "details" jsonb;
alter table "incidents" add column if not exists "injury_mechanism" "injury_mechanism";
alter table "incidents" add column if not exists "reportable_status" "osh_reportable_status" default 'pending_determination' not null;
alter table "incidents" add column if not exists "reporting_authority" text;
alter table "incidents" add column if not exists "reporting_deadline" date;
alter table "incidents" add column if not exists "date_submitted" date;
alter table "incidents" add column if not exists "submission_reference" text;

-- --------------------------------------------------------------------------------------------
-- 0004_materiality_and_climate_risk.sql
-- --------------------------------------------------------------------------------------------
do $$ begin
  create type "public"."assessment_status" as enum('draft', 'under_review', 'approved');
exception when duplicate_object then null; end $$;

do $$ begin
  create type "public"."climate_hazard" as enum('cyclone', 'flood', 'extreme_rainfall', 'storm_surge', 'coastal_erosion', 'heatwave', 'fire', 'rising_temperature', 'heat_stress', 'water_scarcity', 'sea_level_rise', 'vector_borne_disease', 'changing_working_conditions', 'regulation', 'carbon_pricing', 'insurance_cost', 'energy_requirements', 'disclosure_requirements', 'technology_changes', 'reputation_customer_expectations');
exception when duplicate_object then null; end $$;

do $$ begin
  create type "public"."climate_risk_category" as enum('acute_physical', 'chronic_physical', 'transition');
exception when duplicate_object then null; end $$;

do $$ begin
  create type "public"."consultation_type" as enum('stakeholder', 'expert');
exception when duplicate_object then null; end $$;

do $$ begin
  create type "public"."gri_impact_type" as enum('actual', 'potential');
exception when duplicate_object then null; end $$;

do $$ begin
  create type "public"."gri_impact_valence" as enum('positive', 'negative');
exception when duplicate_object then null; end $$;

do $$ begin
  create type "public"."ifrs_risk_or_opportunity" as enum('risk', 'opportunity');
exception when duplicate_object then null; end $$;

do $$ begin
  create type "public"."time_horizon" as enum('short_term', 'medium_term', 'long_term');
exception when duplicate_object then null; end $$;

alter type "public"."evidence_linked_entity_type" add value if not exists 'climate_risk';
alter type "public"."evidence_linked_entity_type" add value if not exists 'material_topic';

create table if not exists "material_topics" (
	"id" uuid primary key default gen_random_uuid() not null,
	"topic_name" text not null,
	"topic_description" text,
	"property_id" uuid,
	"reporting_period" text not null,
	"gri_impact_type" "gri_impact_type",
	"gri_impact_valence" "gri_impact_valence",
	"gri_severity" integer,
	"gri_scale" integer,
	"gri_scope" integer,
	"gri_irremediable" boolean,
	"gri_likelihood" integer,
	"gri_impact_score" integer,
	"gri_material" boolean,
	"ifrs_risk_or_opportunity" "ifrs_risk_or_opportunity",
	"ifrs_time_horizon" time_horizon,
	"ifrs_likelihood" integer,
	"ifrs_financial_magnitude" integer,
	"ifrs_effect_cash_flows" boolean default false not null,
	"ifrs_effect_access_to_finance" boolean default false not null,
	"ifrs_effect_cost_of_capital" boolean default false not null,
	"ifrs_effect_business_model_strategy" boolean default false not null,
	"ifrs_investor_relevance" boolean default false not null,
	"ifrs_financial_score" integer,
	"ifrs_material" boolean,
	"status" "assessment_status" default 'draft' not null,
	"assessed_by" uuid not null,
	"assessed_at" timestamp with time zone default now() not null,
	"approved_by" uuid,
	"approved_at" timestamp with time zone,
	"created_at" timestamp with time zone default now() not null,
	"updated_at" timestamp with time zone default now() not null
);

create table if not exists "materiality_consultations" (
	"id" uuid primary key default gen_random_uuid() not null,
	"material_topic_id" uuid not null,
	"consultation_type" "consultation_type" not null,
	"participant_name_or_group" text not null,
	"method" text,
	"consultation_date" date,
	"summary" text,
	"recorded_by" uuid not null,
	"recorded_at" timestamp with time zone default now() not null
);

create table if not exists "climate_risks" (
	"id" uuid primary key default gen_random_uuid() not null,
	"property_id" uuid,
	"category" "climate_risk_category" not null,
	"hazard" "climate_hazard" not null,
	"description" text not null,
	"exposure" text,
	"vulnerability" text,
	"existing_controls" text,
	"residual_risk_level" integer,
	"time_horizon" time_horizon not null,
	"financial_effect" numeric(14, 2),
	"currency" text default 'MUR' not null,
	"adaptation_action" text,
	"responsible_owner" uuid,
	"scenario_assumptions" text,
	"resilience_conclusion" text,
	"status" "assessment_status" default 'draft' not null,
	"assessed_by" uuid not null,
	"assessed_at" timestamp with time zone default now() not null,
	"approved_by" uuid,
	"approved_at" timestamp with time zone,
	"created_at" timestamp with time zone default now() not null,
	"updated_at" timestamp with time zone default now() not null
);

do $$ begin
  alter table "material_topics" add constraint "material_topics_property_id_properties_id_fk" foreign key ("property_id") references "public"."properties"("id") on delete restrict on update no action;
exception when duplicate_object then null; end $$;
do $$ begin
  alter table "material_topics" add constraint "material_topics_assessed_by_profiles_id_fk" foreign key ("assessed_by") references "public"."profiles"("id") on delete no action on update no action;
exception when duplicate_object then null; end $$;
do $$ begin
  alter table "material_topics" add constraint "material_topics_approved_by_profiles_id_fk" foreign key ("approved_by") references "public"."profiles"("id") on delete no action on update no action;
exception when duplicate_object then null; end $$;
do $$ begin
  alter table "materiality_consultations" add constraint "materiality_consultations_material_topic_id_material_topics_id_fk" foreign key ("material_topic_id") references "public"."material_topics"("id") on delete cascade on update no action;
exception when duplicate_object then null; end $$;
do $$ begin
  alter table "materiality_consultations" add constraint "materiality_consultations_recorded_by_profiles_id_fk" foreign key ("recorded_by") references "public"."profiles"("id") on delete no action on update no action;
exception when duplicate_object then null; end $$;
do $$ begin
  alter table "climate_risks" add constraint "climate_risks_property_id_properties_id_fk" foreign key ("property_id") references "public"."properties"("id") on delete restrict on update no action;
exception when duplicate_object then null; end $$;
do $$ begin
  alter table "climate_risks" add constraint "climate_risks_responsible_owner_profiles_id_fk" foreign key ("responsible_owner") references "public"."profiles"("id") on delete no action on update no action;
exception when duplicate_object then null; end $$;
do $$ begin
  alter table "climate_risks" add constraint "climate_risks_assessed_by_profiles_id_fk" foreign key ("assessed_by") references "public"."profiles"("id") on delete no action on update no action;
exception when duplicate_object then null; end $$;
do $$ begin
  alter table "climate_risks" add constraint "climate_risks_approved_by_profiles_id_fk" foreign key ("approved_by") references "public"."profiles"("id") on delete no action on update no action;
exception when duplicate_object then null; end $$;

-- --------------------------------------------------------------------------------------------
-- 0005_materiality_climate_risk_rls.sql
-- --------------------------------------------------------------------------------------------
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

drop policy if exists material_topics_select on material_topics;
create policy material_topics_select on material_topics for select
  using (
    app_auth.is_active()
    and (app_auth.has_property_access(property_id) or app_auth.has_role('INTERNAL_AUDITOR'))
  );

drop policy if exists material_topics_insert on material_topics;
create policy material_topics_insert on material_topics for insert
  with check (
    app_auth.is_active()
    and app_auth.has_property_access(property_id)
    and app_auth.has_any_role(array['PROPERTY_HS_OFFICER', 'GROUP_HS_ADMIN', 'SUPER_ADMIN'])
  );

drop policy if exists material_topics_update on material_topics;
create policy material_topics_update on material_topics for update
  using (
    app_auth.has_property_access(property_id)
    and app_auth.has_any_role(array['PROPERTY_HS_OFFICER', 'GROUP_HS_ADMIN', 'SUPER_ADMIN'])
  )
  with check (app_auth.has_property_access(property_id));

drop policy if exists materiality_consultations_rw on materiality_consultations;
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

drop policy if exists climate_risks_select on climate_risks;
create policy climate_risks_select on climate_risks for select
  using (
    app_auth.is_active()
    and (app_auth.has_property_access(property_id) or app_auth.has_role('INTERNAL_AUDITOR'))
  );

drop policy if exists climate_risks_insert on climate_risks;
create policy climate_risks_insert on climate_risks for insert
  with check (
    app_auth.is_active()
    and app_auth.has_property_access(property_id)
    and app_auth.has_any_role(array['PROPERTY_HS_OFFICER', 'GROUP_HS_ADMIN', 'SUPER_ADMIN'])
  );

drop policy if exists climate_risks_update on climate_risks;
create policy climate_risks_update on climate_risks for update
  using (
    app_auth.has_property_access(property_id)
    and app_auth.has_any_role(array['PROPERTY_HS_OFFICER', 'GROUP_HS_ADMIN', 'SUPER_ADMIN'])
  )
  with check (app_auth.has_property_access(property_id));

-- Step 1 complete. Verify with:
--   select enumlabel from pg_enum where enumtypid = 'person_type'::regtype order by enumsortorder;
--   -- should include 'trainee'
--   select table_name from information_schema.tables
--   where table_name in ('material_topics','materiality_consultations','climate_risks');
--   -- should return all 3
-- Then proceed to 2026-07-step2-seed-and-demo-data.sql.

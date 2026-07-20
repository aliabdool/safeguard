-- =============================================================================================
-- STEP 1 of 2 — Schema migrations only (0003, 0004, 0005).
--
-- Run this ENTIRE file as ONE paste in the Supabase SQL Editor, then wait for it to finish
-- successfully before running step 2 (2026-07-step2-seed-and-demo-data.sql).
--
-- Why two separate steps and not one: this file adds new values to two ALREADY-EXISTING enum
-- types (person_type gets 'trainee', evidence_linked_entity_type gets 'incident'/'climate_risk'/
-- 'material_topic' via ALTER TYPE ... ADD VALUE). Postgres will not let a freshly-added enum
-- value be USED (inserted, compared, cast) inside the same transaction that added it, and
-- Supabase's SQL Editor runs one pasted block as a single implicit transaction. Step 2 inserts
-- rows using 'trainee' etc., so it must run as a separate paste, after this one has committed.
--
-- Safe to run once. Not designed to be re-run — if it partially fails, read the error, fix it,
-- and re-run only the remaining statements rather than the whole file (CREATE TYPE / ADD COLUMN
-- will error on a second full run since these are not idempotent, unlike seed.sql).
-- =============================================================================================

-- --------------------------------------------------------------------------------------------
-- 0003_trainee_reportable_injury_mechanism.sql
-- --------------------------------------------------------------------------------------------
CREATE TYPE "public"."injury_mechanism" AS ENUM('slip_trip_fall_same_level', 'fall_from_height', 'cut_laceration', 'burn_scald', 'manual_handling', 'struck_by_object', 'struck_against_object', 'falling_object', 'chemical_exposure', 'electrical_contact', 'vehicle_related', 'ergonomic_repetitive_strain', 'food_allergen_exposure', 'marine_swimming', 'other');--> statement-breakpoint
CREATE TYPE "public"."osh_reportable_status" AS ENUM('yes', 'no', 'pending_determination');--> statement-breakpoint
ALTER TYPE "public"."evidence_linked_entity_type" ADD VALUE 'incident';--> statement-breakpoint
ALTER TYPE "public"."person_type" ADD VALUE 'trainee' BEFORE 'contractor';--> statement-breakpoint
ALTER TABLE "incident_persons" ADD COLUMN "details" jsonb;--> statement-breakpoint
ALTER TABLE "incidents" ADD COLUMN "injury_mechanism" "injury_mechanism";--> statement-breakpoint
ALTER TABLE "incidents" ADD COLUMN "reportable_status" "osh_reportable_status" DEFAULT 'pending_determination' NOT NULL;--> statement-breakpoint
ALTER TABLE "incidents" ADD COLUMN "reporting_authority" text;--> statement-breakpoint
ALTER TABLE "incidents" ADD COLUMN "reporting_deadline" date;--> statement-breakpoint
ALTER TABLE "incidents" ADD COLUMN "date_submitted" date;--> statement-breakpoint
ALTER TABLE "incidents" ADD COLUMN "submission_reference" text;

-- --------------------------------------------------------------------------------------------
-- 0004_materiality_and_climate_risk.sql
-- --------------------------------------------------------------------------------------------
CREATE TYPE "public"."assessment_status" AS ENUM('draft', 'under_review', 'approved');--> statement-breakpoint
CREATE TYPE "public"."climate_hazard" AS ENUM('cyclone', 'flood', 'extreme_rainfall', 'storm_surge', 'coastal_erosion', 'heatwave', 'fire', 'rising_temperature', 'heat_stress', 'water_scarcity', 'sea_level_rise', 'vector_borne_disease', 'changing_working_conditions', 'regulation', 'carbon_pricing', 'insurance_cost', 'energy_requirements', 'disclosure_requirements', 'technology_changes', 'reputation_customer_expectations');--> statement-breakpoint
CREATE TYPE "public"."climate_risk_category" AS ENUM('acute_physical', 'chronic_physical', 'transition');--> statement-breakpoint
CREATE TYPE "public"."consultation_type" AS ENUM('stakeholder', 'expert');--> statement-breakpoint
CREATE TYPE "public"."gri_impact_type" AS ENUM('actual', 'potential');--> statement-breakpoint
CREATE TYPE "public"."gri_impact_valence" AS ENUM('positive', 'negative');--> statement-breakpoint
CREATE TYPE "public"."ifrs_risk_or_opportunity" AS ENUM('risk', 'opportunity');--> statement-breakpoint
CREATE TYPE "public"."time_horizon" AS ENUM('short_term', 'medium_term', 'long_term');--> statement-breakpoint
ALTER TYPE "public"."evidence_linked_entity_type" ADD VALUE 'climate_risk';--> statement-breakpoint
ALTER TYPE "public"."evidence_linked_entity_type" ADD VALUE 'material_topic';--> statement-breakpoint
CREATE TABLE "material_topics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"topic_name" text NOT NULL,
	"topic_description" text,
	"property_id" uuid,
	"reporting_period" text NOT NULL,
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
	"ifrs_effect_cash_flows" boolean DEFAULT false NOT NULL,
	"ifrs_effect_access_to_finance" boolean DEFAULT false NOT NULL,
	"ifrs_effect_cost_of_capital" boolean DEFAULT false NOT NULL,
	"ifrs_effect_business_model_strategy" boolean DEFAULT false NOT NULL,
	"ifrs_investor_relevance" boolean DEFAULT false NOT NULL,
	"ifrs_financial_score" integer,
	"ifrs_material" boolean,
	"status" "assessment_status" DEFAULT 'draft' NOT NULL,
	"assessed_by" uuid NOT NULL,
	"assessed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"approved_by" uuid,
	"approved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "materiality_consultations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"material_topic_id" uuid NOT NULL,
	"consultation_type" "consultation_type" NOT NULL,
	"participant_name_or_group" text NOT NULL,
	"method" text,
	"consultation_date" date,
	"summary" text,
	"recorded_by" uuid NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "climate_risks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"property_id" uuid,
	"category" "climate_risk_category" NOT NULL,
	"hazard" "climate_hazard" NOT NULL,
	"description" text NOT NULL,
	"exposure" text,
	"vulnerability" text,
	"existing_controls" text,
	"residual_risk_level" integer,
	"time_horizon" time_horizon NOT NULL,
	"financial_effect" numeric(14, 2),
	"currency" text DEFAULT 'MUR' NOT NULL,
	"adaptation_action" text,
	"responsible_owner" uuid,
	"scenario_assumptions" text,
	"resilience_conclusion" text,
	"status" "assessment_status" DEFAULT 'draft' NOT NULL,
	"assessed_by" uuid NOT NULL,
	"assessed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"approved_by" uuid,
	"approved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "material_topics" ADD CONSTRAINT "material_topics_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_topics" ADD CONSTRAINT "material_topics_assessed_by_profiles_id_fk" FOREIGN KEY ("assessed_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_topics" ADD CONSTRAINT "material_topics_approved_by_profiles_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "materiality_consultations" ADD CONSTRAINT "materiality_consultations_material_topic_id_material_topics_id_fk" FOREIGN KEY ("material_topic_id") REFERENCES "public"."material_topics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "materiality_consultations" ADD CONSTRAINT "materiality_consultations_recorded_by_profiles_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "climate_risks" ADD CONSTRAINT "climate_risks_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "climate_risks" ADD CONSTRAINT "climate_risks_responsible_owner_profiles_id_fk" FOREIGN KEY ("responsible_owner") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "climate_risks" ADD CONSTRAINT "climate_risks_assessed_by_profiles_id_fk" FOREIGN KEY ("assessed_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "climate_risks" ADD CONSTRAINT "climate_risks_approved_by_profiles_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;

-- --------------------------------------------------------------------------------------------
-- 0005_materiality_climate_risk_rls.sql
-- --------------------------------------------------------------------------------------------
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


-- Step 1 complete. Verify with:
--   select enumlabel from pg_enum where enumtypid = 'person_type'::regtype order by enumsortorder;
--   -- should include 'trainee'
--   select table_name from information_schema.tables
--   where table_name in ('material_topics','materiality_consultations','climate_risks');
--   -- should return all 3
-- Then proceed to 2026-07-step2-seed-and-demo-data.sql.

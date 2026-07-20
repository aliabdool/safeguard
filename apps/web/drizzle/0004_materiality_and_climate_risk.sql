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
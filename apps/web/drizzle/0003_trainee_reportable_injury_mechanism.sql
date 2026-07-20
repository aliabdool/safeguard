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
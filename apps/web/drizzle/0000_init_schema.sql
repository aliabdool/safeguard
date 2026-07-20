CREATE TYPE "public"."audit_status" AS ENUM('planned', 'in_progress', 'reporting', 'closed');--> statement-breakpoint
CREATE TYPE "public"."audit_type" AS ENUM('self_assessment', 'department_inspection', 'internal_audit', 'legal_compliance_audit', 'iso45001_readiness', 'external_assurance');--> statement-breakpoint
CREATE TYPE "public"."capa_priority" AS ENUM('low', 'medium', 'high', 'critical');--> statement-breakpoint
CREATE TYPE "public"."capa_source_type" AS ENUM('incident', 'audit_finding', 'legal_gap', 'inspection', 'management_review');--> statement-breakpoint
CREATE TYPE "public"."capa_status" AS ENUM('open', 'in_progress', 'pending_verification', 'verified', 'closed', 'overdue');--> statement-breakpoint
CREATE TYPE "public"."capa_verification_outcome" AS ENUM('effective', 'not_effective');--> statement-breakpoint
CREATE TYPE "public"."cause_type" AS ENUM('immediate', 'root');--> statement-breakpoint
CREATE TYPE "public"."confidentiality_level" AS ENUM('public', 'internal', 'confidential', 'restricted');--> statement-breakpoint
CREATE TYPE "public"."data_quality_status" AS ENUM('ok', 'unverified', 'incomplete');--> statement-breakpoint
CREATE TYPE "public"."document_approval_action" AS ENUM('submitted', 'approved', 'rejected', 'superseded');--> statement-breakpoint
CREATE TYPE "public"."document_status" AS ENUM('draft', 'under_review', 'approved', 'expired', 'superseded', 'archived');--> statement-breakpoint
CREATE TYPE "public"."evidence_level" AS ENUM('policy', 'procedure', 'implementation', 'effectiveness');--> statement-breakpoint
CREATE TYPE "public"."evidence_linked_entity_type" AS ENUM('control_assessment', 'kpi_definition', 'audit', 'audit_finding', 'capa_action', 'disclosure');--> statement-breakpoint
CREATE TYPE "public"."file_access_action" AS ENUM('view', 'download');--> statement-breakpoint
CREATE TYPE "public"."file_validation_status" AS ENUM('pending', 'passed', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."finding_classification" AS ENUM('critical_nc', 'major_nc', 'minor_nc', 'observation', 'ofi');--> statement-breakpoint
CREATE TYPE "public"."finding_status" AS ENUM('open', 'action_assigned', 'verified', 'closed');--> statement-breakpoint
CREATE TYPE "public"."framework_code" AS ENUM('ISO45001', 'HOTEL_OPS', 'MU_LEGAL', 'GRI403', 'IFRS_S1', 'IFRS_S2', 'SASB_HOTELS', 'UNGC', 'ILO_OSH');--> statement-breakpoint
CREATE TYPE "public"."hierarchy_of_control" AS ENUM('elimination', 'substitution', 'engineering', 'administrative', 'ppe');--> statement-breakpoint
CREATE TYPE "public"."incident_status" AS ENUM('reported', 'investigating', 'corrective_action', 'verifying', 'closed');--> statement-breakpoint
CREATE TYPE "public"."investigation_status" AS ENUM('assigned', 'in_progress', 'pending_approval', 'approved', 'completed');--> statement-breakpoint
CREATE TYPE "public"."kpi_classification" AS ENUM('leading', 'lagging', 'assurance');--> statement-breakpoint
CREATE TYPE "public"."maturity_dimension" AS ENUM('policy', 'procedure', 'implementation', 'effectiveness');--> statement-breakpoint
CREATE TYPE "public"."person_type" AS ENUM('employee', 'contractor', 'guest', 'visitor', 'supplier', 'public', 'none', 'near_miss', 'unsafe_condition');--> statement-breakpoint
CREATE TYPE "public"."profile_status" AS ENUM('pending_approval', 'active', 'suspended', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."registration_status" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."storage_bucket" AS ENUM('incident-evidence', 'controlled-documents', 'audit-evidence', 'capa-evidence', 'restricted-medical');--> statement-breakpoint
CREATE TYPE "public"."verification_status" AS ENUM('unverified', 'verified', 'rejected');--> statement-breakpoint
CREATE TABLE "departments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "departments_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "properties" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"brand" text,
	"country" text DEFAULT 'Mauritius' NOT NULL,
	"timezone" text DEFAULT 'Indian/Mauritius' NOT NULL,
	"address" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "properties_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "property_departments" (
	"property_id" uuid NOT NULL,
	"department_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "property_departments_property_id_department_id_pk" PRIMARY KEY("property_id","department_id")
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"full_name" text NOT NULL,
	"phone" text,
	"job_title" text,
	"employment_type" text,
	"status" "profile_status" DEFAULT 'pending_approval' NOT NULL,
	"is_external" boolean DEFAULT false NOT NULL,
	"external_expiry_date" date,
	"approved_by" uuid,
	"approved_at" timestamp with time zone,
	"suspended_by" uuid,
	"suspended_at" timestamp with time zone,
	"suspension_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "registration_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"requested_role_id" uuid,
	"requested_property_id" uuid,
	"justification" text,
	"status" "registration_status" DEFAULT 'pending' NOT NULL,
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone,
	"rejection_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	CONSTRAINT "roles_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "user_department_access" (
	"user_id" uuid NOT NULL,
	"property_id" uuid NOT NULL,
	"department_id" uuid NOT NULL,
	"granted_by" uuid NOT NULL,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_department_access_user_id_property_id_department_id_pk" PRIMARY KEY("user_id","property_id","department_id")
);
--> statement-breakpoint
CREATE TABLE "user_medical_permission" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"granted_by" uuid NOT NULL,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reason" text NOT NULL,
	"revoked_by" uuid,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "user_property_access" (
	"user_id" uuid NOT NULL,
	"property_id" uuid NOT NULL,
	"granted_by" uuid NOT NULL,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_property_access_user_id_property_id_pk" PRIMARY KEY("user_id","property_id")
);
--> statement-breakpoint
CREATE TABLE "user_roles" (
	"user_id" uuid NOT NULL,
	"role_id" uuid NOT NULL,
	"granted_by" uuid NOT NULL,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_roles_user_id_role_id_pk" PRIMARY KEY("user_id","role_id")
);
--> statement-breakpoint
CREATE TABLE "file_access_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"file_id" uuid NOT NULL,
	"accessed_by" uuid NOT NULL,
	"accessed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"action" "file_access_action" NOT NULL,
	"signed_url_expires_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"bucket" "storage_bucket" NOT NULL,
	"storage_path" text NOT NULL,
	"original_filename" text NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" bigint NOT NULL,
	"checksum_sha256" text,
	"uploaded_by" uuid NOT NULL,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"validation_status" "file_validation_status" DEFAULT 'pending' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "document_approval_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_version_id" uuid NOT NULL,
	"actor_id" uuid NOT NULL,
	"action" "document_approval_action" NOT NULL,
	"comment" text,
	"acted_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "document_department_applicability" (
	"document_id" uuid NOT NULL,
	"department_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "document_property_applicability" (
	"document_id" uuid NOT NULL,
	"property_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "document_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid NOT NULL,
	"version_no" integer NOT NULL,
	"file_id" uuid NOT NULL,
	"effective_date" date,
	"review_date" date,
	"expiry_date" date,
	"approver_id" uuid,
	"approved_at" timestamp with time zone,
	"uploaded_by" uuid NOT NULL,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"status" "document_status" DEFAULT 'draft' NOT NULL,
	"change_summary" text
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_number" text NOT NULL,
	"title" text NOT NULL,
	"category" text NOT NULL,
	"owner_id" uuid NOT NULL,
	"current_version_id" uuid,
	"confidentiality_level" "confidentiality_level" DEFAULT 'internal' NOT NULL,
	"retention_period_months" integer,
	"status" "document_status" DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "documents_document_number_unique" UNIQUE("document_number")
);
--> statement-breakpoint
CREATE TABLE "evidence_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_version_id" uuid NOT NULL,
	"linked_entity_type" "evidence_linked_entity_type" NOT NULL,
	"linked_entity_id" uuid NOT NULL,
	"page_or_section" text,
	"purpose" text,
	"evidence_level" "evidence_level" NOT NULL,
	"property_id" uuid,
	"department_id" uuid,
	"reporting_period" text,
	"verification_status" "verification_status" DEFAULT 'unverified' NOT NULL,
	"verified_by" uuid,
	"verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "control_assessments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"control_id" uuid NOT NULL,
	"property_id" uuid NOT NULL,
	"department_id" uuid,
	"period_label" text NOT NULL,
	"dimension" "maturity_dimension" NOT NULL,
	"maturity_score" integer NOT NULL,
	"is_critical_gap" boolean DEFAULT false NOT NULL,
	"assessed_by" uuid NOT NULL,
	"assessed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "control_framework_mappings" (
	"control_id" uuid NOT NULL,
	"framework_id" uuid NOT NULL,
	"clause_reference" text,
	"weight" real DEFAULT 1 NOT NULL,
	CONSTRAINT "control_framework_mappings_control_id_framework_id_pk" PRIMARY KEY("control_id","framework_id")
);
--> statement-breakpoint
CREATE TABLE "controls" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"control_code" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"category" text,
	"is_life_safety_critical" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "controls_control_code_unique" UNIQUE("control_code")
);
--> statement-breakpoint
CREATE TABLE "frameworks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" "framework_code" NOT NULL,
	"name" text NOT NULL,
	"description" text,
	CONSTRAINT "frameworks_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "legal_requirement_details" (
	"control_id" uuid PRIMARY KEY NOT NULL,
	"citation" text NOT NULL,
	"regulator" text,
	"penalty_description" text,
	"renewal_frequency" text,
	"content_status" text DEFAULT 'starter_set_needs_legal_review' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "incident_attachments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"incident_id" uuid NOT NULL,
	"file_id" uuid NOT NULL,
	"is_photo" boolean DEFAULT false NOT NULL,
	"caption" text
);
--> statement-breakpoint
CREATE TABLE "incident_notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"incident_id" uuid NOT NULL,
	"notified_party" text NOT NULL,
	"method" text,
	"notified_at" timestamp with time zone DEFAULT now() NOT NULL,
	"notified_by" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "incident_persons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"incident_id" uuid NOT NULL,
	"person_type" "person_type" NOT NULL,
	"full_name" text,
	"employee_or_reference_no" text,
	"is_primary" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "incidents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"incident_number" text NOT NULL,
	"property_id" uuid NOT NULL,
	"department_id" uuid NOT NULL,
	"location_detail" text,
	"occurred_at" timestamp with time zone NOT NULL,
	"reported_by" uuid NOT NULL,
	"person_type" "person_type" NOT NULL,
	"incident_type" text NOT NULL,
	"injury_type" text,
	"body_part" text,
	"outcome" text NOT NULL,
	"actual_severity" integer NOT NULL,
	"potential_severity" integer NOT NULL,
	"is_high_potential" boolean DEFAULT false NOT NULL,
	"treatment" text,
	"hospital_referral" boolean DEFAULT false NOT NULL,
	"lost_workdays" integer DEFAULT 0 NOT NULL,
	"restricted_duty_days" integer DEFAULT 0 NOT NULL,
	"incident_cost" numeric(12, 2) DEFAULT '0' NOT NULL,
	"currency" text DEFAULT 'MUR' NOT NULL,
	"business_interruption_days" integer DEFAULT 0 NOT NULL,
	"immediate_actions" text,
	"status" "incident_status" DEFAULT 'reported' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "incidents_incident_number_unique" UNIQUE("incident_number")
);
--> statement-breakpoint
CREATE TABLE "investigation_approvals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"investigation_id" uuid NOT NULL,
	"approver_id" uuid NOT NULL,
	"decision" text NOT NULL,
	"comment" text,
	"decided_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "investigation_causes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"investigation_id" uuid NOT NULL,
	"cause_type" "cause_type" NOT NULL,
	"category" text,
	"description" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "investigation_five_whys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"investigation_id" uuid NOT NULL,
	"sequence" integer NOT NULL,
	"question" text NOT NULL,
	"answer" text
);
--> statement-breakpoint
CREATE TABLE "investigation_linked_procedures" (
	"investigation_id" uuid NOT NULL,
	"document_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "investigation_witnesses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"investigation_id" uuid NOT NULL,
	"name" text NOT NULL,
	"role" text,
	"statement" text,
	"contact" text
);
--> statement-breakpoint
CREATE TABLE "investigations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"incident_id" uuid NOT NULL,
	"investigator_id" uuid NOT NULL,
	"assigned_at" timestamp with time zone DEFAULT now() NOT NULL,
	"event_reconstruction" text,
	"status" "investigation_status" DEFAULT 'assigned' NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "investigations_incident_id_unique" UNIQUE("incident_id")
);
--> statement-breakpoint
CREATE TABLE "medical_attachments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"medical_record_id" uuid NOT NULL,
	"file_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "medical_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"incident_id" uuid NOT NULL,
	"person_reference" uuid,
	"clinical_notes" text,
	"treatment_details" text,
	"practitioner_name" text,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "capa_actions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"action_number" text NOT NULL,
	"source_type" "capa_source_type" NOT NULL,
	"source_id" uuid NOT NULL,
	"description" text NOT NULL,
	"root_cause" text,
	"corrective_action" text,
	"preventive_action" text,
	"hierarchy_of_control" "hierarchy_of_control",
	"owner_id" uuid NOT NULL,
	"property_id" uuid NOT NULL,
	"department_id" uuid,
	"priority" "capa_priority" DEFAULT 'medium' NOT NULL,
	"due_date" date NOT NULL,
	"cost" numeric(12, 2),
	"required_evidence" text,
	"status" "capa_status" DEFAULT 'open' NOT NULL,
	"verification_owner_id" uuid,
	"effectiveness_review_date" date,
	"final_approved_by" uuid,
	"final_approved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "capa_actions_action_number_unique" UNIQUE("action_number")
);
--> statement-breakpoint
CREATE TABLE "capa_verifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"capa_id" uuid NOT NULL,
	"verifier_id" uuid NOT NULL,
	"verified_at" timestamp with time zone DEFAULT now() NOT NULL,
	"outcome" "capa_verification_outcome" NOT NULL,
	"comment" text
);
--> statement-breakpoint
CREATE TABLE "audit_assessments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"checklist_item_id" uuid NOT NULL,
	"dimension" "maturity_dimension" NOT NULL,
	"maturity_score" integer NOT NULL,
	"evidence_reviewed" text,
	"assessor_id" uuid NOT NULL,
	"assessed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_checklist_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"audit_id" uuid NOT NULL,
	"control_id" uuid,
	"question" text NOT NULL,
	"criteria_reference" text
);
--> statement-breakpoint
CREATE TABLE "audit_departments" (
	"audit_id" uuid NOT NULL,
	"department_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_findings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"audit_id" uuid NOT NULL,
	"finding_number" text NOT NULL,
	"control_id" uuid,
	"classification" "finding_classification" NOT NULL,
	"description" text NOT NULL,
	"evidence" text,
	"raised_by" uuid NOT NULL,
	"raised_at" timestamp with time zone DEFAULT now() NOT NULL,
	"status" "finding_status" DEFAULT 'open' NOT NULL,
	CONSTRAINT "audit_findings_finding_number_unique" UNIQUE("finding_number")
);
--> statement-breakpoint
CREATE TABLE "audit_team_members" (
	"audit_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role_on_audit" text DEFAULT 'team_member' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"audit_reference" text NOT NULL,
	"type" "audit_type" NOT NULL,
	"scope" text,
	"criteria" text,
	"property_id" uuid NOT NULL,
	"lead_auditor_id" uuid NOT NULL,
	"planned_start" date,
	"planned_end" date,
	"actual_start" date,
	"actual_end" date,
	"status" "audit_status" DEFAULT 'planned' NOT NULL,
	"report_document_version_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "audits_audit_reference_unique" UNIQUE("audit_reference")
);
--> statement-breakpoint
CREATE TABLE "exposure_data" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"property_id" uuid NOT NULL,
	"period_start" date NOT NULL,
	"period_end" date NOT NULL,
	"total_hours_worked" numeric(14, 2),
	"occupied_room_nights" numeric(14, 2),
	"entered_by" uuid NOT NULL,
	"approved_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kpi_calculations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kpi_id" uuid NOT NULL,
	"property_id" uuid,
	"department_id" uuid,
	"period_start" date NOT NULL,
	"period_end" date NOT NULL,
	"comparison_period_start" date,
	"comparison_period_end" date,
	"current_value" numeric(14, 4),
	"comparison_value" numeric(14, 4),
	"variance_abs" numeric(14, 4),
	"variance_pct" numeric(8, 4),
	"data_through_date" date NOT NULL,
	"data_quality_status" "data_quality_status" DEFAULT 'ok' NOT NULL,
	"included_record_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"excluded_record_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"calculated_by" uuid,
	"calculated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kpi_definitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kpi_code" text NOT NULL,
	"name" text NOT NULL,
	"definition" text NOT NULL,
	"formula" text NOT NULL,
	"unit" text NOT NULL,
	"classification" "kpi_classification" NOT NULL,
	"reporting_boundary" text,
	"inclusion_rules" text,
	"exclusion_rules" text,
	"reporting_frequency" text DEFAULT 'monthly' NOT NULL,
	"data_owner_id" uuid,
	"approver_id" uuid,
	"source_tables" text[] DEFAULT '{}' NOT NULL,
	"target" numeric(14, 4),
	"warning_threshold" numeric(14, 4),
	"critical_threshold" numeric(14, 4),
	"evidence_requirements" text,
	"assurance_status" text DEFAULT 'unverified' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"effective_from" date NOT NULL,
	"effective_to" date,
	"direction" text DEFAULT 'lower_better' NOT NULL,
	CONSTRAINT "kpi_definitions_kpi_code_unique" UNIQUE("kpi_code")
);
--> statement-breakpoint
CREATE TABLE "kpi_framework_mappings" (
	"kpi_id" uuid NOT NULL,
	"framework_id" uuid NOT NULL,
	CONSTRAINT "kpi_framework_mappings_kpi_id_framework_id_pk" PRIMARY KEY("kpi_id","framework_id")
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_id" uuid,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"event_type" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid,
	"property_id" uuid,
	"department_id" uuid,
	"previous_value" jsonb,
	"new_value" jsonb,
	"reason" text,
	"request_id" text,
	"ip_address" text,
	"user_agent" text
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"body" text,
	"related_entity_type" text,
	"related_entity_id" uuid,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scheduled_reminders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"related_entity_type" text NOT NULL,
	"related_entity_id" uuid NOT NULL,
	"remind_at" timestamp with time zone NOT NULL,
	"reminder_type" text NOT NULL,
	"sent_at" timestamp with time zone,
	"channel" text DEFAULT 'in_app' NOT NULL
);
--> statement-breakpoint
ALTER TABLE "property_departments" ADD CONSTRAINT "property_departments_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "property_departments" ADD CONSTRAINT "property_departments_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registration_requests" ADD CONSTRAINT "registration_requests_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registration_requests" ADD CONSTRAINT "registration_requests_requested_role_id_roles_id_fk" FOREIGN KEY ("requested_role_id") REFERENCES "public"."roles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registration_requests" ADD CONSTRAINT "registration_requests_requested_property_id_properties_id_fk" FOREIGN KEY ("requested_property_id") REFERENCES "public"."properties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_department_access" ADD CONSTRAINT "user_department_access_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_department_access" ADD CONSTRAINT "user_department_access_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_department_access" ADD CONSTRAINT "user_department_access_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_medical_permission" ADD CONSTRAINT "user_medical_permission_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_property_access" ADD CONSTRAINT "user_property_access_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_property_access" ADD CONSTRAINT "user_property_access_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "file_access_log" ADD CONSTRAINT "file_access_log_file_id_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."files"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "file_access_log" ADD CONSTRAINT "file_access_log_accessed_by_profiles_id_fk" FOREIGN KEY ("accessed_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_uploaded_by_profiles_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_approval_history" ADD CONSTRAINT "document_approval_history_document_version_id_document_versions_id_fk" FOREIGN KEY ("document_version_id") REFERENCES "public"."document_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_approval_history" ADD CONSTRAINT "document_approval_history_actor_id_profiles_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_department_applicability" ADD CONSTRAINT "document_department_applicability_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_department_applicability" ADD CONSTRAINT "document_department_applicability_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_property_applicability" ADD CONSTRAINT "document_property_applicability_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_property_applicability" ADD CONSTRAINT "document_property_applicability_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_versions" ADD CONSTRAINT "document_versions_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_versions" ADD CONSTRAINT "document_versions_file_id_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."files"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_versions" ADD CONSTRAINT "document_versions_approver_id_profiles_id_fk" FOREIGN KEY ("approver_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_versions" ADD CONSTRAINT "document_versions_uploaded_by_profiles_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_owner_id_profiles_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence_links" ADD CONSTRAINT "evidence_links_document_version_id_document_versions_id_fk" FOREIGN KEY ("document_version_id") REFERENCES "public"."document_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence_links" ADD CONSTRAINT "evidence_links_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence_links" ADD CONSTRAINT "evidence_links_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence_links" ADD CONSTRAINT "evidence_links_verified_by_profiles_id_fk" FOREIGN KEY ("verified_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "control_assessments" ADD CONSTRAINT "control_assessments_control_id_controls_id_fk" FOREIGN KEY ("control_id") REFERENCES "public"."controls"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "control_assessments" ADD CONSTRAINT "control_assessments_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "control_assessments" ADD CONSTRAINT "control_assessments_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "control_assessments" ADD CONSTRAINT "control_assessments_assessed_by_profiles_id_fk" FOREIGN KEY ("assessed_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "control_framework_mappings" ADD CONSTRAINT "control_framework_mappings_control_id_controls_id_fk" FOREIGN KEY ("control_id") REFERENCES "public"."controls"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "control_framework_mappings" ADD CONSTRAINT "control_framework_mappings_framework_id_frameworks_id_fk" FOREIGN KEY ("framework_id") REFERENCES "public"."frameworks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "legal_requirement_details" ADD CONSTRAINT "legal_requirement_details_control_id_controls_id_fk" FOREIGN KEY ("control_id") REFERENCES "public"."controls"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incident_attachments" ADD CONSTRAINT "incident_attachments_incident_id_incidents_id_fk" FOREIGN KEY ("incident_id") REFERENCES "public"."incidents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incident_attachments" ADD CONSTRAINT "incident_attachments_file_id_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."files"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incident_notifications" ADD CONSTRAINT "incident_notifications_incident_id_incidents_id_fk" FOREIGN KEY ("incident_id") REFERENCES "public"."incidents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incident_notifications" ADD CONSTRAINT "incident_notifications_notified_by_profiles_id_fk" FOREIGN KEY ("notified_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incident_persons" ADD CONSTRAINT "incident_persons_incident_id_incidents_id_fk" FOREIGN KEY ("incident_id") REFERENCES "public"."incidents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_reported_by_profiles_id_fk" FOREIGN KEY ("reported_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "investigation_approvals" ADD CONSTRAINT "investigation_approvals_investigation_id_investigations_id_fk" FOREIGN KEY ("investigation_id") REFERENCES "public"."investigations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "investigation_approvals" ADD CONSTRAINT "investigation_approvals_approver_id_profiles_id_fk" FOREIGN KEY ("approver_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "investigation_causes" ADD CONSTRAINT "investigation_causes_investigation_id_investigations_id_fk" FOREIGN KEY ("investigation_id") REFERENCES "public"."investigations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "investigation_five_whys" ADD CONSTRAINT "investigation_five_whys_investigation_id_investigations_id_fk" FOREIGN KEY ("investigation_id") REFERENCES "public"."investigations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "investigation_linked_procedures" ADD CONSTRAINT "investigation_linked_procedures_investigation_id_investigations_id_fk" FOREIGN KEY ("investigation_id") REFERENCES "public"."investigations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "investigation_linked_procedures" ADD CONSTRAINT "investigation_linked_procedures_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "investigation_witnesses" ADD CONSTRAINT "investigation_witnesses_investigation_id_investigations_id_fk" FOREIGN KEY ("investigation_id") REFERENCES "public"."investigations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "investigations" ADD CONSTRAINT "investigations_incident_id_incidents_id_fk" FOREIGN KEY ("incident_id") REFERENCES "public"."incidents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "investigations" ADD CONSTRAINT "investigations_investigator_id_profiles_id_fk" FOREIGN KEY ("investigator_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "medical_attachments" ADD CONSTRAINT "medical_attachments_medical_record_id_medical_records_id_fk" FOREIGN KEY ("medical_record_id") REFERENCES "public"."medical_records"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "medical_attachments" ADD CONSTRAINT "medical_attachments_file_id_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."files"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "medical_records" ADD CONSTRAINT "medical_records_incident_id_incidents_id_fk" FOREIGN KEY ("incident_id") REFERENCES "public"."incidents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "medical_records" ADD CONSTRAINT "medical_records_person_reference_incident_persons_id_fk" FOREIGN KEY ("person_reference") REFERENCES "public"."incident_persons"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "medical_records" ADD CONSTRAINT "medical_records_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "capa_actions" ADD CONSTRAINT "capa_actions_owner_id_profiles_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "capa_actions" ADD CONSTRAINT "capa_actions_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "capa_actions" ADD CONSTRAINT "capa_actions_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "capa_actions" ADD CONSTRAINT "capa_actions_verification_owner_id_profiles_id_fk" FOREIGN KEY ("verification_owner_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "capa_actions" ADD CONSTRAINT "capa_actions_final_approved_by_profiles_id_fk" FOREIGN KEY ("final_approved_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "capa_verifications" ADD CONSTRAINT "capa_verifications_capa_id_capa_actions_id_fk" FOREIGN KEY ("capa_id") REFERENCES "public"."capa_actions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "capa_verifications" ADD CONSTRAINT "capa_verifications_verifier_id_profiles_id_fk" FOREIGN KEY ("verifier_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_assessments" ADD CONSTRAINT "audit_assessments_checklist_item_id_audit_checklist_items_id_fk" FOREIGN KEY ("checklist_item_id") REFERENCES "public"."audit_checklist_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_assessments" ADD CONSTRAINT "audit_assessments_assessor_id_profiles_id_fk" FOREIGN KEY ("assessor_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_checklist_items" ADD CONSTRAINT "audit_checklist_items_audit_id_audits_id_fk" FOREIGN KEY ("audit_id") REFERENCES "public"."audits"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_checklist_items" ADD CONSTRAINT "audit_checklist_items_control_id_controls_id_fk" FOREIGN KEY ("control_id") REFERENCES "public"."controls"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_departments" ADD CONSTRAINT "audit_departments_audit_id_audits_id_fk" FOREIGN KEY ("audit_id") REFERENCES "public"."audits"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_departments" ADD CONSTRAINT "audit_departments_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_findings" ADD CONSTRAINT "audit_findings_audit_id_audits_id_fk" FOREIGN KEY ("audit_id") REFERENCES "public"."audits"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_findings" ADD CONSTRAINT "audit_findings_control_id_controls_id_fk" FOREIGN KEY ("control_id") REFERENCES "public"."controls"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_findings" ADD CONSTRAINT "audit_findings_raised_by_profiles_id_fk" FOREIGN KEY ("raised_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_team_members" ADD CONSTRAINT "audit_team_members_audit_id_audits_id_fk" FOREIGN KEY ("audit_id") REFERENCES "public"."audits"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_team_members" ADD CONSTRAINT "audit_team_members_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audits" ADD CONSTRAINT "audits_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audits" ADD CONSTRAINT "audits_lead_auditor_id_profiles_id_fk" FOREIGN KEY ("lead_auditor_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audits" ADD CONSTRAINT "audits_report_document_version_id_document_versions_id_fk" FOREIGN KEY ("report_document_version_id") REFERENCES "public"."document_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exposure_data" ADD CONSTRAINT "exposure_data_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exposure_data" ADD CONSTRAINT "exposure_data_entered_by_profiles_id_fk" FOREIGN KEY ("entered_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exposure_data" ADD CONSTRAINT "exposure_data_approved_by_profiles_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kpi_calculations" ADD CONSTRAINT "kpi_calculations_kpi_id_kpi_definitions_id_fk" FOREIGN KEY ("kpi_id") REFERENCES "public"."kpi_definitions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kpi_calculations" ADD CONSTRAINT "kpi_calculations_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kpi_calculations" ADD CONSTRAINT "kpi_calculations_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kpi_definitions" ADD CONSTRAINT "kpi_definitions_data_owner_id_profiles_id_fk" FOREIGN KEY ("data_owner_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kpi_definitions" ADD CONSTRAINT "kpi_definitions_approver_id_profiles_id_fk" FOREIGN KEY ("approver_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kpi_framework_mappings" ADD CONSTRAINT "kpi_framework_mappings_kpi_id_kpi_definitions_id_fk" FOREIGN KEY ("kpi_id") REFERENCES "public"."kpi_definitions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kpi_framework_mappings" ADD CONSTRAINT "kpi_framework_mappings_framework_id_frameworks_id_fk" FOREIGN KEY ("framework_id") REFERENCES "public"."frameworks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;
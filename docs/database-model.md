# Database Model — Supabase PostgreSQL

This is the authoritative entity model. The Drizzle schema in `apps/web/src/db/schema/*.ts` and the
SQL migrations in `apps/web/drizzle/*.sql` are the executable form of this document; if they ever
diverge, fix the drift immediately rather than letting either drift silently — the migration is the
source of truth for what's actually deployed, this doc is the source of truth for *intent*.

Conventions used throughout:
- All primary keys: `uuid default gen_random_uuid()`.
- All tables: `created_at timestamptz not null default now()`; mutable tables also get
  `updated_at timestamptz not null default now()` maintained by a trigger.
- All FKs to `properties`/`departments` use `restrict` on delete (properties/departments are never
  hard-deleted, only deactivated) to protect audit/reporting integrity.
- Money fields: `numeric(12,2)` with an explicit `currency` column (default `MUR`).
- Enums are implemented as Postgres `enum` types (not free text) so they're constrained at the DB
  layer, not just in the application.
- Every table that is the target of RLS has `property_id` (and `department_id` where meaningful)
  denormalized onto it directly, even when derivable via a join, specifically so RLS policies can
  be simple, fast, index-friendly predicates instead of correlated subqueries through several
  joins. This is a deliberate normalization trade-off — see `docs/security-model.md` §RLS design.

## 1. Reference & organisation

| Table | Purpose | Key columns |
|---|---|---|
| `properties` | Hotels/properties | `code` (unique), `name`, `brand`, `country`, `timezone`, `is_active` |
| `departments` | Global department catalogue (Housekeeping, F&B, Engineering, Front Office, Security, Spa, Grounds, HR, Finance, Sales, Executive, …) | `code` (unique), `name`, `is_active` |
| `property_departments` | Which departments exist at which property | `property_id`, `department_id` — composite PK |

## 2. Identity & access

| Table | Purpose | Key columns |
|---|---|---|
| `profiles` | 1:1 extension of `auth.users`, PK = `auth.users.id` | `full_name`, `phone`, `job_title`, `employment_type`, `status` enum(`pending_approval`,`active`,`suspended`,`rejected`), `is_external` bool, `external_expiry_date` (required if `is_external`), `approved_by`, `approved_at` |
| `roles` | Static catalogue of the 10 roles | `code` (unique, e.g. `SUPER_ADMIN`), `name`, `description` |
| `user_roles` | User ↔ role, many-to-many (a user may hold >1 role, e.g. Department Manager + Incident Reporter) | `user_id`, `role_id`, `granted_by`, `granted_at` |
| `user_property_access` | Which properties a user can see | `user_id`, `property_id`, `granted_by`, `granted_at` |
| `user_department_access` | Which department *within a property* a user can see (department access is always property-scoped, since the same department code exists at many properties) | `user_id`, `property_id`, `department_id`, `granted_by`, `granted_at` |
| `user_medical_permission` | Separate, explicit grant — never implied by any role including Super Admin | `user_id`, `granted_by`, `granted_at`, `revoked_by`, `revoked_at` |
| `registration_requests` | Self-registration intake, one row per signup | `user_id`, `requested_role_id`, `requested_property_id`, `justification`, `status` enum(`pending`,`approved`,`rejected`), `reviewed_by`, `reviewed_at`, `rejection_reason` |

Session lifecycle (login/logout/refresh/revocation) is owned by Supabase Auth (`auth.users`,
`auth.sessions`, `auth.refresh_tokens`); SafeGuard never re-implements session storage. Admin
"revoke session" calls the Supabase Admin API (`auth.admin.signOut` / refresh-token invalidation)
from a server-only context and writes an `audit_log` row.

## 3. Incident management

| Table | Purpose | Key columns |
|---|---|---|
| `incidents` | Core incident record | `incident_number` (unique, generated `INC-{property_code}-{year}-{seq}`), `property_id`, `department_id`, `location_detail`, `occurred_at`, `reported_by`, `person_type` enum(`employee`,`contractor`,`guest`,`visitor`,`supplier`,`public`,`none`,`near_miss`,`unsafe_condition`), `incident_type`, `injury_type`, `body_part`, `outcome`, `actual_severity`, `potential_severity` (both on a shared 1–5 severity scale, see `framework-model.md`), `is_high_potential` bool, `treatment`, `hospital_referral` bool, `lost_workdays` int, `restricted_duty_days` int, `incident_cost` numeric, `currency`, `business_interruption_days` int, `immediate_actions` text, `status` enum(`reported`,`investigating`,`corrective_action`,`verifying`,`closed`) |
| `incident_persons` | Person(s) affected detail (an incident can affect more than one person) | `incident_id`, `person_type`, `full_name` (nullable for guest/public anonymity), `employee_or_reference_no`, `is_primary` |
| `incident_notifications` | Who was notified, how, when (regulator, insurer, GM, family, etc.) | `incident_id`, `notified_party`, `method`, `notified_at`, `notified_by` |
| `incident_attachments` | Photos/docs attached directly to the incident record | `incident_id`, `file_id → files`, `is_photo` bool, `caption` |
| `investigations` | One per incident (unique `incident_id`) | `investigator_id`, `assigned_at`, `event_reconstruction`, `status`, `completed_at` |
| `investigation_causes` | Immediate + root causes | `investigation_id`, `cause_type` enum(`immediate`,`root`), `category`, `description` |
| `investigation_five_whys` | Structured 5-Whys | `investigation_id`, `sequence` (1–5), `question`, `answer` |
| `investigation_witnesses` | Witness statements | `investigation_id`, `name`, `role`, `statement`, `contact` |
| `investigation_linked_procedures` | Investigation ↔ controlled document | `investigation_id`, `document_id` |
| `investigation_approvals` | Approval history for the investigation itself | `investigation_id`, `approver_id`, `decision`, `comment`, `decided_at` |

### 3.1 Restricted medical records (separate storage domain)

| Table | Purpose | Key columns |
|---|---|---|
| `medical_records` | Clinical detail, isolated from `incidents` | `incident_id`, `person_reference` (FK `incident_persons.id`), `clinical_notes`, `treatment_details`, `practitioner_name`, `created_by`, `created_at` |
| `medical_attachments` | Files in the `restricted-medical` bucket only | `medical_record_id`, `file_id → files` |

`medical_records`/`medical_attachments` are **never** joined into any incident list, dashboard, or
export query used by non-medical roles — enforced by RLS *and* by the query layer never selecting
across that boundary (see `docs/security-model.md` §Medical data isolation).

## 4. Corrective & Preventive Actions (CAPA) — one shared table for all sources

| Table | Purpose | Key columns |
|---|---|---|
| `capa_actions` | Shared action record | `action_number` (unique, `CAPA-{year}-{seq}`), `source_type` enum(`incident`,`audit_finding`,`legal_gap`,`inspection`,`management_review`), `source_id` (uuid, polymorphic — see note), `description`, `root_cause`, `corrective_action`, `preventive_action`, `hierarchy_of_control` enum(`elimination`,`substitution`,`engineering`,`administrative`,`ppe`), `owner_id`, `property_id`, `department_id`, `priority` enum(`low`,`medium`,`high`,`critical`), `due_date`, `cost`, `required_evidence`, `status` enum(`open`,`in_progress`,`pending_verification`,`verified`,`closed`,`overdue`), `verification_owner_id`, `effectiveness_review_date`, `final_approved_by`, `final_approved_at` |
| `capa_verifications` | Verification events (separate from the owner) | `capa_id`, `verifier_id`, `verified_at`, `outcome` enum(`effective`,`not_effective`), `comment` |

`source_id` is polymorphic by design (Postgres has no native polymorphic FK); referential integrity
for it is enforced in the application/server-action layer plus a `CHECK`-backed
`source_type`/lookup-table pattern, not a DB foreign key. This is the one deliberate exception to
"always use a real FK" in this schema, and it is documented here so it isn't mistaken for an
oversight.

**Constraint:** `CHECK (verification_owner_id IS NULL OR verification_owner_id <> owner_id)` and the
`closed` status transition additionally requires `final_approved_by <> owner_id` (enforced in the
server action, since it also requires checking the *role* of the approver, which a `CHECK` can't do).

## 5. H&S Framework — master control library

| Table | Purpose | Key columns |
|---|---|---|
| `frameworks` | Seeded catalogue: ISO45001, HOTEL_OPS, MU_LEGAL, GRI403, IFRS_S1, IFRS_S2, SASB_HOTELS, UNGC, ILO_OSH | `code` (unique), `name`, `description` |
| `controls` | **One master control**, never duplicated per framework | `control_code` (unique), `title`, `description`, `category`, `is_life_safety_critical` bool |
| `control_framework_mappings` | Many-to-many: one control maps to N frameworks | `control_id`, `framework_id`, `clause_reference`, `weight` |
| `legal_requirement_details` | Extra fields only relevant when a control maps to `MU_LEGAL` | `control_id` (unique), `citation`, `regulator`, `penalty_description`, `renewal_frequency` |
| `control_assessments` | Assessment of one control, on one dimension, for one property/department/period | `control_id`, `property_id`, `department_id` (nullable — some controls are property-wide), `period_label` (e.g. `FY2026-Q2`), `dimension` enum(`policy`,`procedure`,`implementation`,`effectiveness`), `maturity_score` int 0–4, `is_critical_gap` bool, `assessed_by`, `assessed_at`, `notes` |

Unique constraint on `control_assessments (control_id, property_id, department_id, period_label, dimension)`
so re-assessment in the same period updates rather than duplicates a row (still versioned via
`updated_at` + an `audit_log` entry, not a new row — the "current state" table stays small).

## 6. Audit & assurance

| Table | Purpose | Key columns |
|---|---|---|
| `audits` | Programme + execution record | `audit_reference` (unique), `type` enum(`self_assessment`,`department_inspection`,`internal_audit`,`legal_compliance_audit`,`iso45001_readiness`,`external_assurance`), `scope`, `criteria`, `property_id`, `lead_auditor_id`, `planned_start`, `planned_end`, `actual_start`, `actual_end`, `status` enum(`planned`,`in_progress`,`reporting`,`closed`), `report_document_version_id` (nullable FK → `document_versions`) |
| `audit_departments` | Departments in scope | `audit_id`, `department_id` |
| `audit_team_members` | Audit team incl. lead | `audit_id`, `user_id`, `role_on_audit` |
| `audit_checklist_items` | Checklist, optionally tied to a control | `audit_id`, `control_id` (nullable), `question`, `criteria_reference` |
| `audit_assessments` | Per-checklist-item assessment | `checklist_item_id`, `dimension`, `maturity_score`, `evidence_reviewed`, `assessor_id`, `assessed_at` |
| `audit_findings` | Findings | `audit_id`, `finding_number` (unique), `control_id` (nullable), `classification` enum(`critical_nc`,`major_nc`,`minor_nc`,`observation`,`ofi`), `description`, `evidence`, `raised_by`, `raised_at`, `status` enum(`open`,`action_assigned`,`verified`,`closed`) |

Every `audit_findings` row can be the `source_id` for one or more `capa_actions`
(`source_type = 'audit_finding'`).

## 7. Central document & evidence library

| Table | Purpose | Key columns |
|---|---|---|
| `documents` | Document-level identity (title, ownership) — stable across versions | `document_number` (unique), `title`, `category`, `owner_id`, `current_version_id` (nullable FK → `document_versions`, set only once a version is Approved), `confidentiality_level` enum(`public`,`internal`,`confidential`,`restricted`), `retention_period_months`, `status` enum(`draft`,`under_review`,`approved`,`expired`,`superseded`,`archived`) |
| `document_versions` | **Immutable once approved.** Updating an approved doc inserts a new row, never edits an approved one | `document_id`, `version_no` (int, sequential per document), `file_id → files`, `effective_date`, `review_date`, `expiry_date`, `approver_id`, `approved_at`, `uploaded_by`, `uploaded_at`, `status`, `change_summary` |
| `document_property_applicability` | Which properties this document applies to | `document_id`, `property_id` |
| `document_department_applicability` | Which departments this document applies to | `document_id`, `department_id` |
| `document_approval_history` | Full approval trail per version | `document_version_id`, `actor_id`, `action` enum(`submitted`,`approved`,`rejected`,`superseded`), `comment`, `acted_at` |
| `evidence_links` | **The reuse mechanism.** One document version can be linked to many entities | `document_version_id`, `linked_entity_type` enum(`control_assessment`,`kpi_definition`,`audit`,`audit_finding`,`capa_action`,`disclosure`), `linked_entity_id`, `page_or_section`, `purpose`, `evidence_level` enum(`policy`,`procedure`,`implementation`,`effectiveness`), `property_id`, `department_id`, `reporting_period`, `verification_status` enum(`unverified`,`verified`,`rejected`), `verified_by`, `verified_at` |

`linked_entity_id`/`linked_entity_type` is the same deliberate polymorphic-FK exception as
`capa_actions.source_id`, for the same reason (evidence must attach to six unrelated entity types
without six near-identical join tables).

## 8. File registry (Storage metadata — not the files themselves)

| Table | Purpose | Key columns |
|---|---|---|
| `files` | One row per uploaded object, mirrors a Supabase Storage object | `bucket` enum(`incident-evidence`,`controlled-documents`,`audit-evidence`,`capa-evidence`,`restricted-medical`), `storage_path`, `original_filename`, `mime_type`, `size_bytes`, `checksum_sha256`, `uploaded_by`, `uploaded_at`, `validation_status` enum(`pending`,`passed`,`rejected`) |
| `file_access_log` | Every signed-URL issuance/download, for the audit trail | `file_id`, `accessed_by`, `accessed_at`, `action` enum(`view`,`download`), `signed_url_expires_at` |

## 9. KPI catalogue & calculation cache

| Table | Purpose | Key columns |
|---|---|---|
| `kpi_definitions` | Controlled register, versioned | `kpi_code` (unique), `name`, `definition`, `formula`, `unit`, `classification` enum(`leading`,`lagging`,`assurance`), `reporting_boundary`, `inclusion_rules`, `exclusion_rules`, `reporting_frequency`, `data_owner_id`, `approver_id`, `source_tables` (text[]), `target`, `warning_threshold`, `critical_threshold`, `evidence_requirements`, `assurance_status`, `version` int, `effective_from`, `effective_to` (nullable) |
| `kpi_framework_mappings` | KPI ↔ framework | `kpi_id`, `framework_id` |
| `kpi_calculations` | Cached/reconcilable calculation snapshots (recomputed on demand, cached for dashboard performance and for point-in-time reconciliation — see `docs/kpi-catalogue.md` §Calculation design) | `kpi_id`, `property_id` (nullable = group rollup), `department_id` (nullable), `period_start`, `period_end`, `comparison_period_start`, `comparison_period_end`, `current_value`, `comparison_value`, `variance_abs`, `variance_pct`, `data_through_date`, `data_quality_status`, `included_record_ids` (jsonb array), `excluded_record_ids` (jsonb array), `calculated_by`, `calculated_at` |

## 10. Audit trail (append-only)

| Table | Purpose | Key columns |
|---|---|---|
| `audit_log` | Append-only, `INSERT`-only grants, no `UPDATE`/`DELETE` grants to any application role | `actor_id` (nullable = system), `occurred_at`, `event_type`, `entity_type`, `entity_id`, `property_id`, `department_id`, `previous_value` (jsonb), `new_value` (jsonb), `reason`, `request_id`, `ip_address`, `user_agent` |

`audit_log` has no `updated_at`/soft-delete columns at all, and the migration explicitly `REVOKE`s
`UPDATE, DELETE` from every non-superuser role, including the application's own Postgres role — see
`docs/security-model.md` §Audit trail integrity.

## 11. Notifications & reminders

| Table | Purpose | Key columns |
|---|---|---|
| `notifications` | In-app notifications | `user_id`, `type`, `title`, `body`, `related_entity_type`, `related_entity_id`, `read_at` |
| `scheduled_reminders` | Due-date/review-date reminders, processed by a scheduled job | `related_entity_type`, `related_entity_id`, `remind_at`, `reminder_type`, `sent_at`, `channel` |

## 12. Indexing strategy (v1)

- Every `property_id`/`department_id` column: btree index (RLS predicates and dashboard filters hit these constantly).
- `incidents (property_id, status, occurred_at desc)` composite — the incident list/dashboard hot path.
- `audit_log (entity_type, entity_id, occurred_at desc)` and `audit_log (actor_id, occurred_at desc)`.
- `evidence_links (linked_entity_type, linked_entity_id)`.
- `kpi_calculations (kpi_id, property_id, period_start, period_end)` unique-ish lookup index.
- Full-text (`tsvector`) index on `incidents.location_detail || immediate_actions` deferred to
  Phase 2+ if search becomes a real requirement — not built speculatively in v1.

## 13. What is deliberately *not* modelled yet

- Multi-currency conversion (single `currency` column stored, FX conversion is a reporting-layer
  concern if/when needed — not a v1 requirement).
- i18n content tables (English only; schema doesn't block adding `_translations` tables later).
- Guest-facing external submission (no `guest_users` table yet — out of scope per PRD §2).

These are recorded as deferred, not forgotten, so a future contributor doesn't infer a schema gap
that's actually a deliberate scope boundary.

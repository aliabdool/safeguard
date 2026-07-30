# Data Store schema — source of truth

Zoho Catalyst's Data Store tables/columns are normally defined through the Catalyst Console UI
or the `catalyst-config.json` schema-push tooling — there is no `CREATE TABLE` SQL file to hand
Zoho the way `drizzle/*.sql` was handed to Supabase's SQL Editor. These JSON files are this
project's own source of truth for the schema, written in a column/type/scope shape that maps
directly onto what you'll enter in the Console (or push via the Catalyst CLI once the project is
initialised — `catalyst init` first, since table IDs are assigned per-project and can't be
predicted from here).

Every table matches the entity list in the migration brief §6, ported from the Supabase schema in
`apps/web/src/db/schema/*.ts`. Column names are `snake_case` to match Catalyst convention.

## Row-scoping columns (read this before adding a new table)

Catalyst's Data Store has no per-row security equivalent to Postgres RLS (see the architecture
assessment) — table **scope** is Global/Org/User and permissions are per-role, not per-row.
**Every table that should be property-scoped carries a `property_id` column, and every Function
that reads or writes it MUST apply the scope filter itself** via
`functions/shared/middleware/property-scope.ts`. There is no database-level backstop here the way
`FORCE ROW LEVEL SECURITY` was in the Supabase build — this is the single most important thing to
get right and keep right as the system grows. See `docs/critical-gap-and-row-scoping.md` (Phase 3
deliverable) for the enforcement pattern once it lands.

## Files in this directory

- `01-identity-and-access.json` — Users, Roles, Permissions, UserRoles, UserPermissions,
  UserPropertyAccess, UserDepartmentAccess, AuditTrail, RegistrationRequests
- `02-master-data.json` — Properties, Departments, IncidentTypes, InjuryMechanisms,
  RootCauseCategories, Frameworks, FrameworkRequirements, Controls, ControlFrameworkMappings,
  LegalRequirementDetails (added during the Supabase-to-Catalyst migration — missing from the
  original Phase 8 port), KPIDefinitions (version, evidence_requirements and assurance_status
  added during the Supabase-to-Catalyst migration, Phase C KPI/dashboard module — missing from
  the original port, rendered on the KPI detail page)
- `03-incidents.json` — Incidents, IncidentPersons, IncidentWitnesses, IncidentInvestigation,
  IncidentFiveWhys, IncidentRootCauses, InvestigationApprovals, IncidentAttachments,
  IncidentNotifications, IncidentOSHReportability, MedicalNotes (the three approvals/attachments/
  notifications tables, and MedicalNotes' treatment_details/practitioner_name columns, were added
  during the Supabase-to-Catalyst migration — missing from the original Phase 5 port)
- `04-capa.json` — CAPA, CAPAProgressNotes, CAPAVerification (owner_id/verifier_id must always
  differ — enforced in `functions/shared/pure/capa-workflow.ts`; CAPA.capa_priority (named
  capa_priority, not priority — Catalyst rejects "priority" as a reserved column-name keyword),
  root_cause,
  corrective_action, preventive_action, hierarchy_of_control, cost, required_evidence,
  effectiveness_review_date, final_approved_by and final_approved_at were added during the
  Supabase-to-Catalyst migration — missing from the original Phase 6 port)
- `05-documents.json` — Documents, DocumentPropertyApplicability, DocumentDepartmentApplicability,
  DocumentVersions, DocumentApprovals, DocumentEvidenceLinks (many-to-many — one approved document
  can support many controls across many frameworks; the applicability tables and several
  Documents/DocumentVersions/DocumentEvidenceLinks columns were added during the Phase C documents
  module migration — present in apps/web's Postgres schema but missing from the original Phase 7
  port)
- `06-controls-frameworks.json` — ControlAssessments (department_id, period_label, and
  is_critical_gap were added during the Supabase-to-Catalyst migration — missing from the original
  Phase 8 port), CriticalGaps, FrameworkReadinessSnapshots (Controls/Frameworks/
  FrameworkRequirements/ControlFrameworkMappings master data already lives in
  `02-master-data.json`)
- `07-audits.json` — Audits, AuditFindings, AuditFindingCAPALinks, AuditTeamMembers,
  AuditChecklistItems, AuditAssessments (the latter three, plus several Audits/AuditFindings date
  and reference-number columns, were added during the Supabase-to-Catalyst migration — missing
  from the original Phase 9 port)
- `08-kpi.json` — ExposureData (hours worked / occupied room nights feeding rate-based KPIs),
  KPISnapshots (the 22 live-calculated KPIs — see `functions/shared/services/kpi-service.ts` and,
  for the apps/web port, `apps/web/src/server/kpi/calculate.ts`; kpi_code corrected from a
  `KPIDefinitions` lookup to plain text, and period_start/period_end/comparison_period_start/
  comparison_period_end/variance_abs/variance_pct/data_through_date/excluded_record_ids/
  calculated_by added, during the Supabase-to-Catalyst migration — missing from the original port)
- `09-materiality-climate.json` — MaterialTopics, MaterialityConsultations, ClimateRisks — full
  parity with `apps/web`'s materiality.ts/climate-risk.ts (expanded from the original Phase 11
  minimal scope during the Supabase-to-Catalyst migration, with ClimateRisks completed to actual
  full parity in the apps/web Phase C reports/materiality/climate-risk slice); scoring logic stays
  in the pure functions already ported in `functions/shared/pure/materiality-scoring.ts` and
  `climate-risk.ts`
- `10-data-quality.json` — DataQualityExceptions (the nine named rules — see
  `functions/shared/pure/data-quality-rules.ts`)
- `11-reports.json` — ReportExports (every export — board narrative, assurance pack, or a raw
  data dump — writes one row here, permission-controlled and audit-logged)
- `12-notifications.json` — Notifications (the fourteen named triggers — see
  `functions/shared/pure/notification-rules.ts`; scaffolded per management's instruction, real
  and tested rule logic, outbound email/SMS delivery deferred to when a provider is configured)
  and ScheduledReminders (added in the apps/web Phase C reports/cron slice — feeds the
  `/api/cron/reminders` job)
- `13-files.json` — Files, FileAccessLog — file governance metadata (checksum, validation status,
  view/download audit trail) for everything stored in Catalyst File Store, replacing the tracking
  Supabase Storage + `files`/`file_access_log` provided

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
  UserPropertyAccess, UserDepartmentAccess, AuditTrail
- `02-master-data.json` — Properties, Departments, IncidentTypes, InjuryMechanisms,
  RootCauseCategories, Frameworks, Controls, KPIDefinitions
- `03-incidents.json` — Incidents, IncidentPersons, IncidentWitnesses, IncidentInvestigation,
  IncidentFiveWhys, IncidentRootCauses, IncidentOSHReportability, MedicalNotes
- `04-capa.json` — CAPA, CAPAProgressNotes, CAPAVerification (owner_id/verifier_id must always
  differ — enforced in `functions/shared/pure/capa-workflow.ts`)
- `05-documents.json` — Documents, DocumentVersions, DocumentApprovals, DocumentEvidenceLinks,
  DocumentExpiryChecks
- `06-controls-frameworks.json` — ControlMaturityScores, ControlEvidenceLinks, CriticalGaps,
  FrameworkReadinessScores, FrameworkReadinessSnapshots
- `07-audits.json` — Audits, AuditFindings, AuditFindingCAPALinks, AuditFindingEvidenceLinks
- `08-kpi.json` — KPISnapshots, KPICalculationLogs, KPIRecordLinks
- `09-materiality-climate.json` — MaterialTopics, GRIImpactMaterialityScores,
  IFRSFinancialMaterialityScores, ClimateRisks, ClimateRiskControls, ClimateAdaptationActions
- `10-reports-quality-notifications.json` — Reports, ReportExports, BoardNarratives,
  AssuranceReadinessPacks, DataQualityExceptions, Notifications, NotificationPreferences,
  ScheduledReminderLogs

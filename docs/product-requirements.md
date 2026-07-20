# Sunlife SafeGuard — Product Requirements

Status: Phase 0 baseline · Owner: Group H&S / Product · Last updated: 2026-07-18

## 1. Purpose

Sunlife SafeGuard is a multi-property Health & Safety management-assurance system replacing the
static prototype `SafeGuard_HS_Management_Assurance_Prototype.html`. It is a real, database-backed,
multi-tenant-within-org application covering incident management, corrective/preventive action,
audits, an ISO 45001-centred control framework, a legal-compliance register, a controlled document
and evidence library, a KPI catalogue, live dashboards, user administration, and a full audit trail.

> **Note on the source prototype:** the HTML prototype was not available in the repository at the
> start of this build (empty repo, no commits). See `reference/README.md` and ADR-0001 in
> `docs/implementation-plan.md`. This document and all others in `docs/` are derived directly from
> the written functional specification, which is treated as authoritative.

## 2. Scope

In scope (v1):

1. Incident reporting and investigation
2. Corrective and Preventive Actions (CAPA) — shared across incidents, audits, legal gaps, inspections, management review
3. Health & Safety audits (programme + execution + findings)
4. ISO 45001 control assessments, on a master control library shared by multiple frameworks
5. Mauritius legal-compliance assessments
6. Central document and evidence library with versioning and reuse
7. H&S KPI catalogue and calculation engine
8. Management and Board dashboards (live data, FY/YTD comparisons)
9. User administration (invitation, approval, roles, property/department scoping, medical permission, suspension, session revocation)
10. Append-only audit trail

Out of scope (v1, revisit later): payroll/HR integration, guest-facing incident submission portal,
native mobile app (responsive web only), multi-language i18n (English only for v1, schema will not
block adding it), automated regulatory e-filing.

## 3. Primary users

Ten roles (full matrix in `docs/roles-permissions.md`): Super Administrator, Group H&S Administrator,
Property H&S Officer, Internal Auditor, Department Manager, Duty Manager, Nurse/Medical User, Incident
Reporter, Executive Read-Only User, External Auditor Read-Only User.

## 4. Functional requirements by module

### 4.1 Identity & access
- Invitation-based and self-registration signup via Supabase Auth (email/password + email verification).
- New accounts start `PENDING_APPROVAL` and can reach only an "awaiting approval" screen — no
  protected data, confirmed both client-side and server-side (RLS + server checks).
- Administrator console: approve/reject registrations, invite users, assign role(s), assign
  properties, assign departments, grant/revoke medical-data permission, suspend/reactivate,
  revoke sessions, view user activity (from the audit trail).
- Forgot password / reset password / logout / secure, revocable sessions.

### 4.2 Incident management
- Workflow: **Report → Investigate → Corrective Action → Verify → Close**, with an explicit status
  field driving what actions are available to whom.
- Person-affected types: Employee, Contractor, Guest, Visitor, Supplier, Member of the Public,
  No Person Affected, Near Miss, Unsafe Condition.
- Full field set per incident, investigation, and evidence as enumerated in the specification
  (see `docs/database-model.md` §3 for the authoritative field list — this document does not
  duplicate it to avoid drift).
- Medical details are captured in a separate, access-restricted record, never joined into the
  ordinary incident record returned to non-medical roles.

### 4.3 CAPA
- One shared action model for incident actions, audit findings, legal-compliance gaps,
  inspection findings, and management-review actions.
- Action owner ≠ verifier, enforced at the application layer and by a DB constraint/check where
  practical (owner_user_id <> verified_by_user_id when both set).

### 4.4 H&S Framework & KPI Catalogue
- One master control library. Controls map to 1..N frameworks (ISO 45001, Hotel Operational
  Controls, Mauritius Legal, GRI 403, IFRS S1, IFRS S2, SASB Hotels & Lodging, UN Global Compact,
  ILO-OSH). No duplicate controls per framework.
- Each control assessed separately on 4 dimensions (Policy, Procedure, Implementation,
  Effectiveness) on the 0–4 maturity scale, per property (and department where applicable) and
  reporting period.
- A critical legal/life-safety gap on any control overrides an otherwise-high average score for
  the rollup it belongs to (see `docs/framework-model.md` §5 for the override algorithm).

### 4.5 Audit & assurance
- Audit programme (annual plan) + individual audit execution records covering property
  self-assessments, department inspections, internal audits, legal-compliance audits, ISO 45001
  readiness audits, and external assurance reviews.
- Finding classifications: Critical nonconformity, Major nonconformity, Minor nonconformity,
  Observation, Opportunity for improvement. Every finding can spawn one or more CAPA actions.

### 4.6 Central document & evidence library
- "Upload once, approve once, use many times." One document/version can be linked as evidence to
  many controls, KPIs, audits, findings, CAPA actions, and disclosures.
- Full lifecycle: Draft → Under review → Approved → Expired/Superseded/Archived. Updating an
  approved document creates a **new version**; the previous version is retained and stays linked
  to whatever audit/assessment referenced it at the time (immutability of historical evidence).
- Each evidence *link* (not just the document) records purpose, evidence level (Policy /
  Procedure / Implementation / Effectiveness), property, department, reporting period,
  verification status/owner/date. A policy document alone cannot mark a control as fully
  compliant — full compliance requires Effectiveness-level evidence (enforced in the maturity
  calculation, see `docs/framework-model.md`).

### 4.7 KPI catalogue & dashboards
- Controlled KPI register with the full metadata set (definition, formula, unit, classification,
  boundary, inclusion/exclusion rules, frequency, owner, approver, source tables, framework
  mapping, targets/thresholds, evidence requirements, assurance status, version, effective
  period) — see `docs/kpi-catalogue.md` for the full v1 KPI list (43 KPIs from the spec).
- All dashboard figures are computed from live database records — never hard-coded.
- Filters: financial year, comparison year, same-period YTD, property, department, person type,
  incident type, injury type, severity, outcome, framework, audit type, finding severity, CAPA
  status, date range.
- Every KPI tile: current value, comparison value, difference, % change, target, RAG status,
  data-through date, data-quality status, assurance status, and a **"View calculation"** drill-down
  (definition, formula, included/excluded records, source tables, calculation date, variance,
  data-quality checks, evidence, data owner, approval status).
- Incomplete years are never compared to a complete year without an explicit warning banner;
  same-period YTD comparison is used automatically when the current year is incomplete.

### 4.8 Audit trail
- Append-only log of every material event listed in the specification (auth events, registration/
  approval, role/property/department changes, CRUD on records, status changes, approvals/
  rejections, medical-record access, document upload/download, evidence verification, KPI
  calculations, score changes, finding closure/reopening, data exports). No passwords, secrets,
  or medical notes ever stored in the log.

## 5. Non-functional requirements

- **Security & privacy:** Mauritius Data Protection Act + GDPR-aware handling of international
  guest data; data minimisation; property/department scoping; medical data isolation. Full detail
  in `docs/security-model.md`.
- **Availability:** Cloudflare Workers edge hosting; Supabase managed Postgres with point-in-time
  recovery (production tier).
- **Auditability:** every material state change traceable to an actor, timestamp, and reason
  where required.
- **Data integrity:** normalized schema, foreign keys, check constraints, append-only audit log,
  versioned documents, versioned KPI definitions.
- **Accessibility:** shadcn/ui + Tailwind, WCAG 2.1 AA target for management-facing screens.

## 6. Success criteria (ties to the user's "do not call it complete unless…" list)

The application is not described as feature-complete until: registration/invitation,
admin approval + role assignment, login/logout, persistence in Supabase (not arrays/localStorage),
document/photo upload to private Storage, property/department restriction enforcement, medical
data isolation, full incident workflow, audits + findings, CAPA verify/close with owner≠verifier,
evidence reuse across controls/KPIs, live dashboard calculation, KPI-to-source reconciliation,
audit log coverage, passing critical automated tests, and a clean-repository deploy path. Current
status against this list is tracked in `docs/implementation-plan.md` §"Definition of done tracker"
and is updated at the end of every phase.

## 7. Environments

Local development, Development, Client Demonstration, Production — see
`docs/system-architecture.md` §7 and the Cloudflare deployment plan for details. Demonstration
environment displays the mandated banner: *"Demonstration environment — do not enter real
personal, medical or confidential information."* No paid resources are created without explicit
approval (tracked as an open decision in `docs/implementation-plan.md`).

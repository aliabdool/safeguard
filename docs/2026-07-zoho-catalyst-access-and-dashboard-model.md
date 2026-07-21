# SafeGuard on Zoho Catalyst — access-layer & dashboard-layer architecture

Written per management's instruction to confirm and document the full user-access and
dashboard-layer model before Phase 14 (the web client) is built, and to ensure Phase 6 onward
stores the data those dashboards need. This is the reference for every future screen, endpoint,
and schema decision — if a new feature can't be placed on the tables below, that's a sign the
access or dashboard model needs to be extended here first, not worked around ad hoc in a Function.

This document does not introduce a new access model. It confirms the one already implemented in
`functions/shared/pure/permissions.ts` and `functions/shared/middleware/require-permission.ts`,
extends it with the two role codes genuinely missing against management's 9-role list, and maps
the 8 named dashboards onto concrete batch endpoints.

## 1. Access logic — confirmed

**Role + property scope + department scope + explicit permission.** All four layers apply on
every request; none substitutes for another. This is implemented, not proposed:

- **Role** (`AuthContext.roleCodes`) — coarse capability gate (`hasAnyRole`, `requireRole`,
  `isAdmin`).
- **Property scope** (`AuthContext.propertyIds`) — `hasPropertyAccess`, `assertPropertyAccess`,
  `propertyScopeClause`. Every LIST query filters through `propertyScopeClause(ctx)`; every
  single-record read/write asserts `assertPropertyAccess(ctx, record.propertyId)` once the
  record's property is known. `SUPER_ADMIN`, `GROUP_HS_ADMIN`, and `EXECUTIVE_READONLY` bypass
  this (group-wide by definition); every other role needs an explicit `UserPropertyAccess` grant.
- **Department scope** (`AuthContext.departmentAccess: Map<propertyId, Set<departmentId>>`) —
  `hasDepartmentAccess`. Only meaningful for department-scoped records; a `null` departmentId
  (a property-wide record) is accessible once property access holds. Admins bypass; every other
  role needs an explicit `UserDepartmentAccess` grant per property.
- **Explicit permission** (`AuthContext.medicalPermissions` + `UserPermissions` table) — never
  implied by role, checked independently of the other three layers. `hasMedicalPermission()`
  deliberately never calls `isAdmin()` — this is the one place in the codebase where being an
  admin buys nothing.

Because Catalyst Data Store has no Postgres-RLS equivalent (§"Honest technical assessment" in
`docs/2026-07-zoho-catalyst-migration-plan.md`), all four layers are enforced **in every Function
that touches a scoped table**, not once at a database boundary. There is no safety net under this
discipline — it is re-verified per PR, not assumed.

## 2. The 9 access layers, confirmed against implementation

| # | Management's named layer | `RoleCode` | Property scope | Department scope | Medical notes | Board narrative / assurance pack |
|---|---|---|---|---|---|---|
| 1 | Super Admin | `SUPER_ADMIN` | All (admin bypass) | All (admin bypass) | **No**, unless explicitly granted `view/edit/export_medical_notes` | Not automatic; may be granted `generate_board_narrative` / `export_assurance_pack` |
| 2 | Group H&S Admin / Manager | `GROUP_HS_ADMIN` | All (admin bypass) | All (admin bypass) | **No**, unless explicitly granted | May be granted `generate_board_narrative` / `export_assurance_pack` — **not automatic**, per management's own wording ("only if explicitly permitted") |
| 3 | Hotel GM / Hotel Manager | `HOTEL_GENERAL_MANAGER` *(new)* | Assigned propert(y/ies) only | Read-only across own hotel's departments | **No**, unless explicitly granted | No |
| 4 | Hotel H&S Officer / Manager | `PROPERTY_HS_OFFICER` | Assigned propert(y/ies) only | Read/write across own hotel's departments | **No**, unless explicitly granted | No |
| 5 | Department Manager | `DEPARTMENT_MANAGER` | Assigned propert(y/ies) only | Assigned department(s) only | **No**, unless explicitly granted | No |
| 6 | Nurse / Medical User | `NURSE_MEDICAL` | Assigned propert(y/ies) only for non-medical context | N/A | **Only** via explicit `view/edit/export_medical_notes` — role alone grants nothing | No |
| 7 | Auditor / Assurance Reviewer | `INTERNAL_AUDITOR` / `EXTERNAL_AUDITOR_READONLY` | All (assurance role — see note) or assigned scope for external | Read-only, all | **No**, unless explicitly granted | May be granted `export_assurance_pack` — **not automatic** |
| 8 | Board / Executive Viewer | `EXECUTIVE_READONLY` | All (read-only bypass) | Read-only, all | **No** — never granted in practice; Board Mode has no medical-note surface at all | Views narrative, does not generate it |
| 9 | Standard Viewer | `STANDARD_VIEWER` *(new)* | Assigned propert(y/ies) only | Assigned department(s) only, read-only | **No**, unless explicitly granted | No |

**Additional operational roles, kept, not part of the 9 but not removed:**

- `DUTY_MANAGER` — property-scoped, daily-operations role that predates this brief (shift-level
  incident/CAPA visibility at one hotel). Functionally a narrower sibling of Hotel H&S Officer.
- `INCIDENT_REPORTER` — front-line staff who can *report* an incident but not investigate one or
  see the wider dashboard. No dashboard of its own; used by the incident-intake screen only.

Both are documented here so a future reader doesn't mistake their absence from the 9-role brief
for an instruction to delete them — they cover real operational cases the 9-role list wasn't
trying to describe.

**Auditor property scope note:** `INTERNAL_AUDITOR` currently reads group-wide (an internal
audit programme spans all hotels); `EXTERNAL_AUDITOR_READONLY` is property-scoped to whichever
propert(y/ies) the external engagement covers. Both are read-only over controls/evidence/findings
and neither can edit CAPA or incidents.

### Confirmed medical-note rule (unchanged, re-verified here)

No role — not Super Admin, not Group H&S Admin, not the Hotel GM whose hotel the incident happened
at — sees a medical note without an explicit, individually-granted `view_medical_notes` /
`edit_medical_notes` / `export_medical_notes` `UserPermissions` row. `hasMedicalPermission()`
enforces this by construction (it does not accept an `AuthContext` shortcut the way
`hasPropertyAccess`/`hasDepartmentAccess` do for admins). Every attempt — granted or denied — is
audit-logged by `requireMedicalPermission()` (`functions/shared/middleware/require-permission.ts`),
already shipped in Phase 5 and covered by the medical-note-isolation test suite in
`functions/shared/services/incident-service.test.ts`.

### Permission codes catalogue (confirmed / extended)

Stored in the `Permissions` table (`data-store-schema/01-identity-and-access.json`), granted via
`UserPermissions`, never implied by role:

- `view_medical_notes`, `edit_medical_notes`, `export_medical_notes` — shipped, Phase 5.
- `generate_board_narrative` — gates the board-narrative generator (`pure/board-narrative.ts`);
  grantable to Group H&S Admin or Super Admin, not automatic.
- `export_assurance_pack` — gates the assurance-pack export (`pure/assurance-pack.ts`); grantable
  to Group H&S Admin, Super Admin, or Auditor, not automatic.
- `approve_documents_groupwide`, `view_all_properties` — existing catalogue entries, unchanged.

All are marked `is_sensitive: true` in the schema, meaning every grant, revoke, and use writes an
`AuditTrail` row — this already matches how `requireExplicitPermission()` behaves today.

## 3. Dashboard architecture — 8 dashboards, mapped to batch endpoints

Management named 5 batch endpoints explicitly (`group-summary`, `hotel-summary`,
`hso-workbench`, `board-summary`, `auditor-summary`) but described 8 dashboard types. Three
dashboards — Super Admin, Department Manager, Nurse/Medical — had no named endpoint. Resolution:
extend the same naming convention rather than leave them undocumented or force them onto an
unrelated endpoint. Every dashboard gets exactly one batch endpoint; no dashboard calls per-KPI
endpoints.

| Dashboard | Endpoint | Primary role(s) | Status |
|---|---|---|---|
| Super Admin Dashboard | `GET /dashboard/admin-summary` | `SUPER_ADMIN` | **New, proposed here** — Phase 9+ (needs audit-trail, export-log, and data-quality-exception aggregates that don't exist until those phases ship) |
| Group H&S / Management Dashboard | `GET /dashboard/group-summary` | `GROUP_HS_ADMIN`, `SUPER_ADMIN` | Named by management. Superset of the existing `GET /dashboard/summary` (Phase 4) — see migration note below |
| Hotel GM / Hotel Manager Dashboard | `GET /dashboard/hotel-summary` | `HOTEL_GENERAL_MANAGER` | Named by management. Same underlying data as `group-summary` narrowed to one property — implemented as `propertyId`-required variant, not a separate data path |
| H&S Officer Dashboard | `GET /dashboard/hso-workbench` | `PROPERTY_HS_OFFICER`, `DUTY_MANAGER` | Named by management. Work-queue shape, not KPI-tile shape — see §5 |
| Department Manager Dashboard | `GET /dashboard/department-summary` | `DEPARTMENT_MANAGER` | **New, proposed here** — ships with Phase 6 (CAPA), since it's mostly a department-filtered CAPA/incident view |
| Nurse / Medical Dashboard | `GET /dashboard/medical-summary` | `NURSE_MEDICAL` | **New, proposed here** — gated by `requireMedicalPermission("view")` at the route level in addition to normal auth, so a denied request never reaches the query layer; every call audit-logged like every other medical route |
| Auditor / Assurance Reviewer Dashboard | `GET /dashboard/auditor-summary` | `INTERNAL_AUDITOR`, `EXTERNAL_AUDITOR_READONLY` | Named by management. Ships with Phase 8/10 (controls/frameworks, assurance evidence map) |
| Board / Executive Dashboard | `GET /dashboard/board-summary` | `EXECUTIVE_READONLY` | Named by management. Read-only, no operational data, no medical surface at all |

**Migration note on `group-summary`:** the Phase 4 endpoint `GET /dashboard/summary` already
implements most of what `group-summary` needs (safety status, CAPA status, critical gaps, audit
status, KPI overview, assurance readiness, board alerts) with `propertyScopeClause`-based
row filtering. Rather than build a parallel endpoint, Phase 9 renames/extends it in place to
`GET /dashboard/group-summary` and adds the framework-readiness strip (§4), property/department
heatmap, and action-owner/due-date fields (§5) it doesn't have yet. `hotel-summary` becomes that
same handler with `propertyId` made mandatory instead of optional and the property/department
heatmap replaced with a single-property department breakdown.

## 4. Framework readiness strip

Every dashboard except the H&S Officer workbench (which is action-queue shaped, not
readiness-shaped) carries a framework readiness strip as its third visual row (§5). Seven items,
each independently labeled per management's explicit rule — **reporting frameworks are never
called "certification compliance"**:

| Framework | Label used in the UI | What it actually measures |
|---|---|---|
| ISO 45001 | "Certification readiness" | The only one of the seven that *is* certification-shaped — control maturity against ISO 45001 clauses, using the existing critical-gap-override rollup (MIN of policy/procedure/implementation/effectiveness, capped at 1 by any critical gap) |
| GRI 403 | "Disclosure readiness" | Whether the data needed for each GRI 403 disclosure exists and is evidenced — not a certification, a reporting-completeness measure |
| Mauritius OSH Act | "Legal readiness" | Statutory-control compliance against the Mauritius Occupational Safety and Health Act — a legal-obligation measure, not a voluntary-standard one |
| IFRS S1 | "Financial materiality readiness" | Whether H&S risk has been assessed for financial materiality, governed, and evidenced per IFRS S1 — governance/risk-evidence readiness, not incident-count reporting |
| IFRS S2 | "Climate-related H&S risk readiness" | **Climate-related H&S risks only** (heat stress, extreme-weather exposure, wildfire smoke, etc. — see `pure/climate-risk.ts`) — ordinary incidents never feed this gauge, by construction: the climate-risk register is a structurally separate table (`ClimateRisks`, Phase 1d heritage) from `Incidents` |
| SASB Hotels & Lodging | "Indirect alignment" | Explicitly **not** scored as direct compliance — SASB's hospitality-sector indicators are referenced for context only, never given a readiness percentage the way ISO/GRI are |
| UNGC / ILO-OSH | "Alignment" | Same treatment as SASB — a qualitative alignment statement, not a scored readiness gauge |

Each gauge on the strip is a single precomputed value read from a `FrameworkReadinessSnapshots`
table (mirroring the `KPISnapshots` pattern — no live cross-table joins on every dashboard load),
refreshed the same way KPI snapshots are (Cron, Phase 13, or on-demand drill-down).

## 5. Dashboard visual structure (confirmed convention, all 8 dashboards)

Six rows, top to bottom, consistent across every dashboard so a user moving between their own
dashboard and a drill-down never has to relearn the layout:

1. **Critical alerts** — fatalities, statutory-reportable pending determination, critical legal
   gaps newly opened. Same shape as the existing `buildBoardAlertPanel()` in
   `api-dashboard-summary/index.ts`, generalised to every dashboard rather than board-only.
2. **KPI cards** — `KpiTileResult` tiles (current value, comparison value, target, RAG status,
   variance) scoped to what that role/dashboard is allowed to see.
3. **Framework readiness gauges** — the seven-item strip from §4 (omitted on H&S Officer
   workbench).
4. **Property or department heatmap** — property-level for group/board/admin dashboards,
   department-level for hotel/department-manager dashboards, omitted where scope is already a
   single property+department (H&S Officer, Nurse/Medical).
5. **Actions requiring attention** — every row here carries, at minimum: RAG status, a drill-down
   link, the record count the view was calculated from, an action owner, a due date, and a
   data-quality warning where the underlying record is flagged. This is the row Phase 6 (CAPA)
   feeds directly — "CAPA awaiting owner update," "CAPA awaiting verification," "overdue CAPA" all
   live here.
6. **Data-quality and assurance blockers** — open `DataQualityExceptions`, evidence gaps, expired
   documents — anything that would make an auditor or the board distrust a number shown in rows
   2–4 above.

Every card/row that references a KPI or framework item also carries **framework linkage** (which
requirement/disclosure it maps to) — this is why `KPIDefinitions` and `FrameworkRequirements`
already carry cross-reference columns (`data-store-schema/02-master-data.json`) rather than being
free-standing.

## 6. What Phase 6 (CAPA) must store to power this — cross-checked before implementation

Reading §3's action-row requirements and §5 row 5 back into the CAPA schema before writing it:

- `owner_id` and `verifier_id` — **must differ**, enforced in the pure business-rule layer before
  any Data Store write, per management's explicit instruction. This is Phase 6's first rule, not
  an afterthought.
- `department_id` (nullable — not every CAPA is department-scoped) — required for the Department
  Manager Dashboard's "assigned CAPA" and "assigned department incidents" rows.
- `due_date` and `status` (`open` / `in_progress` / `pending_verification` / `verified` /
  `closed`) — required for "CAPA awaiting owner update," "CAPA awaiting verification," and
  "overdue CAPA" across the Group, Hotel, H&S Officer, and Department Manager dashboards; already
  assumed by the existing `getCapaStatus()` query in `api-dashboard-summary/index.ts`.
- `property_id` — required for property scoping (§1) on every CAPA row, no exceptions.
- A link back to the originating incident or control gap — required for drill-down (§5) and for
  framework linkage (§5) when the CAPA closes out a control gap that itself maps to an ISO 45001 /
  GRI 403 requirement.
- Verification record (verifier, verified-at, verification evidence reference) as a distinct sub-
  record from the CAPA row itself — mirrors the incident/investigation split already established
  in Phase 5 (`IncidentInvestigation` as its own table rather than columns bolted onto
  `Incidents`), and is what lets "CAPA awaiting verification" be queried without conflating it with
  "CAPA awaiting owner update."

This section is the handoff from this document into Phase 6; the CAPA schema and service layer
built next implement exactly this list.

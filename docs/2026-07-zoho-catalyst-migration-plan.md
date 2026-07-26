# SafeGuard → Zoho Catalyst: architecture assessment & migration plan

Management decided to pause the Supabase/Vercel deployment and replicate — and strengthen —
SafeGuard on Zoho Catalyst. This document is the architecture assessment and phased plan behind
`apps/catalyst/`.

## Honest technical assessment — read before committing further effort

Two real Zoho Catalyst constraints change how this system has to be built; they don't block the
migration, but ignoring them would.

**1. Data Store has no per-row security equivalent to Postgres RLS.** Catalyst's Data Store
offers table-level *scopes* (Global / Org / User) and per-role *permissions* (Select / Update /
Insert / Delete) — nothing like "this user may only see rows where `property_id` = their assigned
property." [(Catalyst Docs)](https://docs.catalyst.zoho.com/en/cloud-scale/help/data-store/scopes-and-permissions/)
In the Supabase build, `FORCE ROW LEVEL SECURITY` policies were a database-level backstop:
even a bug in application code couldn't leak one hotel's incidents to another hotel's manager.
Catalyst has no equivalent. **Every Function that reads or writes a property-scoped table must
apply the scope filter itself**, via `functions/shared/middleware/require-permission.ts`'s
`propertyScopeClause()` / `assertPropertyAccess()`. This is the single most important discipline
to hold as the codebase grows — there is no safety net underneath it.

**2. Data Store joins are limited.** Relational joins require an explicit foreign-key/lookup
column between tables, and Zoho's own docs note a low cap on joins per query.
[(Catalyst Docs)](https://docs.catalyst.zoho.com/en/cloud-scale/help/data-store/tables/) The KPI
engine and the Assurance Evidence Map both conceptually chain several tables (control → framework
requirement → assessment → evidence). The mitigation is precomputed rollups and snapshot tables
rather than deep joins at read time — `KPISnapshots`, `FrameworkReadinessSnapshots` — which is
already the pattern the KPI engine wants for performance reasons anyway (brief §12).

**The genuine head start:** roughly a third of this system's actual business-rule complexity
already exists as pure, platform-agnostic TypeScript with zero database or framework dependency —
RAG classification, GRI/IFRS materiality scoring, the critical-gap override algorithm,
climate-hazard validation, evidence-reuse computation, permission decisions, board-narrative
generation, the assurance-pack builder. These moved to `apps/catalyst/functions/shared/pure/`
**unchanged** — verified via their original test suites (74 tests, all passing) rather than
rewritten and hoped-correct.

**Function execution limits:** 30 seconds for Basic/Advanced I/O functions (normal API calls), 15
minutes for Event/Cron functions.
[(Catalyst Docs)](https://docs.catalyst.zoho.com/en/serverless/help/functions/introduction/)
Comfortable for the batch dashboard endpoint provided it reads snapshots rather than recalculating
22 KPIs live — which is what `api-dashboard-summary` does.

Sources: [Data Store](https://docs.catalyst.zoho.com/en/cloud-scale/help/data-store/introduction/) ·
[Scopes and Permissions](https://docs.catalyst.zoho.com/en/cloud-scale/help/data-store/scopes-and-permissions/) ·
[Data Store table](https://docs.catalyst.zoho.com/en/cloud-scale/help/data-store/tables/) ·
[Functions](https://docs.catalyst.zoho.com/en/serverless/help/functions/introduction/) ·
[Authentication](https://docs.catalyst.zoho.com/en/cloud-scale/help/authentication/introduction/) ·
["Catalyst DB is insufficient for many use cases" (community)](https://help.zoho.com/portal/id/community/topic/catalyst-db-is-insufficient-for-many-use-cases)

## Architecture

Catalyst Functions (Node.js, Advanced I/O, Express) for all business logic → Catalyst Data Store
for persistence → Catalyst File Store for evidence documents → Catalyst Authentication (Embedded,
custom role assignment) → Catalyst Cron for reminders → Catalyst-hosted web client.

Folder structure, permission model, and full data model are documented in `apps/catalyst/README.md`
and `apps/catalyst/data-store-schema/README.md`.

## Phased implementation plan (tracked as tasks #17–#31 in this session)

1. Architecture assessment (this document) — done.
2. Project scaffold: pure-logic port + Data Store schema (identity/access, master data) — done.
3. Permission + audit middleware — done.
4. Batch dashboard summary endpoint — done.
5. Incidents + medical-note isolation — done. Three independent medical permissions
   (view/edit/export, never implied by role — not even Super Admin or a Property H&S Officer),
   every access audit-logged whether granted or denied, hospital referral and statutory
   OSH-reportability kept as fully separate records. Verified with 20 new tests (99 total)
   including the exact scenarios management asked for by name.
5.5. Access-layer + dashboard-layer architecture confirmed and documented — see
   `docs/2026-07-zoho-catalyst-access-and-dashboard-model.md`. `RoleCode` extended with
   `HOTEL_GENERAL_MANAGER` and `STANDARD_VIEWER` to close the two real gaps against management's
   9-role list (102 tests now passing). All 8 named dashboards mapped to batch endpoints — 5 named
   by management (`group-summary`, `hotel-summary`, `hso-workbench`, `board-summary`,
   `auditor-summary`) plus 3 proposed to complete the set (`admin-summary`,
   `department-summary`, `medical-summary`), each documented with which phase ships it.
6. CAPA module — done. Owner and verifier must always be different people, enforced in the pure
   `isValidOwnerVerifierPair()` check before any write at creation, and re-checked defensively at
   the moment of verification; only the CAPA's designated verifier (never the owner, never a
   bystander with mere property access) may verify. Verification is its own record
   (`CAPAVerification`), separate from `CAPA.status`, mirroring the `IncidentInvestigation` split
   from Phase 5 — this is what lets "CAPA awaiting verification" be queried independently of "CAPA
   awaiting owner update" on the dashboards documented in
   `docs/2026-07-zoho-catalyst-access-and-dashboard-model.md` §6. 15 new tests (128 total).
7. Documents/evidence library + evidence-reuse — done. Approval workflow (draft → pending_approval
   → approved/rejected → superseded), expiry/review dates, and the many-to-many
   `DocumentEvidenceLinks` table that powers "Supports N records across M frameworks". Expired
   evidence is evaluated live against the current date on every use (`isValidEvidence()`) — never
   cached as a stale boolean.
8. Controls/frameworks + critical-gap override persistence — done. `ControlAssessments` +
   `CriticalGaps` (open/resolve lifecycle, mirroring CAPA/incident) + `FrameworkReadinessSnapshots`,
   all built on the already-ported `pure/maturity.ts` rollup — an expired fire certificate scoring
   a life-safety-critical control at ≤1 opens a critical gap and caps the framework readiness
   rollup at 1 regardless of how well other controls score, proven in tests by name.
9. KPI engine (22 KPIs) — done. Ports the Supabase build's exact 22-KPI REGISTRY (verified: the
   original `calculate.ts` registry has exactly 22 entries). Every KPI not in that set returns
   "not yet calculable", never a fabricated zero; a genuinely-zero count is still shown as 0.
   Framework-readiness KPIs read the Phase 8 snapshot rather than recomputing live.
10. Assurance Evidence Map — done. Framework → Requirement → Control → Evidence → KPI/Finding/CAPA,
    filterable by framework, property, department, evidence status, critical gap, expired
    evidence, and report relevance — the core differentiator screen, pure-filtered so the query
    layer stays dumb and the logic stays tested.
11. Data Quality Exceptions — done. All nine named checks, each a pure rule; scanning
    opens/resolves exceptions against what's currently detected rather than leaving stale rows.
12. Board Mode + reports/exports + audit logging — done. Board narrative and the assurance
    readiness pack (labelled "management self-assessment", never "external assurance") both read
    live KPI data only; six additional raw exports (KPI/incident/CAPA/audit/evidence-map/
    framework-readiness), all eight permission-controlled and audit-logged with the exporting user,
    filters, and timestamp recorded.
13. Notifications + scheduled jobs — scaffolded per management's instruction. All fourteen named
    triggers are real, pure, tested rule functions; an on-demand scan endpoint is live for the
    five due-date/expiry-driven triggers. Outbound delivery and live Cron scheduling are
    post-deployment configuration in your own Zoho org, not fabricated here.
14. Frontend — done. 21 screens (login, all 8 role-specific dashboards, incident/CAPA registers
    and detail pages, documents, controls, KPI centre, evidence map, data quality, reports, three
    admin screens), React + TypeScript + Vite, built to a static bundle for Catalyst Web Client
    Hosting. Role-aware navigation reads `GET /me` (new `api-auth` function) and shows only the
    dashboards/sections a user's roles grant. Medical sections gate on the explicit
    `medicalPermissions` array, never on role. A "not connected" demo/offline mode renders the
    full UI shell with empty states — never fabricated figures — when no backend is configured
    yet, verified in a real browser (screenshots taken via Playwright against the Vite dev server).
15. Testing + deployment handoff — done. See
    `docs/2026-07-zoho-catalyst-final-package-instructions.md` for the full 20-case checklist
    (12 automated in the test suite, verifiable live for full confidence; 8 need a live deployment
    with seeded data) and the final two-package Direct Upload deliverable.

Final totals: 202 backend tests passing, `tsc --noEmit` clean on both `apps/catalyst/` and
`apps/catalyst/client/`, 11 deployable Functions, a working web client verified in-browser.

Each phase ships as its own reviewable increment, verified (typecheck + tests, same discipline as
the Supabase build) before moving to the next — not as one unreviewable drop.

## What only you can do

Deploying to your actual Zoho org needs your interactive login — I can't run `catalyst login` for
you, the same way I couldn't run migrations against your Supabase project directly. See
`apps/catalyst/README.md` "Setup" for the exact command sequence.

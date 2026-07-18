# Implementation Plan

## 1. Phase breakdown

- **Phase 0** — this document set. Architecture, data model, security model, roles, framework
  model, KPI catalogue, route map. No application code.
- **Phase 1** — App foundation: Next.js App Router + TS strict + Tailwind + shadcn/ui scaffold,
  full Drizzle schema for every table in `database-model.md`, initial migration, RLS policy
  migration, Supabase Auth wiring (server/browser clients, middleware, session handling), auth
  pages (register/login/logout/forgot-verify-reset), registration → pending-approval flow, admin
  console skeleton (approve/reject, role/property/department assignment, suspend/reactivate,
  session revocation), audit-log writer utility, seed script (roles, frameworks, properties/
  departments fixture, demo controls).
- **Phase 2** — Incident management: full incident CRUD + workflow state machine, investigation
  (five-whys, causes, witnesses, approvals), restricted medical records module (separate route
  group + storage bucket + RLS), CAPA module (shared across all sources), photo/document upload to
  `incident-evidence`/`capa-evidence` buckets.
- **Phase 3** — Audit & framework: master control library seed, framework mappings, control
  assessment UI + critical-gap-override calculation, audit programme + execution + checklist +
  findings, central document/evidence library with versioning, evidence-link reuse UI.
- **Phase 4** — KPI engine: all 38+ KPI calculation functions, `kpi_calculations` caching, dashboard
  grid with filters, "View calculation" drill-down, FY/YTD comparison logic, Board/Executive
  dashboard, permission-controlled export.
- **Phase 5** — Hardening: CSP/CSRF/rate-limiting wiring, retention/backup docs, full RLS
  integration test suite, Playwright golden-path suite, Wrangler multi-environment config,
  GitHub Actions CI, final documentation (setup guides, environment checklist, first-super-admin
  bootstrap procedure).

## 2. Architecture Decision Records

**ADR-0001 — Proceed without the source HTML prototype.**
Context: repository was empty (no commits/branches) at task start; the prototype file referenced
in the brief does not exist in `aliabdool/safeguard`. Decision: build from the written functional
specification, which fully enumerates fields/workflows/roles/KPIs and is more precise for backend
design than a visual mock would be; defer prototype alignment to the presentation layer only (see
`system-architecture.md` §3). Consequence: visual design in this build is original (shadcn/ui
defaults + Tailwind), not a reproduction of the prototype's look — expect a design pass once the
prototype is supplied. Status: accepted, non-blocking.

**ADR-0002 — Control maturity aggregation = minimum of the four dimensions, not average.**
Context: spec states "a policy alone must not produce full compliance" but doesn't give the exact
aggregation formula. Decision: overall control maturity = `min(policy, procedure, implementation,
effectiveness)` scores. Rationale: an average lets a strong Policy score mask a weak Effectiveness
score, which is exactly the failure mode the spec calls out; minimum is the strictest, most
defensible reading. Status: accepted; revisit if a specific framework's official methodology
requires a different rollup (record as a per-framework override, not a schema change).

**ADR-0003 — Polymorphic references for `capa_actions.source_id` and `evidence_links.linked_entity_id`.**
Context: both need to reference one of several unrelated entity types. Decision: store as a plain
`uuid` + a `text`/enum discriminator, validated at the application layer, not a DB foreign key.
Rationale: avoids six near-duplicate join tables for what's conceptually one relationship; the
integrity risk is mitigated by integration tests asserting every reference resolves. Status:
accepted, documented as residual risk in `security-model.md` §8.

**ADR-0004 — Financial year default = 1 July–30 June.**
Context: needed for FY/YTD comparison logic; not specified in the brief. Decision: default to
1 July–30 June (common in the Mauritius hospitality sector), implemented as an org-level setting
(not hard-coded per calculation), so it can be corrected in one place if wrong. Status: **assumption
— confirm with product owner** (see §4).

**ADR-0005 — Drizzle schema is normalized 3NF+ with deliberate denormalization only for RLS
performance** (`property_id`/`department_id` duplicated onto child tables). Rationale in
`database-model.md` preamble. Status: accepted.

## 3. What could not be completed without external accounts/credentials

Per the explicit pause condition ("a required secret, domain, API key or external account is
unavailable"), the following are **built in code but not executed against live infrastructure**:

| Item | Why blocked | What exists instead |
|---|---|---|
| Live Supabase project (Dev/Demo/Prod) | No Supabase account/org access in this session | Full SQL migrations + RLS policies, ready to run via `supabase db push` or the Drizzle migrator once a project exists |
| Running integration tests against real Postgres+RLS | Needs a live DB connection string | Test files written (Vitest), CI job wired but conditional on `SUPABASE_TEST_DB_URL` secret being present |
| Running Playwright E2E against a deployed app | Needs a live Supabase project + running app | Test files written, `playwright.config.ts` present, not executed |
| Cloudflare Workers deployment | No Cloudflare account/API token in this session | `wrangler.toml` (all 4 environments) + `@opennextjs/cloudflare` build config committed, `wrangler deploy` not run |
| Creating the first Super Administrator in a real environment | Needs a live Supabase Auth user | Documented bootstrap procedure (SQL script + steps) in `docs/implementation-plan.md` §7, not run |
| Backup/PITR drill, region pinning for data residency | Needs a live Production project | Documented plan in `security-model.md` §6, execution pending project creation |

None of these being unexecuted changes the *code* delivered — schema, RLS, app logic, and tests are
real and complete for what's in scope per phase. They are unverified against live infrastructure,
which is stated plainly rather than claimed as "done."

## 4. Assumptions log

1. Financial year = 1 July–30 June (ADR-0004) — **needs confirmation**.
2. Working hours source for LTIFR/TRIR/Severity Rate (`total_hours_worked`) and occupied-room-nights
   for `GUEST_INC_PER_1000_RN` are **not** generated by SafeGuard itself (no rostering/PMS system in
   scope) — modelled as a manually-entered, versioned `exposure_data` input per property/period
   (owner-approved, same document-evidence discipline as everything else), rather than invented as
   a live-computed figure. **Needs confirmation this is acceptable** vs. a future PMS/HR integration.
3. Mauritius legal-compliance register content is a starter set pending legal/compliance
   subject-matter review (`framework-model.md` §6) — not a complete, authoritative legal register.
4. Default currency `MUR`; multi-currency conversion out of scope for v1.
5. English-only UI for v1; schema doesn't block future i18n.
6. Demo environment uses a **separate Supabase project** seeded with synthetic data only, reset on
   a schedule — assumed acceptable rather than reusing/anonymizing production data.
7. Session token lifetime and password policy use Supabase Auth project defaults unless told
   otherwise (tunable in Supabase project settings, not application code).

## 5. Decisions requiring your approval

1. **Financial year definition** (ADR-0004) — confirm 1 July–30 June or specify another.
2. **Exposure-data input model** (assumption 2) — confirm manual, evidenced entry is acceptable for
   v1, or state that a PMS/HR data feed is required before LTIFR/TRIR/guest-incident-rate KPIs can
   be trusted.
3. **Data residency / Supabase project region** — which region for Production (Mauritius/EU/other),
   given GDPR-aware handling of international guest data (`security-model.md` §7).
4. **Creating actual paid resources**: a Supabase paid tier (needed for PITR backup on Production)
   and any Cloudflare Workers paid plan features — explicit go-ahead needed before any billing
   event, per your instruction not to create paid resources without approval.
5. **Cloudflare + Supabase account access** — who creates the Dev/Demo/Prod Supabase projects and
   the Cloudflare account/API token this session should use, since neither exists yet.
6. **Mauritius legal register completeness** — who signs off the legal-compliance control content
   (framework-model.md §6) before it's presented as authoritative to auditors/regulators.
7. **First Super Administrator identity** — confirm the email address to bootstrap as the first
   `SUPER_ADMIN` once a real Supabase project exists (procedure in §7 below).

None of these block Phase 1–5 code delivery; they block *going live* on real infrastructure, which
is the correct place for that gate to sit.

## 6. Definition-of-done tracker

Updated at the end of each phase against the completion criteria in `product-requirements.md` §6.
"Built, unverified" means the code path is complete and passes static checks (typecheck/lint/unit
tests/build) but has not been run against a live Supabase project — see §3 for why.

| Criterion | Status after Phase 1 |
|---|---|
| Users can register / accept invitations | Built, unverified — `/register` → Supabase Auth `signUp` → `on_auth_user_created` trigger creates `pending_approval` profile |
| Admin can approve users and assign roles | Built, unverified — `/admin/registrations`, approve/reject server actions, role+property+department+medical-permission assignment in one transaction |
| Users can log in and log out | Built, unverified — `/login`, `/logout` via `signOutAction`, secure cookie session via `@supabase/ssr` |
| Records persist in Supabase | Schema + migrations complete (50 tables), not yet applied to a live project |
| Documents/photos upload successfully | Not started (Phase 2/3) |
| Property/department restriction enforced | Built, unverified — RLS policies (`drizzle/0001_auth_helpers_and_rls.sql`) + app-layer `getAuthContext()`/`requireRole()`; unit-tested (13 passing tests on the pure permission logic); RLS integration test written (`src/db/rls.integration.test.ts`), not yet run |
| Medical data separately protected | Built, unverified — separate `medical_records`/`medical_attachments` tables + bucket + RLS keyed only on `has_medical_permission()`, explicitly excluding Super Admin by default; named integration test asserts this |
| Incidents pass through full workflow | Not started (Phase 2) — schema exists, no UI/actions yet |
| Audits and findings work | Not started (Phase 3) — schema exists |
| CAPA verify/close works (owner ≠ verifier) | Not started (Phase 2) — schema + RLS check constraint exist, no UI/actions yet |
| Evidence reused across controls/KPIs | Not started (Phase 3) — schema exists |
| Dashboards calculate from live records | Not started (Phase 4) — placeholder dashboard only |
| KPI calculations reconcile to source | Not started (Phase 4) — KPI catalogue seeded, no calculation engine yet |
| Audit log captures material activity | Partial — `writeAuditLog()` wired into auth + admin approval/suspension/reactivation/session-revocation flows; not yet wired into incident/CAPA/audit/document flows (those don't exist yet) |
| Critical automated tests pass | `npm run lint`, `npm run typecheck`, `npm run test` (13/13 unit tests), `npm run build` (Cloudflare-targetable Next 16 build) all pass. Integration (RLS) and E2E suites are written but require a live Supabase project to execute |
| Deployable from a clean repository | `wrangler.jsonc` + `open-next.config.ts` present for all 3 hosted environments; `wrangler deploy` not yet run — needs a Cloudflare account/API token (open item, see §5) |

## 7. First Super Administrator bootstrap procedure (for when a real project exists)

1. Create the Supabase project (Production or Development as applicable).
2. From `apps/web`, with `DATABASE_URL` set to the project's connection string, run
   `npm run db:migrate` (applies `drizzle/0000_init_schema.sql` and
   `drizzle/0001_auth_helpers_and_rls.sql`) then `npm run db:seed` (roles, frameworks,
   departments, starter control library, KPI catalogue).
3. Have the intended Super Administrator complete normal registration through the app (email +
   password, email verification) — this creates their `auth.users` row and a `profiles` row with
   `status = 'pending_approval'`, same as any other user; there is no back-door signup path.
4. Run the provided one-time bootstrap SQL (`apps/web/scripts/bootstrap-super-admin.sql`,
   parameterized by email) **once**, directly against the project via the Supabase SQL editor or
   `psql` with the service-role/postgres connection — it sets that single
   `profiles.status = 'active'` and inserts the `SUPER_ADMIN` `user_roles` row. This script is
   intentionally not exposed through the application UI/API (no in-app path can self-grant Super
   Administrator).
5. From then on, all further users are approved through the normal admin console
   (`/admin/registrations`) by that Super Administrator — the bootstrap script is a one-time
   cold-start step, not a repeatable admin function.

## 8. Recommended Phase 1 tasks (execution order) — completed

1. `pnpm create next-app` scaffold (App Router, TS strict, Tailwind), shadcn/ui init.
2. Drizzle setup (`drizzle-kit`, `drizzle-orm`, Postgres driver), schema files per
   `database-model.md` domain split, generate initial migration.
3. RLS + helper-function SQL migration (`security-model.md` §3).
4. Supabase Auth wiring: `@supabase/ssr` server/browser clients, `(app)` layout guard, middleware.
5. Auth pages + registration→pending-approval flow + admin approval console.
6. Seed script: roles, frameworks, a handful of demo properties/departments, master control
   library starter set.
7. Audit-log writer (`writeAuditLog()` server-only helper) wired into every mutation from here on.
8. CI skeleton (lint/typecheck/unit, conditional integration/e2e) + Wrangler config skeleton for
   all four environments (no deploy yet).
9. Commit, update the definition-of-done tracker, proceed to Phase 2.

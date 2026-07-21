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
6. CAPA module (owner ≠ verifier).
7. Documents/evidence library + evidence-reuse.
8. Controls/frameworks + critical-gap override persistence.
9. KPI engine (22 KPIs) + calculation log.
10. Assurance Evidence Map.
11. Data Quality Exceptions.
12. Board Mode + reports/exports + audit logging.
13. Notifications + scheduled jobs (Cron).
14. Frontend (17 screens).
15. Testing (20 test cases from the brief) + deployment handoff.

Each phase ships as its own reviewable increment, verified (typecheck + tests, same discipline as
the Supabase build) before moving to the next — not as one unreviewable drop.

## What only you can do

Deploying to your actual Zoho org needs your interactive login — I can't run `catalyst login` for
you, the same way I couldn't run migrations against your Supabase project directly. See
`apps/catalyst/README.md` "Setup" for the exact command sequence.

# SafeGuard on Zoho Catalyst

Phase 1–2 of the migration from Supabase/Vercel per management's decision to pause that stack and
replicate/strengthen the system on Zoho Catalyst. See
`docs/2026-07-zoho-catalyst-migration-plan.md` for the full architecture assessment, data model,
permission model, and phased implementation plan this scaffold implements the start of.

## What's real in this directory right now

- `functions/shared/pure/` — 11 business-rule modules ported **unchanged** from the Supabase
  build (RAG status, FY/YoY period logic, materiality scoring, critical-gap override, climate-risk
  validation, evidence-reuse computation, permission decisions, person-type detail validation,
  board narrative generation, assurance-pack generation), each with its original test file. **74
  tests pass, `tsc --noEmit` is clean.** Run `npm install && npm test` to verify yourself.
- `functions/shared/middleware/` — the permission/audit-logging layer that stands in for what
  Postgres RLS did automatically in the Supabase build. Data Store has no per-row security (see
  the migration plan's risk assessment), so `require-permission.ts`'s `propertyScopeClause()` and
  `assertPropertyAccess()` are the actual enforcement point — every list/detail query in every
  Function must use them.
- `functions/api-dashboard-summary/` — the batch dashboard endpoint (Improvement 1): one
  `GET /dashboard/summary` response covering safety status, CAPA status, critical gaps, audit
  status, KPI overview (from precomputed snapshots, not live recalculation), assurance readiness,
  and the board alert panel — instead of 22 separate KPI calls.
- `data-store-schema/` — JSON schema definitions for the identity/access and master-data tables,
  written in the shape you'll enter into the Catalyst Console (or push via CLI) once the project
  exists. Remaining table groups (incidents, CAPA, documents, controls, KPI, materiality/climate,
  reports/quality/notifications) ship in the next phases, already tracked.

## What isn't done yet (tracked, not forgotten)

Incidents/medical isolation, CAPA, documents/evidence, controls/critical-gap persistence, the
22-KPI calculation functions themselves, the Assurance Evidence Map, Data Quality Exceptions,
Board Mode, notifications/cron, and the 17-screen client. Each is its own phase in the tracked
plan — this is a full platform rebuild, and shipping it as reviewable increments beats one
unreviewable drop.

## Setup — only you can do this part (needs your Zoho login)

```bash
cd apps/catalyst
npm install -g zcatalyst-cli
catalyst login
catalyst init          # creates/links this directory to a real Catalyst project in your org
```
`catalyst init` will ask you to pick or create a Catalyst project and will generate a
`catalyst-config.json` tying this code to your actual project ID — that file doesn't exist yet
because I can't create your Zoho project for you, the same way I couldn't run SQL against your
Supabase project directly.

Once initialised:
1. In the Catalyst Console, create the Data Store tables from `data-store-schema/01-*.json` and
   `02-*.json` (Console → Data Store → Create Table, matching column names/types/scopes exactly).
2. Enable Authentication (Embedded, with custom role assignment) per
   `docs/2026-07-zoho-catalyst-migration-plan.md` §3.
3. `catalyst deploy` once the first Function group is ready — I'll give the exact command
   sequence again at that point.

## Verify this scaffold yourself right now (no Zoho account needed for this part)

```bash
cd apps/catalyst
npm install
npm test          # 74 tests, all passing
npm run typecheck # clean
```

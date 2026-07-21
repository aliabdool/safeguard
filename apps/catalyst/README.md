# SafeGuard on Zoho Catalyst

Phases 1–5 of the migration from Supabase/Vercel per management's decision to pause that stack and
replicate/strengthen the system on Zoho Catalyst. See
`docs/2026-07-zoho-catalyst-migration-plan.md` for the full architecture assessment, data model,
permission model, and phased implementation plan this scaffold implements.

## What's real in this directory right now

- `functions/shared/pure/` — 12 business-rule modules, all unit-tested with zero Data Store/
  network dependency: RAG status, FY/YoY period logic, materiality scoring, critical-gap override,
  climate-risk validation, evidence-reuse computation, permission decisions (including the
  three-way medical-permission model — view/edit/export, independently grantable), person-type
  detail validation, board narrative generation, assurance-pack generation, and incident-workflow
  validation (person/event types, status transitions, the hospital-referral/OSH-reportability
  independence rule).
- `functions/shared/services/` — the incident + medical-notes service layer, storage-abstracted
  (`IncidentRepo`/`AuditLogger` interfaces) so it's fully unit-tested against an in-memory fake and
  the exact same code is what `functions/api-incidents` calls against the real Data Store — no
  parallel "tested" vs. "deployed" implementations to drift apart.
- `functions/shared/middleware/` — the permission/audit-logging layer that stands in for what
  Postgres RLS did automatically in the Supabase build, including `requireMedicalPermission()`,
  which audit-logs every medical-notes access attempt, granted or denied.
- `functions/api-dashboard-summary/` — the batch dashboard endpoint (Improvement 1).
- `functions/api-incidents/` — incident creation, investigation start, OSH-reportability
  determination, and the medical-notes module (view/add/export).
- `data-store-schema/` — JSON schema definitions: identity/access, master data, and now incidents/
  investigation/medical-notes (`03-incidents.json`). Remaining table groups (CAPA, documents,
  controls, KPI, materiality/climate, reports/quality/notifications) ship in the next phases.

**99 tests pass, `tsc --noEmit` is clean.** Run `npm install && npm test` to verify yourself.

## What isn't done yet (tracked, not forgotten)

CAPA, documents/evidence, controls/critical-gap persistence, the 22-KPI calculation functions
themselves, the Assurance Evidence Map, Data Quality Exceptions, Board Mode, notifications/cron,
and the 17-screen client. Each is its own phase in the tracked plan.

## Preparing a Direct Upload preview package

```bash
cd apps/catalyst
npm install
npm run package:direct-upload
```
Produces `dist/safeguard-catalyst-phase5-direct-upload.zip` — bundled Functions only (esbuild,
CommonJS, no `node_modules`, no `.ts` source, no test files, no secrets), plus the Data Store
schema and a README explaining upload steps, required Catalyst services, and — importantly —
that there is **no web client yet**, so this preview tests the Functions layer directly (Catalyst
Console's function test tools, or Postman/curl), not a clickable UI. This ZIP is a build artifact
(`dist/` is gitignored) — regenerate it any time with the command above rather than expecting it
committed to the repo.

## Setup — only you can do this part (needs your Zoho login)

```bash
npm install -g zcatalyst-cli
catalyst login
catalyst init          # creates/links this directory to a real Catalyst project in your org
```
`catalyst init` generates the real `catalyst.json` tied to your actual project ID — I can't create
your Zoho project for you, the same way I couldn't run SQL against your Supabase project directly.
`catalyst.json.TEMPLATE` (inside the Direct Upload zip) documents the expected shape only.

Once initialised, for either deployment path:
1. In the Catalyst Console, create the Data Store tables from `data-store-schema/*.json` in
   numeric order (Console → Data Store → Create Table, matching column names/types/scopes
   exactly).
2. Enable Authentication (Embedded, with custom role assignment) per
   `docs/2026-07-zoho-catalyst-migration-plan.md` §3.
3. Either **Direct Upload** the zip above (Console → Functions, per function) for preview/testing,
   or connect **GitHub Integration** (Console → DevOps) to this repository for repository-based
   deployment — both are documented in the zip's own README.

## Verify this scaffold yourself right now (no Zoho account needed for this part)

```bash
cd apps/catalyst
npm install
npm test              # 99 tests, all passing
npm run typecheck     # clean
npm run build:functions   # bundles each Function to dist/functions/<name>/index.js
```

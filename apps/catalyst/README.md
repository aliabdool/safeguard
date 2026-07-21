# SafeGuard on Zoho Catalyst

Migration from Supabase/Vercel per management's decision to pause that stack and
replicate/strengthen the system on Zoho Catalyst. See
`docs/2026-07-zoho-catalyst-migration-plan.md` for the full architecture assessment, data model,
permission model, and phased implementation plan this scaffold implements, and
`docs/2026-07-zoho-catalyst-access-and-dashboard-model.md` for the full 9-role access-layer model
and 8-dashboard batch-endpoint model — confirmed and documented before Phase 14 (the web client)
per management's explicit instruction.

## What's real in this directory right now

**Backend — Phases 1–13, all complete.**

- `functions/shared/pure/` — business-rule modules, all unit-tested with zero Data Store/network
  dependency: RAG status, FY/YoY period logic, materiality scoring, critical-gap override
  (MIN-of-dimension, capped by any critical gap), climate-risk validation, evidence-reuse
  computation, permission decisions (role + property scope + department scope + the three-way
  medical-permission model), incident-workflow validation, CAPA workflow (owner ≠ verifier),
  document rules (expired evidence is never silently valid), the assurance evidence map filter/
  shape logic, data-quality exception rules (the nine named checks), and notification trigger
  rules (the fourteen named triggers).
- `functions/shared/services/` — storage-abstracted service layers (repo/logger interfaces) for
  incidents, CAPA, documents, controls/critical-gaps, KPI calculation, the report/export audit
  log, and data-quality scanning — each fully unit-tested against in-memory fakes, with the exact
  same code called by the real Data-Store-backed Function. No parallel "tested" vs. "deployed"
  implementations to drift apart.
- `functions/shared/middleware/` — the permission/audit-logging layer standing in for what
  Postgres RLS did automatically in the Supabase build (`propertyScopeClause`,
  `assertPropertyAccess`, `requireMedicalPermission`, `requireExplicitPermission`).
- `functions/shared/adapters/kpi-datastore-repo.ts` — the one real ZCQL implementation of the KPI
  engine's data access, shared by both `api-kpi` and `api-reports` so they can't drift.
- Ten deployable Functions: `api-dashboard-summary`, `api-incidents`, `api-capa`,
  `api-documents`, `api-controls`, `api-kpi`, `api-assurance-map`, `api-data-quality`,
  `api-reports`, `api-notifications`.
- `data-store-schema/` — the full JSON schema, `01` through `12` (see `data-store-schema/README.md`
  for the file-by-file breakdown).
- `docs/2026-07-zoho-catalyst-access-and-dashboard-model.md` — the confirmed 9-role access-layer
  model and 8-dashboard batch-endpoint model, written before Phase 14 per management's instruction.

**212 tests pass, `tsc --noEmit` is clean.** Run `npm install && npm test` to verify yourself.

**Frontend — Phase 14, in progress.** See `client/README.md` once it lands for the web-client
build/deploy instructions.

## What's scaffolded, not fully built (said plainly, not hidden)

Notifications (Phase 13) has real, tested trigger logic and an on-demand scan endpoint, but
outbound email/SMS delivery needs a mail/SMS provider configured in your own Zoho org — not
needed for management's test build. Wiring the scan to a live Cron schedule is a Console
configuration step you do after deployment (same category as `catalyst init`).

## Preparing a Direct Upload preview package

```bash
cd apps/catalyst
npm install
npm run package:direct-upload
```
Produces the Functions-layer package (Package A) — see the top-level packaging README for how
this pairs with the web-client package (Package B) for a full management-test deployment.

## Setup — only you can do this part (needs your Zoho login)

```bash
npm install -g zcatalyst-cli
catalyst login
catalyst init          # creates/links this directory to a real Catalyst project in your org
```
`catalyst init` generates the real `catalyst.json` tied to your actual project ID — I can't create
your Zoho project for you, the same way I couldn't run SQL against your Supabase project directly.

Once initialised:
1. In the Catalyst Console, create the Data Store tables from `data-store-schema/*.json` in
   numeric order (Console → Data Store → Create Table, matching column names/types/scopes
   exactly).
2. Enable Authentication (Embedded, with custom role assignment) per
   `docs/2026-07-zoho-catalyst-migration-plan.md` §3.
3. Deploy the Functions (Package A) — Direct Upload for preview/testing, or GitHub Integration for
   repository-based production deployment.
4. Deploy the web client (Package B) via Web Client Hosting — a separate Console section from
   Functions, see the top-level packaging README for the exact steps and post-upload config.

## Verify this scaffold yourself right now (no Zoho account needed for this part)

```bash
cd apps/catalyst
npm install
npm test              # all tests passing
npm run typecheck     # clean
npm run build:functions   # bundles each Function to dist/functions/<name>/index.js
```

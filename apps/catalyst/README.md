# SafeGuard on Zoho Catalyst

Migration from Supabase/Vercel per management's decision to pause that stack and
replicate/strengthen the system on Zoho Catalyst. This is now a full, working, management-test
build — backend (Phases 1–13) and web client (Phase 14) both complete. See
`docs/2026-07-zoho-catalyst-migration-plan.md` for the full architecture assessment and phased
plan, `docs/2026-07-zoho-catalyst-access-and-dashboard-model.md` for the 9-role access-layer model
and 8-dashboard batch-endpoint model, and
`docs/2026-07-zoho-catalyst-final-package-instructions.md` for exactly how to deploy and test the
final two-package deliverable.

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
- Eleven deployable Functions: `api-auth`, `api-dashboard-summary`, `api-incidents`, `api-capa`,
  `api-documents`, `api-controls`, `api-kpi`, `api-assurance-map`, `api-data-quality`,
  `api-reports`, `api-notifications`.
- `data-store-schema/` — the full JSON schema, `01` through `12` (see `data-store-schema/README.md`
  for the file-by-file breakdown).

**202 tests pass, `tsc --noEmit` is clean.** Run `npm install && npm test` to verify yourself.

**Frontend — Phase 14, complete.** See `client/README.md` for the web-client build/deploy
instructions. 21 screens, role-aware navigation, verified rendering in a real browser (not just
typechecked) via a local Vite dev server and Playwright screenshots.

## What's scaffolded, not fully built (said plainly, not hidden)

- Notifications (Phase 13) has real, tested trigger logic and an on-demand scan endpoint, but
  outbound email/SMS delivery needs a mail/SMS provider configured in your own Zoho org, and live
  Cron scheduling is a Console configuration step you do after deployment.
- User/role/property/department administration currently points at the Catalyst Console
  (Data Store / Authentication tables directly) rather than a bespoke in-app admin UI — said
  plainly on the client's admin screens, not hidden behind a feature that looks finished but isn't.

## Preparing the final Direct Upload packages

```bash
cd apps/catalyst
npm install
npm run package:all       # both packages in one step
# or individually:
npm run package:direct-upload   # Package A — Functions
npm run package:client          # Package B — web client
```
Produces `dist/safeguard-catalyst-functions-direct-upload.zip` (Package A) and
`dist/safeguard-catalyst-client-direct-upload.zip` (Package B). These are two separate Catalyst
Console upload flows (Functions vs. Web Client Hosting) — see
`docs/2026-07-zoho-catalyst-final-package-instructions.md` for exactly why and the deployment
order.

## Setup — only you can do this part (needs your Zoho login)

```bash
npm install -g zcatalyst-cli
catalyst login
catalyst init          # creates/links this directory to a real Catalyst project in your org
```
`catalyst init` generates the real `catalyst.json` tied to your actual project ID — I can't create
your Zoho project for you, the same way I couldn't run SQL against your Supabase project directly.

Once initialised, follow `docs/2026-07-zoho-catalyst-final-package-instructions.md` end to end:
Data Store tables → Authentication → Package A (Functions) → Package B (web client) →
post-upload configuration (the client's `config.json`).

## Verify this scaffold yourself right now (no Zoho account needed for this part)

```bash
cd apps/catalyst
npm install
npm test                 # all backend tests passing
npm run typecheck        # clean
npm run build:functions  # bundles each Function to dist/functions/<name>/index.js

cd client
npm install
npm run typecheck        # clean
npm run build             # static build to client/dist/
npm run dev                # runs the web client locally in demo/offline mode, no backend needed
```

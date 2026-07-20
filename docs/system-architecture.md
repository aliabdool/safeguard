# System Architecture

## 1. High-level shape

```
┌─────────────────────────────────────────────────────────────────┐
│ Cloudflare Workers (Next.js App Router via @opennextjs/cloudflare)│
│                                                                   │
│  Server Components / Server Actions / Route Handlers             │
│    - permission checks (role + property + department + medical)  │
│    - Drizzle ORM queries (Postgres, over Supabase connection      │
│      pooler — Hyperdrive or direct pooled connection)            │
│    - Supabase Storage signed-URL issuance                        │
│    - audit_log writes (server-side only)                         │
│                                                                   │
│  Client Components (shadcn/ui, Recharts)                         │
│    - render only what the server already authorized              │
│    - never hold the service-role key, never call Postgres        │
│      directly                                                    │
└───────────────┬──────────────────────────────────┬──────────────┘
                │ pooled TCP (Drizzle,               │ REST/Storage
                │ server-role, RLS still ON)          │ (signed URLs,
                │                                     │  Auth)
        ┌───────▼───────┐                     ┌───────▼────────┐
        │ Supabase       │                     │ Supabase Auth /│
        │ PostgreSQL     │◄────────────────────┤ Storage        │
        │ (RLS enforced) │  auth.uid() used by  │ (private       │
        │                │  RLS policies         │ buckets, RLS) │
        └────────────────┘                     └────────────────┘
```

Two independent Supabase projects: **Development** and **Production** (plus **Client
Demonstration**, its own project, seeded with synthetic data only — see §7). Local development
points at the Development project by default; `supabase` CLI local stack is optional for
schema-only iteration but is not treated as a fourth environment.

## 2. Why this stack shape, specifically

- **Drizzle ORM queries still run against a Postgres role that RLS applies to** — the app does
  **not** use the Supabase service-role key for ordinary reads/writes. Defense in depth: even a bug
  in the server-action permission check is caught by RLS. The service-role key is used in exactly
  three narrow, server-only contexts: (1) the Admin API for inviting/suspending/revoking sessions,
  (2) issuing signed Storage URLs where the bucket policy itself is the real gate, and (3) the
  scheduled-reminder background job. It is never sent to a Route Handler that a browser can reach
  without also being wrapped in an explicit admin-role check.
- **Server Actions/Route Handlers, not a separate API service** — Next.js App Router server
  functions are the API layer. No separate Express/Fastify service; this keeps auth context
  (`auth.uid()` from the Supabase session cookie) flowing straight from request to DB query without
  an extra hop to re-establish identity.
- **Cloudflare Workers via `@opennextjs/cloudflare`** — per the approved stack. Workers has no
  persistent TCP-friendly runtime for a raw `pg` connection at the edge in every region, so DB
  access from Workers goes through Supabase's connection pooler (Supavisor, transaction mode) or
  Cloudflare Hyperdrive in front of it; this is a deployment-time decision documented in §7 and in
  `docs/implementation-plan.md` as a Phase 5 task, not a Phase 0 blocker.

## 3. Presentation/Domain separation (why the missing prototype doesn't block anything)

Three layers, strictly one-directional:

1. **Domain layer** — Drizzle schema, RLS policies, server actions, audit-log writes, KPI
   calculation functions. Pure data/business logic, no UI concerns at all.
2. **View-model layer** — server components that shape domain data into what a screen needs
   (already-filtered lists, computed RAG status, etc.), independent of how it's laid out.
3. **Presentation layer** — shadcn/ui components, Tailwind classes, page layout, chart choices.

The prototype HTML, whenever it's supplied, only ever informs layer 3: component composition,
spacing, colour tokens, copy. Nothing in layers 1–2 changes. This is why Phase 1–5 proceeded
without it (see `reference/README.md`, ADR-0001).

## 4. Route map (Next.js App Router)

```
/                                   → redirect to /dashboard or /login
/login
/register
/register/pending                   → "awaiting approval" holding screen
/forgot-password
/reset-password
/logout                             (route handler, POST only)

/(app)                              layout: session + status=active required
  /dashboard                        role-aware landing dashboard
  /dashboard/executive              Executive Read-Only board view

  /incidents
  /incidents/new
  /incidents/[incidentId]
  /incidents/[incidentId]/investigation
  /incidents/[incidentId]/medical           (medical-permission only, separate layout)

  /capa
  /capa/new
  /capa/[capaId]

  /framework                                H&S Framework & KPI Catalogue landing
  /framework/controls
  /framework/controls/[controlId]
  /framework/iso45001
  /framework/hotel-operations
  /framework/legal-mauritius
  /framework/gri403
  /framework/ifrs-s1
  /framework/ifrs-s2
  /framework/sasb-hotels
  /framework/ungc
  /framework/ilo-osh
  /framework/kpi-catalogue
  /framework/kpi-catalogue/[kpiCode]

  /audits
  /audits/new
  /audits/[auditId]
  /audits/[auditId]/checklist
  /audits/[auditId]/findings
  /audits/findings/[findingId]

  /documents                                central document & evidence library
  /documents/new
  /documents/[documentId]
  /documents/[documentId]/versions/[versionId]

  /kpis                                     KPI dashboard grid
  /kpis/[kpiCode]                           "View calculation" drill-down

  /reports/export                           permission-controlled exports

  /admin                                    Super Admin / Group H&S Admin only
  /admin/users
  /admin/users/[userId]
  /admin/registrations
  /admin/properties
  /admin/departments
  /admin/roles
  /admin/audit-log

  /account                                  own profile, sessions, notifications

/api
  /api/webhooks/supabase-auth               (optional, for provisioning side-effects)
  /api/cron/reminders                       Cloudflare Cron Trigger target
  /api/cron/kpi-refresh                     Cloudflare Cron Trigger target
  /api/health
```

Route groups `(app)` and a separate `(auth)` group keep the auth-required layout (session check +
`profiles.status = 'active'` check + property/department context provider) in one place rather than
repeated per page.

## 5. Server-side permission enforcement (defense in depth, layer 1 of 3)

Every Server Action and Route Handler under `(app)`:
1. Resolves the Supabase session server-side (`createServerClient` from `@supabase/ssr`, cookie-based).
2. Loads the caller's `profiles.status`, roles, property/department grants, medical permission
   (single cached query per request, via a `getAuthContext()` helper — not re-fetched per component).
3. Rejects (403) before touching Drizzle if the action's declared required permission isn't met.
4. Issues the Drizzle query scoped to the caller's granted properties/departments even though RLS
   would also block it — this avoids leaking "0 rows because RLS blocked you" as a confusing UX
   and keeps the intent explicit in code review.

This is layer 1. Layer 2 is Postgres RLS (§ `docs/security-model.md`). Layer 3 is Storage bucket
policy. All three are required; none is trusted alone.

## 6. Background/scheduled work

Cloudflare Cron Triggers call `/api/cron/reminders` (due-date and review-date reminders) and
`/api/cron/kpi-refresh` (recompute `kpi_calculations` cache for the current period on a schedule,
in addition to on-demand recompute when a user opens a KPI page). Both routes authenticate via a
Cloudflare-injected shared secret header, not a user session, and run under the service-role
context deliberately (system actor in `audit_log`).

## 7. Environments

| Environment | Supabase project | Cloudflare target | Data | Banner |
|---|---|---|---|---|
| Local development | Development project (shared) or local `supabase start` | `next dev` / `wrangler dev` | Seed/fixture data | none |
| Development | Development project | Workers (dev environment) | Seed/fixture data | "Development environment" |
| Client Demonstration | **Dedicated demo Supabase project** | Workers (demo environment) | Synthetic data only, periodically reset | **Mandatory:** "Demonstration environment — do not enter real personal, medical or confidential information." |
| Production | Production Supabase project | Workers (production environment) | Real data | none |

Each environment gets its own `wrangler.toml` environment block and its own set of Cloudflare
encrypted secrets (Supabase URL, anon key, service-role key, DB pooler connection string, signed
webhook secret for cron). No secret is ever shared across environments. See
`docs/implementation-plan.md` for what's blocked pending real Supabase/Cloudflare accounts.

## 8. Testing architecture

- **Unit tests (Vitest):** pure functions — KPI calculation math, severity/RAG classification,
  maturity-score rollup with critical-gap override, document-versioning state machine, CAPA status
  transitions. No DB required.
- **Integration tests (Vitest + a real Postgres):** Drizzle queries and RLS policies, run against
  either a local `supabase start` stack or a disposable Development-project schema. Requires DB
  credentials — blocked until Supabase project(s) exist (tracked in implementation plan).
  Tests are written now; execution is gated on credentials.
- **E2E (Playwright):** golden-path flows (register → admin approves → login → report incident →
  investigate → CAPA → verify → close; document upload → version → evidence link → KPI evidence
  drill-down). Requires a running app against a real Supabase project — same gating as above.
- **Static checks (always runnable, no external creds):** `tsc --noEmit` (strict), ESLint,
  Prettier check. These run in CI on every PR from day one.

## 9. CI/CD

GitHub Actions: `lint-typecheck-unit` job runs on every push (no secrets required). An
`integration-e2e` job runs only when Supabase test-project secrets are present in the repo's GitHub
Actions secrets (conditional job, `if: ${{ secrets.SUPABASE_TEST_DB_URL != '' }}`) so the pipeline
doesn't hard-fail in a fork or before infra exists. Deploy job (`wrangler deploy`) is manual-approval
gated for Production, automatic for Development/Demonstration.

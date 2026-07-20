# Sunlife SafeGuard

Multi-property Health & Safety management-assurance system. Next.js App Router + TypeScript
strict + Supabase (Postgres, Auth, Storage) + Drizzle ORM + Cloudflare Workers.

This is the real application — see `../docs/` for the full architecture, data model, security
model, roles/permissions, framework model, KPI catalogue, and implementation plan. This README is
the practical "how do I run/deploy this" reference.

## Status

Phases 0–5 complete against the phased plan in `../docs/implementation-plan.md`. All code passes
`lint`, `typecheck`, `test` (unit), and `build` — see that document's §6 "Definition-of-done
tracker" for exactly which capabilities are **built** vs. **verified against live infrastructure**
(no Supabase project or Cloudflare account existed in the environment this was built in — see
`implementation-plan.md` §3).

## Local setup

```bash
cd apps/web
npm install
cp .env.example .env.local   # fill in the values below
npm run dev                  # http://localhost:3000
```

### Environment variables (`.env.local`)

| Variable | Where it comes from | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project → Settings → API | Public |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase project → Settings → API (the "publishable key", `sb_publishable_...`) | Public — safe, meaningless without RLS |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase project → Settings → API | **Secret.** Never `NEXT_PUBLIC_*`, never client-imported (enforced by `src/server/auth/service-role.ts` + ESLint) |
| `DATABASE_URL` | Supabase project → Settings → Database → Connection pooling (transaction mode) | Used by Drizzle + migrations |
| `NEXT_PUBLIC_SITE_URL` | Your deployed URL, or `http://localhost:3000` locally | Used for password-reset redirect links |
| `NEXT_PUBLIC_APP_ENV` | `demo` only in the Client Demonstration environment | Renders the mandatory demo banner |
| `CRON_SECRET` | Generate a random string | Shared secret for `/api/cron/*` routes |

## Supabase setup (once you have a project)

```bash
# 1. Apply migrations (schema + RLS policies + helper functions + storage buckets)
npm run db:migrate

# 2. Seed reference data (roles, frameworks, departments, starter control library, KPI catalogue)
npm run db:seed

# 3. Register your intended Super Administrator through the app itself (no back-door signup)
npm run dev
# → http://localhost:3000/register

# 4. Promote that one account to Super Administrator (one-time, not repeatable via the UI)
# Run scripts/bootstrap-super-admin.sql in the Supabase SQL editor, after editing the
# target_email variable at the top of the file.
```

Full procedure and rationale: `../docs/implementation-plan.md` §7.

Migration files, in order:
- `drizzle/0000_init_schema.sql` — all 50 tables
- `drizzle/0001_auth_helpers_and_rls.sql` — `app_auth` helper functions, RLS policies on every
  table, `auth.users` trigger, Storage bucket definitions
- `drizzle/0002_control_assessments_unique_idx.sql` — unique index backing
  re-assess-in-same-period-updates-not-duplicates behaviour

### No raw Postgres access from where you're running this?

`db:migrate` and `db:seed` both open a direct Postgres TCP connection (via `postgres-js`), which
some sandboxed/managed environments (this one included) block at the network egress layer —
HTTPS-only. If `npm run db:migrate` hangs or fails with a connection timeout, run the same SQL
through the **Supabase dashboard → SQL Editor** instead (plain HTTPS from your browser, no direct
DB connection required), pasting each file in order and running it:

1. `drizzle/0000_init_schema.sql`
2. `drizzle/0001_auth_helpers_and_rls.sql`
3. `drizzle/0002_control_assessments_unique_idx.sql`
4. `scripts/seed.sql` — a hand-maintained SQL mirror of `src/db/seed.ts`'s reference data
   (roles, frameworks, departments, two demo properties, a starter control library, the 38-row
   KPI catalogue). Idempotent (`ON CONFLICT DO NOTHING` throughout), same as the TS version.

## Demonstration users

No demo users are seeded — `db:seed` only inserts reference/catalogue data (roles, frameworks,
departments, a starter control library, the KPI catalogue), deliberately excluding any
person-identifying or account data. Create demo accounts by registering through `/register` in
the Client Demonstration environment and approving them from `/admin/registrations`, the same way
real users are onboarded — there is no separate "seed users" path, by design (an in-app
back-door for creating pre-approved accounts would be a real security regression, not a
convenience).

### Optional: populated demo dataset for showcases

`scripts/demo-data.sql` (see ADR-0008, `docs/implementation-plan.md`) inserts a realistic set of
**real** rows — incidents, investigations, CAPA actions, control assessments, an audit with
findings — attributed to 6 real registered accounts, so every dashboard/KPI/heatmap computes live
from this data exactly as it would from genuine operational data. It does **not** insert
`documents`/`file` rows, since those require an actual object in Supabase Storage — upload a few
real files through `/documents` instead. Run it (via the SQL Editor, same as `seed.sql`) only
after registering the 6 named demo accounts documented at the top of the script and promoting the
first one to Super Administrator. Not run automatically by `db:seed` — this is showcase-only data,
never appropriate for a production environment.

## Cloudflare deployment

```bash
npm run cf:build              # opennextjs-cloudflare build
npm run cf:deploy:development
npm run cf:deploy:demonstration
npm run cf:deploy:production
```

Before the first deploy to each environment:

```bash
wrangler secret put SUPABASE_SERVICE_ROLE_KEY --env <environment>
wrangler secret put DATABASE_URL --env <environment>
wrangler secret put CRON_SECRET --env <environment>
wrangler r2 bucket create safeguard-<environment>-opennext-cache
```

`NEXT_PUBLIC_*` variables are inlined at **build** time by Next.js, not read from Wrangler secrets
at runtime — set them in whatever CI environment runs `npm run cf:build`/`cf:deploy:*` (see
`.github/workflows/ci.yml` for the pattern; the `build` job already demonstrates this for the
static build-check).

### Cron Triggers

`/api/cron/reminders` and `/api/cron/kpi-refresh` are ordinary authenticated POST routes (shared
secret via the `x-cron-secret` header, checked in `src/server/cron/auth.ts`) — they are not
wired to a Cloudflare Cron Trigger yet, since `@opennextjs/cloudflare`'s default Worker export
doesn't include a `scheduled()` handler out of the box. To wire them up:

1. Add a `[triggers]` block to `wrangler.jsonc` (`"crons": ["0 6 * * *", "0 * * * *"]` or similar).
2. Add a custom `scheduled()` export wrapping the OpenNext worker (see
   [OpenNext's Cloudflare cron docs](https://opennext.js.org/cloudflare) for the current pattern)
   that does an internal `fetch()` to these two routes with the `x-cron-secret` header set from
   the environment's secret.
3. Until that's wired, the routes can be triggered by any external scheduler (GitHub Actions
   `schedule:`, a third-party cron service) that can POST with the header — same contract either
   way.

## Testing

```bash
npm run lint            # ESLint
npm run typecheck       # tsc --noEmit
npm run format:check    # Prettier
npm run test            # Vitest unit tests (40 passing, no external dependencies)
npm run build            # Next.js production build (37 routes)

# Require a live Supabase project (not run in the environment this was built in):
npm run db:migrate && npx vitest run --config vitest.integration.config.ts   # RLS integration tests
npx playwright test e2e/auth-and-approval.spec.ts                            # requires PLAYWRIGHT_BASE_URL

# Do NOT require a live Supabase project — genuinely verified in this build:
npx playwright test e2e/security-headers.spec.ts
```

## What's genuinely built vs. what needs live infrastructure to verify

See `../docs/implementation-plan.md` §6 for the full criterion-by-criterion tracker. Summary:

**Built and code-verified** (typecheck/lint/unit-test/build all pass, and for auth/security
headers, actually run against a live local dev server in this session): the full data model and
RLS policies, registration → admin approval → role/property/department assignment, incident
workflow, restricted medical records, CAPA with owner≠verifier enforced at 4 independent layers,
document versioning/approval/evidence reuse, ISO 45001 control library with the critical-gap
override, audit programme/findings, a 22-KPI live calculation engine with FY/YTD comparison,
security headers, rate limiting, scheduled reminders, permission-controlled export, a materiality
module scoring GRI and IFRS S1 independently, and an IFRS S2 climate-risk register.

**Not yet run against live infrastructure** (needs a real Supabase project + Cloudflare account,
neither of which existed in the environment this was built in): the RLS integration test suite,
the full golden-path Playwright suite, `wrangler deploy`, and therefore the entire application has
never been exercised end-to-end against a real database. Treat this as "ready to deploy and
verify," not "verified in production."

## Known limitations (v1)

- 18 of the 40 catalogued KPIs are documented (definition/formula/thresholds) but not yet wired
  to a live calculation function — `/kpis` shows them with an explicit "not yet implemented"
  state, never a fabricated number.
- Cron Triggers aren't wired to the two `/api/cron/*` routes yet (see above) — reminders and the
  KPI cache only refresh on-demand (page load) until that's connected.
- `financialYearFor()` defaults to 1 July–30 June (ADR-0004) — needs product-owner confirmation.
- Exposure data (hours worked, occupied room nights) feeding LTIFR/TRIR/guest-incident-rate KPIs
  is manual entry (`exposure_data` table) — no PMS/HR system integration exists.
- The Mauritius legal-compliance register is a starter set pending legal review (see
  `../docs/framework-model.md` §6).
- CSP uses `'unsafe-inline'` for scripts/styles (Next.js's current bootstrap requirements) —
  nonce-based CSP is a documented follow-up once deployed and verifiable end-to-end.
- No native mobile app, no i18n, no guest-facing submission portal — all explicitly out of scope
  for v1 (`../docs/product-requirements.md` §2).

## Remaining actions that need external credentials/paid services

1. Create the Development, Client Demonstration, and Production Supabase projects (separate
   projects, per `../docs/system-architecture.md` §7) and choose a data-residency region.
2. Create/configure the Cloudflare account, Workers plan, and R2 buckets for the OpenNext
   incremental cache.
3. Decide and provision the Cron Trigger wiring described above.
4. Confirm the financial-year definition and the exposure-data input model
   (`../docs/implementation-plan.md` §5, items 1–2).
5. Legal/compliance review of the Mauritius statutory register before presenting it as
   authoritative to auditors or regulators.

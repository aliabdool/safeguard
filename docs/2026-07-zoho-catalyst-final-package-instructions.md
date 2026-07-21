# SafeGuard on Zoho Catalyst — final management-test package

## What this is

**This is a management test build. It is NOT a production-ready build and NOT a production
candidate.** It is the first release management can actually log into and click through — every
backend module (Phases 1–13) is real and tested, and the web client (Phase 14) is a genuine,
functional interface, not a mockup. What's still open before a production decision: your own
Zoho project needs to be initialised and the tables/Functions/client deployed into it (nobody but
you can do that step — see below), the notifications module's outbound delivery needs a mail/SMS
provider chosen, and the admin screens for user/role management currently point at the Catalyst
Console rather than a bespoke in-app UI (documented plainly on those screens, not hidden).

## Why two packages, not one

Zoho Catalyst Functions and Zoho Catalyst Web Client Hosting ("Slate") are two different Console
products with two different upload flows — there is no single ZIP or single upload action that
installs both. Functions run Node.js and serve the REST API; Web Client Hosting serves a static
build (HTML/JS/CSS) with no server-side runtime at all. Deploying "the app" therefore means two
uploads, in order:

- **Package A — Functions.** `apps/catalyst/dist/safeguard-catalyst-phase6-direct-upload.zip`
  (rename convention aside, it now carries all 10 backend Functions through Phase 13 — regenerate
  it with `npm run package:direct-upload` inside `apps/catalyst/` for the current contents).
  Uploaded via **Console → Functions → Deploy** (Advanced I/O, Node.js 18), one function at a
  time, or via GitHub Integration for repository-based deployment (kept ready, see below).
- **Package B — Web client.** `apps/catalyst/dist/safeguard-catalyst-client-direct-upload.zip`,
  produced by `npm run package:client` inside `apps/catalyst/`. Uploaded via **Console → Web
  Client Hosting → Deploy → Direct Upload** — a completely separate section of the Console from
  Functions.

## Exact upload order

1. **Data Store** — create every table in `data-store-schema/*.json`, in numeric order (`01`
   through `12`), matching column names/types/scopes exactly (Console → Data Store → Create
   Table). Functions and the client will both fail without this step done first.
2. **Authentication** — enable Embedded Authentication with custom role assignment (Console →
   Authentication). Create at least the test users named in the checklist below, and assign roles/
   property/department/medical-permission grants via the `UserRoles` / `UserPropertyAccess` /
   `UserDepartmentAccess` / `UserPermissions` tables you just created.
3. **Package A (Functions)** — deploy all 10 functions (`api-auth`, `api-dashboard-summary`,
   `api-incidents`, `api-capa`, `api-documents`, `api-controls`, `api-kpi`, `api-assurance-map`,
   `api-data-quality`, `api-reports`, `api-notifications` — 11 in total including `api-auth`,
   added for the client's `/me` endpoint). Note each one's assigned invoke URL as you go.
4. **Package B (Web client)** — deploy the static build via Web Client Hosting.
5. **Post-upload configuration** (only you can do this part — the values don't exist until step 3
   completes):
   - Edit the deployed client's `config.json` (or rebuild `apps/catalyst/client/public/config.json`
     with the real values before re-running `npm run package:client`):
     - `apiBase` — the origin + path prefix your deployed Functions share (Console → Functions →
       any function → invoke URL, minus the function-specific segment).
     - `loginUrl` — your project's Embedded Authentication login URL (Console → Authentication).
   - Reload the client. It will move out of "Not connected / structural preview" mode and start
     calling your real backend.

## Required Catalyst services

Data Store, Authentication (Embedded), Functions (Advanced I/O, Node.js 18), Web Client Hosting.
Notifications' outbound delivery (Phase 13) additionally needs a mail/SMS provider once you choose
one — not required for this test build, which surfaces notifications in-app only.

## Seed data

- `data-store-schema/02-master-data.json` ships `seed_rows` for `Properties` and
  `InjuryMechanisms`, and a `seed_rows_ref` pointer for the 19-department list (same data as
  `apps/web/scripts/seed.sql`) — enter these once when creating those tables.
- `KPIDefinitions`, `Frameworks`, `FrameworkRequirements`, `Controls`, and
  `ControlFrameworkMappings` need to be populated with your organisation's actual control
  library/KPI catalogue before the KPI engine and Assurance Evidence Map have anything to show —
  this is content only you and your H&S team can author correctly; it is not something to
  fabricate as placeholder rows.
- At least two test users per the checklist below (owner ≠ verifier user, medical-permission
  grant vs. no grant, etc.).

## Test checklist

Cases 1–12 and 17–19 are covered by the automated test suite (`npm test` inside
`apps/catalyst/` — 202 tests, all passing) at the service-layer level; re-verify them end-to-end
against your live deployment using the web client for full confidence. Cases 13–16, 20 need a
live deployment with seeded data to observe (noted below).

| # | Case | Automated? | How to verify live |
|---|---|---|---|
| 1 | H&S manager creates incident | Yes (`incident-service.test.ts`) | Incident Register → Report incident |
| 2 | H&S manager investigates incident | Yes | Incident Detail → Start investigation |
| 3 | H&S manager cannot view medical notes without permission | Yes | Incident Detail → Medical notes (expect lock) |
| 4 | Nurse with explicit permission can view medical notes | Yes | Same, signed in as a user with `view_medical_notes` |
| 5 | Admin without explicit medical permission cannot view medical notes | Yes | Same, signed in as Super Admin with no grant |
| 6 | CAPA owner cannot verify own CAPA | Yes (`capa-service.test.ts`) | CAPA Detail, signed in as owner |
| 7 | Designated verifier can verify CAPA | Yes | CAPA Detail, signed in as verifier |
| 8 | Third party cannot verify CAPA | Yes | CAPA Detail, signed in as neither |
| 9 | Expired fire certificate creates critical gap | Yes (`control-service.test.ts`) | Controls & Frameworks → record assessment with an expired-evidence note |
| 10 | Critical gap caps readiness score | Yes | Same test file — confirm live via KPI Centre → ISO45001_READINESS |
| 11 | One document supports multiple frameworks | Yes (`document-service.test.ts`) | Documents → link one approved document to two controls under different frameworks |
| 12 | KPI with missing data shows "not yet calculable" | Yes (`kpi-service.test.ts`) | KPI Centre → any KPI with no source records yet |
| 13 | KPI drill-down shows formula and source records | Manual | KPI Centre → View calculation panel |
| 14 | Fatality appears prominently in Board Mode | Manual (needs seeded data) | Board Dashboard, after a fatality is recorded |
| 15 | Board narrative uses only live data | Manual | Reports & Exports → Generate board narrative |
| 16 | Assurance readiness pack says "management self-assessment" | Manual — also asserted verbatim in `assurance-pack.ts`'s `DISCLAIMER` constant | Reports & Exports → Generate assurance pack |
| 17 | Export is audit logged | Yes (`report-service.test.ts`) | Any export → check `AuditTrail` and `ReportExports` tables |
| 18 | Property-scoped user cannot see other hotel data | Yes (`permissions.test.ts`, and per-service tests) | Sign in as a single-property user, confirm other hotels absent everywhere |
| 19 | Dashboard uses batch endpoint | Yes by construction — one `GET /dashboard/summary` call per dashboard load, never one call per KPI | Browser network tab on any dashboard |
| 20 | Data-quality exception appears when evidence is missing or expired | Yes (`data-quality-service.test.ts`) | Data Quality Exceptions → Rescan now, after creating a violating record |

## Repository-based deployment (kept ready for production)

Both `apps/catalyst/functions/` and `apps/catalyst/client/` live in this repository. Once
`catalyst init` links a real Catalyst project, Catalyst's GitHub Integration (Console → DevOps)
can point at this repo/path for repository-based deployment of Package A — the intended path for
controlled production releases once management signs off on moving past Direct Upload testing.
Web Client Hosting's own CI/CD hook (if enabled for your plan) can do the equivalent for Package B.
Nothing about the Direct Upload packages above blocks this path; it's the same source, packaged
differently for the two different deployment mechanisms.

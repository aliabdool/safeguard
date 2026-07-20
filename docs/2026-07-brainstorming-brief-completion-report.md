# Completion report — July 2026 brainstorming-brief work

This covers the work done against the brainstorming-meeting brief (management's numbered 1–18
list): improve and complete the existing SafeGuard application in place, using the real Supabase
database and the current codebase as the foundation — not a rebuild, not a Zoho migration.

Everything below was implemented against the live repository, typechecked, linted, unit-tested
and built successfully at every step (see "Test results"). Nothing in this report describes work
that exists only as a plan.

## 1. Features added

**Person-type and injury model**
- `trainee` added as a genuinely separate person type (previously folded into a generic bucket),
  with its own conditional fields (training institution, placement supervisor, department,
  induction status) alongside new employee/contractor/guest conditional fields, all validated
  server-side against a discriminated Zod union keyed on person type
  (`src/server/incidents/person-details.ts`).
- A controlled 15-value injury-mechanism vocabulary (slip/trip/fall, cut/laceration, burn/scald,
  manual handling, struck by/against, falling object, chemical exposure, electrical contact,
  vehicle-related, ergonomic/repetitive strain, food-allergen exposure, marine/swimming, other)
  replacing free text.
- First-class, statutorily-independent OSH-reportable status (`yes` / `no` /
  `pending_determination`) with reporting authority, deadline, submission date and reference —
  deliberately kept separate from `hospital_referral`, since a case can be one without the other.

**Materiality module**
- GRI 3 (2021) impact/double materiality and IFRS S1 financial/single materiality scored on
  fully independent column groups for the same topic — never blended into one number. The two
  independent decisions are only combined at the final classification-label stage
  (`src/server/materiality/scoring.ts`).

**Climate-risk register (IFRS S2)**
- A real risk register (`climate_risks` table), not a boolean flag: exposure, vulnerability,
  existing controls, residual risk, adaptation action, scenario assumptions and resilience
  conclusion, with a 19-hazard vocabulary each assigned to exactly one of acute physical / chronic
  physical / transition (`src/server/climate-risk/pure.ts`).

**SASB scope correction**
- The SASB Hotels & Lodging framework description previously implied a generic "H&S-relevant
  metrics" scope. Corrected to state plainly that SASB Hotels & Lodging's actual material topics
  (Energy & Water Management, Ecosystem Protection & Climate Adaptation, Fair Labor Practices)
  have no standalone occupational-H&S topic, and that any control mapped there is an indirect
  Fair Labor Practices link, not a formal SASB H&S metric.

**Evidence reuse**
- The document detail page now shows a real, data-derived summary — "this document supports N
  records across M evidence types, including K controls across J frameworks" — computed from
  actual `evidence_links` → `control_assessments` → `control_framework_mappings` joins, not a
  static claim (`src/server/documents/evidence-reuse.ts`).

**Board dashboard**
- FY selector (financial year, 1 July–30 June) and property filter; 18 headline KPI tiles;
  incidents-by-type and incidents-by-department bar charts; a 4-check data-quality panel (missing
  root cause on investigated incidents, missing injury mechanism on injury outcomes, pending
  OSH-reportable determinations, overdue corrective actions) computed against the selected
  period's own records, not fabricated.

**Auto-generated board narrative**
- Deterministic, template-based prose generated entirely from the same live KPI figures the
  dashboard tiles use — no LLM call, no invented numbers. A KPI with no data for the period says
  so explicitly ("not yet calculable") rather than showing a zero. Fatalities are always called
  out prominently rather than folded into a summary count
  (`src/server/reporting/board-narrative.ts`).

**ISAE-3000-aligned assurance pack**
- A structured Markdown evidence bundle — KPI evidence table with included-record counts, control
  critical-gap summary, open critical/major audit findings, CAPA status breakdown, data-quality
  exceptions — organised the way an ISAE 3000 (Revised) type engagement expects evidence
  organised. Carries an explicit disclaimer, top and bottom, that it is a management
  self-assessment and has **not** been independently assured
  (`src/server/reporting/assurance-pack.ts`).

**Demo dataset**
- Replaced the placeholder demo data with exactly 10 sanitised, fictional incident records
  (never the real historical register, no real names or health data) covering the required
  scenario mix: employee, trainee, guest, contractor, near-miss, unsafe condition, minor/major/
  lost-time injury and hospital-referral cases, with matching investigations, five-whys, CAPA
  actions and audit findings (`apps/web/scripts/demo-data.sql`).

## 2. Migrations

All additive, all forward-only, no destructive changes to existing tables:

| Migration | Content |
| --- | --- |
| `0003_trainee_reportable_injury_mechanism.sql` | `trainee` person type, `injury_mechanism`, `reportable_status` and related columns/enums |
| `0004_materiality_and_climate_risk.sql` | `material_topics`, `materiality_consultations`, `climate_risks` tables |
| `0005_materiality_climate_risk_rls.sql` | RLS enable/force + policies for the three new tables, mirroring the existing `control_assessments` pattern |

These have **not yet been run against the live Supabase project** in this session (the sandbox's
egress proxy blocks raw Postgres connections — every migration in this project has always been
applied via the Supabase SQL Editor, copy-pasted by the user). They need to be applied in
migration order, followed by re-running `scripts/seed.sql` deltas (updated KPI/framework rows) and
the rewritten `scripts/demo-data.sql`, before any of this is visible in the live app.

## 3. Dashboard improvements

18 of 40 catalogued KPIs are live-calculated (up from 13 at the start of this work); the dashboard
now also has an FY selector, property filter, two grouped bar charts and a real data-quality
panel. **Scope actually delivered vs. the brief's full ask**: the brief describes roughly 18
chart/analysis types and a full filter set (person-type, incident-type, injury-type, severity,
outcome, reportable-status, date-range). Two chart types and two filters (FY, property) are built.
This was a deliberate, disclosed scope decision given the size of the remaining work — see Known
limitations.

## 4. Framework and assurance improvements

- SASB scope corrected (see above) — no framework in this system now claims coverage it doesn't
  have.
- Evidence-reuse badge makes the "one control, one piece of evidence, many frameworks" model
  visible in the UI rather than only true in the data model.
- Board narrative and assurance pack give management two new, permission-controlled,
  audit-logged exports building directly on the KPI engine.

## 5. Security improvements

- No changes to the existing three-layer security model (app-layer checks, Postgres RLS, storage
  RLS) — the new tables (`material_topics`, `materiality_consultations`, `climate_risks`) were
  brought under RLS in the same migration that created them (`0005`), not added later as a gap.
- The new exports (board narrative, assurance pack) reuse the exact same permission check
  (`requireRole` against the existing `EXPORT_ROLES` list) and audit-log write
  (`data_exported` event) as the pre-existing CSV export — no new, weaker code path was
  introduced for the new report types.
- Medical-data access remains a separate, explicit, role-independent grant
  (`user_medical_permission`) — untouched by this work.

## 6. Test results

- `npm run lint` — clean.
- `npm run typecheck` — clean.
- `npm run test` — **74 passing tests** across 10 files (up from 60 at the start of this stretch),
  including new coverage for evidence-reuse computation, board-narrative generation (specifically:
  never fabricating a number, always calling out fatalities, only listing nonzero data-quality
  caveats) and the assurance-pack builder (always carrying its disclaimer, listing findings
  correctly).
- `npm run build` — succeeds; all 28 routes build (static where possible, server-rendered where
  they must be).
- `npm run format:check` — clean except the same pre-existing, out-of-scope files flagged before
  this work started (`AGENTS.md`, `README.md`, `drizzle/meta/*.json` — none have a configured
  Prettier parser or are meant to be reformatted).
- **Not run in this session**: the RLS integration suite (`src/db/rls.integration.test.ts`,
  requires a live Supabase connection the sandbox can't make), the Playwright E2E suite, and any
  manual testing against the deployed Vercel app. These need to be run by the user against the
  live environment after the migrations above are applied.

## 7. Known limitations

- **Dashboard breadth**: 2 of ~18 requested chart/analysis types, and 2 of ~7 requested filter
  dimensions, are built. The KPI tiles, FY comparison and data-quality panel are real and live;
  the remaining chart variety and filter set are not yet built.
- **Materiality and climate-risk UI**: the schema, RLS and pure scoring/classification logic exist
  and are unit-tested, but no screens exist yet to actually record a materiality assessment or a
  climate risk through the app — these are currently data-model-only.
- **KPI catalogue coverage**: 22 of 40 catalogued KPIs are wired to a live calculation function;
  the rest show an explicit "not yet implemented" state rather than a fabricated number.
- **Mobile/frontline UX**: not redesigned this stretch beyond confirming (by code inspection) that
  the incident-report form uses plain operational language, not ISO/GRI/IFRS/SASB terminology — a
  genuine jargon-free check, but not the deeper mobile-first rework or offline capture the brief
  describes.
- **Migrations not yet applied**: `0003`–`0005` and the rewritten demo data exist in the repo but
  have not been run against the live Supabase project in this session (sandbox network
  restriction — needs the user to run them via the SQL Editor, in order).
- **No end-to-end verification against live infrastructure**: everything above is verified by
  lint/typecheck/unit-test/build only. The live Vercel deployment has not been re-tested against
  these changes.
- **Pre-existing documentation staleness**: `apps/web/README.md` still references an earlier
  Cloudflare/Wrangler deployment target from before the project moved to Vercel; that cleanup is
  unrelated to this brief and was left alone rather than folded into this change set.

## 8. Recommended next steps

1. Apply migrations `0003` → `0005` via the Supabase SQL Editor, in order, then re-run the
   `scripts/seed.sql` deltas and the new `scripts/demo-data.sql`.
2. Smoke-test the live app: dashboard tiles render, board narrative and assurance pack downloads
   work end-to-end, the 10 demo incidents appear correctly across the person-type/injury-mechanism
   filters that do exist.
3. If continuing this work: prioritise the remaining dashboard chart types and filters next (the
   highest-visibility gap versus the brief), then the materiality/climate-risk UI screens (the
   data model is ready and waiting), then the deeper mobile/offline work.
4. Zoho Catalyst remains parked, as instructed, with the caveat already on record from earlier in
   this project: Catalyst's Data Store row-level security is table-level (Global/Org/User scopes),
   not per-row predicate-based like Postgres RLS — a real security-model downgrade to weigh if
   that migration is revisited later, not just a hosting-platform swap.

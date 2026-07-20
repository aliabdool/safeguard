# H&S Framework & Control Model

## 1. Principle

**One master control library. Frameworks map onto it — they don't generate separate controls.**
A control such as "Permit-to-work system for high-risk work" is assessed once per
property/department/period; that single assessment is then visible under ISO 45001 (e.g. clause
8.1.2), Hotel Operational Controls, GRI 403 (403-1/403-7), IFRS S1/S2 (as a risk-management
disclosure input), SASB Hotels & Lodging, UN Global Compact Principle 1, and ILO-OSH guidelines
simultaneously, via `control_framework_mappings`.

## 2. Frameworks in v1 (seeded rows in `frameworks`)

`ISO45001`, `HOTEL_OPS` (property-level operational controls not otherwise codified — fire safety
systems, pool/spa safety, food safety interfaces, contractor management on hotel premises),
`MU_LEGAL` (Mauritius Occupational Safety and Health Act and related regulations, plus other
applicable Mauritian H&S-relevant legislation), `GRI403` (GRI 403: Occupational Health and Safety),
`IFRS_S1` (general sustainability disclosures, the H&S-relevant risk/opportunity subset), `IFRS_S2`
(climate — only where it intersects H&S, e.g. heat-stress risk, extreme-weather business
continuity), `SASB_HOTELS` (SASB Hotels & Lodging standard, H&S-relevant metrics), `UNGC` (UN
Global Compact, Principles 1–2 primarily), `ILO_OSH` (ILO-OSH 2001 guidelines).

## 3. Assessment model

Each control is assessed on **four independent dimensions**, each scored 0–4:

| Score | Meaning |
|---|---|
| 0 | Absent |
| 1 | Initial |
| 2 | Documented |
| 3 | Implemented |
| 4 | Effective |

- **Policy** — does a policy statement exist and is it current/approved?
- **Procedure** — is there a documented procedure, and is it version-controlled/approved?
- **Implementation** — is there implementation-level evidence (records, training logs, inspection
  records) that the procedure is actually followed?
- **Effectiveness** — is there effectiveness-level evidence (incident trend, audit result,
  verification) that the control actually works?

**A policy alone cannot produce full compliance.** A control's overall maturity for a given
assessment period is the *minimum* of the four dimension scores, not the average — this directly
implements the spec's rule that "a policy alone must not produce full compliance." (Design
decision, not literal spec text — recorded as ADR-0002 in `implementation-plan.md` since the spec
states the *evidence-level* rule but doesn't specify the aggregation formula; minimum-of-dimensions
is the most defensible reading and is easy to override per-framework later if a framework's own
methodology requires a different rollup.)

## 4. Evidence requirement per dimension

Each dimension score of ≥2 (Documented) or higher must be backed by at least one `evidence_links`
row at the matching `evidence_level` (Policy/Procedure/Implementation/Effectiveness) pointing at an
**Approved** `document_versions` row. A dimension score with no qualifying evidence link is flagged
`data_quality_status = 'unverified'` on any rollup that includes it — visible on dashboards, not
silently accepted.

## 5. Critical-gap override algorithm

Per the spec: *"A critical legal or life-safety gap must override a high average compliance score."*

Implementation:
1. A `control_assessments` row is a **critical gap** when `controls.is_life_safety_critical = true`
   (or the control maps to `MU_LEGAL`) **and** any dimension score for that assessment is ≤ 1.
2. Any rollup (property-level ISO 45001 readiness, legal-compliance score, group KPI
   `legal_compliance` / `iso45001_readiness`) that includes a critical-gap assessment in its scope
   is capped: `rollup_score = min(computed_average_or_weighted_score, 1)` — i.e. the rollup cannot
   read better than "Initial" regardless of how strong every other control is, and the UI renders it
   RAG-red with an explicit "Critical gap" badge and a link to the offending control(s), rather than
   just a suppressed number.
3. This cap is computed in the KPI/rollup calculation function itself (not just a UI badge) so
   exports and the Board dashboard both inherit it — it cannot be "designed around" by looking at a
   different view.

## 6. Legal-compliance register (Mauritius)

Modelled as ordinary `controls` rows mapped to the `MU_LEGAL` framework, with a
`legal_requirement_details` row attached (citation, regulator, penalty description, renewal
frequency — e.g. fire certificate renewal, boiler/pressure-vessel inspection certificates, food
handler medical certificates where H&S-relevant, OSHA-Mauritius registrations). This keeps legal
requirements inside the same master-control/evidence/assessment machinery rather than a bespoke
parallel system, per the "one master control library" instruction — while still giving legal
requirements their own filtered view (`/framework/legal-mauritius`) and their own KPI
(`legal_compliance`).

**Open item requiring subject-matter input:** the full, authoritative list of applicable Mauritius
H&S legislation/regulations and their citation numbers is a legal/compliance content task, not an
engineering one. Phase 3 seeds a representative starter set (Occupational Safety and Health Act
2005, Workers' Rights Act provisions relevant to H&S, fire safety, food safety interfaces) and
flags the register as `content_status = 'starter_set_needs_legal_review'` until a
qualified reviewer confirms completeness — recorded as a decision requiring approval in
`implementation-plan.md`.

## 7. Severity scale (shared by incidents and controls)

A single 1–5 severity scale is used consistently for `incidents.actual_severity` /
`potential_severity` and referenced by framework rollups that weight findings by severity:

| Score | Label | Example |
|---|---|---|
| 1 | Negligible | No treatment required |
| 2 | Minor | First aid only |
| 3 | Moderate | Medical treatment, no lost time |
| 4 | Major | Lost-time injury, hospital referral |
| 5 | Catastrophic | Fatality or permanent disability, or equivalent high-potential near miss |

## 8. Reuse across frameworks — worked example

Control `PTW-001` "Permit-to-work for hot work / confined space / working at height":
- ISO 45001: clause 8.1.2 (Eliminating hazards and reducing OH&S risks)
- Hotel Operational Controls: "Contractor & high-risk work control"
- GRI 403: 403-7 (Prevention and mitigation of impacts directly linked by business relationships)
- SASB Hotels & Lodging: workforce health & safety management metric
- ILO-OSH: hazard identification and risk control element
- UNGC: Principle 1

One `control_assessments` row per property/department/period drives all six framework views. The
`/framework/[framework]` pages are simply filtered views over `control_framework_mappings` joined
to the single current assessment — never a separate assessment table per framework.

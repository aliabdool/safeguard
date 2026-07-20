# KPI Catalogue & Calculation Design

## 1. Metadata every KPI carries (`kpi_definitions` — full field list)

KPI ID/code, name, definition, formula, unit, classification (leading/lagging/assurance),
reporting boundary, inclusion rules, exclusion rules, reporting frequency, data owner, approver,
source tables, framework mapping, target, warning threshold, critical threshold, evidence
requirements, assurance status, version, effective period. (Matches `docs/database-model.md` §9
exactly — not restated field-by-field here to avoid drift; this document focuses on the *content*
of the v1 catalogue and the calculation engine.)

## 2. v1 KPI catalogue (43 KPIs from the specification)

| Code | Name | Classification | Formula (source) | Direction |
|---|---|---|---|---|
| `FATALITIES` | Fatalities | Lagging | `count(incidents where outcome='fatality')` | lower better |
| `TOTAL_INCIDENTS` | Total incidents | Lagging | `count(incidents)` in period/boundary | lower better |
| `EMPLOYEE_INCIDENTS` | Employee incidents | Lagging | `count(incidents where person_type='employee')` | lower better |
| `CONTRACTOR_INCIDENTS` | Contractor incidents | Lagging | `count(incidents where person_type='contractor')` | lower better |
| `GUEST_INCIDENTS` | Guest incidents | Lagging | `count(incidents where person_type='guest')` | lower better |
| `LTI` | Lost-time injuries | Lagging | `count(incidents where lost_workdays > 0)` | lower better |
| `LTIFR` | Lost-Time Injury Frequency Rate | Lagging | `(LTI × 200,000) / total_hours_worked` | lower better |
| `RECORDABLE_INJURIES` | Recordable injuries | Lagging | `count(incidents where outcome in recordable_set)` | lower better |
| `TRIR` | Total Recordable Injury Rate | Lagging | `(RECORDABLE_INJURIES × 200,000) / total_hours_worked` | lower better |
| `SEVERITY_RATE` | Severity rate | Lagging | `(total lost_workdays × 200,000) / total_hours_worked` | lower better |
| `LOST_WORKDAYS` | Lost workdays | Lagging | `sum(incidents.lost_workdays)` | lower better |
| `RESTRICTED_DUTY_CASES` | Restricted-duty cases | Lagging | `count(incidents where restricted_duty_days > 0)` | lower better |
| `RESTRICTED_DUTY_DAYS` | Restricted-duty days | Lagging | `sum(incidents.restricted_duty_days)` | lower better |
| `MTC` | Medical-treatment cases | Lagging | `count(incidents where outcome='medical_treatment')` | lower better |
| `OCC_ILLNESS` | Occupational illnesses | Lagging | `count(incidents where incident_type='occupational_illness')` | lower better |
| `HIGH_POTENTIAL` | High-potential incidents | Leading/Lagging | `count(incidents where is_high_potential)` | lower better |
| `NEAR_MISSES` | Near misses | Leading | `count(incidents where person_type='near_miss')` | higher better (reporting culture) |
| `UNSAFE_CONDITIONS` | Unsafe conditions | Leading | `count(incidents where person_type='unsafe_condition')` | higher better (reporting culture) |
| `HOSPITAL_REFERRALS` | Hospital referrals | Lagging | `count(incidents where hospital_referral)` | lower better |
| `REPEAT_INCIDENTS` | Repeat incidents | Lagging | `count(incidents grouped by location/root_cause having count > 1)` | lower better |
| `INCIDENT_COST` | Incident cost | Lagging | `sum(incidents.incident_cost)` | lower better |
| `GUEST_INC_PER_1000_RN` | Guest incidents per 1,000 occupied room nights | Lagging | `(GUEST_INCIDENTS × 1000) / occupied_room_nights` | lower better |
| `CURRENT_RISK_ASSESSMENTS` | Current risk assessments | Assurance | `count(valid, non-expired risk-assessment documents) / count(required)` | higher better |
| `VALID_CERTIFICATES` | Valid statutory certificates | Assurance | `count(document_versions where category='statutory_certificate' and not expired) / count(required)` | higher better |
| `INSPECTIONS_COMPLETED` | Planned inspections completed | Leading | `count(audits where type='department_inspection' and status='closed') / count(planned)` | higher better |
| `AUDIT_PLAN_COMPLETED` | Audit plan completed | Assurance | `count(audits closed) / count(audits planned)` this period | higher better |
| `INDUCTION_COMPLETION` | Employee induction completion | Leading | training-records source / headcount | higher better |
| `MANDATORY_TRAINING` | Mandatory training completion | Leading | training-records source / required headcount | higher better |
| `CAPA_ON_TIME` | Corrective actions closed on time | Assurance | `count(capa_actions closed by due_date) / count(capa_actions closed)` | higher better |
| `ISO45001_READINESS` | ISO 45001 readiness | Assurance | rollup of `control_assessments` mapped to `ISO45001`, min-of-dimension + critical-gap cap | higher better |
| `LEGAL_COMPLIANCE` | Legal compliance | Assurance | rollup of `control_assessments` mapped to `MU_LEGAL`, min-of-dimension + critical-gap cap | higher better |
| `GRI403_READINESS` | GRI 403 readiness | Assurance | rollup of `control_assessments` mapped to `GRI403` | higher better |
| `IFRS_S1_READINESS` | IFRS S1 readiness | Assurance | rollup of `control_assessments` mapped to `IFRS_S1` | higher better |
| `IFRS_S2_READINESS` | IFRS S2 readiness | Assurance | rollup of `control_assessments` mapped to `IFRS_S2` | higher better |
| `OPEN_CRIT_MAJOR_FINDINGS` | Open critical and major findings | Lagging | `count(audit_findings where classification in ('critical_nc','major_nc') and status != 'closed')` | lower better |
| `EXPIRED_EVIDENCE` | Expired evidence | Assurance | `count(document_versions where expiry_date < now() and status not in ('superseded','archived'))` | lower better |
| `CONTROLS_NO_EVIDENCE` | Controls without evidence | Assurance | `count(control_assessments with dimension score ≥ 2 and no qualifying evidence_links row)` | lower better |
| `CAPA_EFFECTIVENESS` | CAPA effectiveness rate | Assurance | `count(capa_verifications where outcome='effective') / count(capa_verifications)` | higher better |

(The remaining catalogue entries the spec lists — Fatalities through CAPA effectiveness — are all
covered above; every KPI named in the specification has a row. `source_tables` for each is recorded
in the seed data, not duplicated here.)

## 3. Calculation design

1. **On-demand, always recomputable.** Every KPI has a pure calculation function
   (`src/server/kpi/calculations/<code>.ts`) that takes `{ propertyId?, departmentId?, periodStart,
   periodEnd, comparisonPeriodStart?, comparisonPeriodEnd? }` and returns
   `{ currentValue, comparisonValue, includedRecordIds, excludedRecordIds, dataQualityStatus,
   dataThroughDate }`. No KPI value is ever hand-entered.
2. **Cached for dashboard performance and reconciliation**, not for correctness — `kpi_calculations`
   rows are a snapshot with `calculated_at` and the exact included/excluded record IDs, so "View
   calculation" can show precisely what fed a historical dashboard number even after underlying
   records later change (append a new snapshot on every recompute rather than overwrite, or a
   dashboard refresh silently changes what a Board pack showed weeks ago).
3. **Recompute triggers:** on-demand when a user opens `/kpis/[kpiCode]`, and on a schedule
   (`/api/cron/kpi-refresh`) so the default dashboard view is always fast.
4. **RAG status** derives from `target`/`warning_threshold`/`critical_threshold` plus the metric's
   `direction` (lower-is-better vs higher-is-better, per §2 table) — not hard-coded per KPI in the
   UI, computed once in the shared RAG function.
5. **Assurance status** on each snapshot: `unverified` until at least the Effectiveness-level (or
   the KPI's declared minimum) evidence requirement is linked and verified; surfaced next to the
   value so an unverified KPI is visually distinct from a verified one, never silently presented as
   equally reliable.

## 4. Year comparison logic

- `currentYear` = the financial year selected (FY definition configurable per org — default 1
  July–30 June, matching Mauritius hospitality sector convention, confirmed with product owner as
  an assumption, see `implementation-plan.md`).
- If `currentYear` is **incomplete** (today falls within it), the comparison automatically switches
  to **same-period year-to-date** against the comparison year (`comparisonPeriodEnd` clipped to the
  same day-of-year as `data_through_date`), and the dashboard renders an explicit banner: *"Showing
  year-to-date through {date}. Comparison year clipped to the same period for a fair comparison."*
- Comparing a partial year against a full prior year without this clipping is treated as a bug, not
  a configuration option — there is no UI path that produces that comparison silently.

## 5. Reconciliation

"View calculation" always shows: definition, formula, the literal SQL predicate (rendered from the
same function used to compute the value, not a separately maintained description — avoiding the
classic drift between "documented formula" and "actual query"), included/excluded record IDs
(clickable through to the records), source tables, calculation date, current/comparison values,
variance, data-quality checks run (e.g. "3 incidents in scope have no department assigned —
excluded, flagged"), evidence links and their verification status, data owner, and approval status
of the KPI definition itself (a KPI definition can be Draft/Approved, independent of its computed
value being available).

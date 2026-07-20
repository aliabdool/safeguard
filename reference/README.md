# Reference Materials

This folder holds non-code reference material for Sunlife SafeGuard. It is not part of the
application build (no code in this repo imports anything from here).

## Prototype HTML (missing — action required)

The original visual/workflow prototype, `SafeGuard_HS_Management_Assurance_Prototype.html`,
was **not present in the repository** when the Phase 0 → Phase 5 rebuild began (2026-07-18).
The repository had no commits and no branches at that time.

**Action for the product owner:** drop the original prototype file into this folder as
`reference/SafeGuard_HS_Management_Assurance_Prototype.html` whenever it becomes available.

### Why the missing file did not block the rebuild

The application was designed and built directly from the detailed written specification
supplied for this project (roles, workflows, fields, KPI catalogue, framework list, security
and audit requirements). That specification is more precise than a visual prototype for the
purposes of database schema, RLS policy, and API design, so the backend, data model, and
workflow logic are **not** at risk of rework once the prototype is supplied.

What *may* change once the prototype is available and reviewed:

- Visual design tokens (colours, typography, spacing) — Tailwind theme / shadcn `theme.css`
- Page layout and information density — component composition only
- Copy/wording on screens
- Chart choices/layout on dashboards (data source and calculation logic will not change)

What will **not** change to accommodate the prototype:

- Database schema and migrations
- RLS policies and permission model
- API/server-action contracts
- Audit trail design
- KPI calculation logic

This separation is deliberate (see `docs/system-architecture.md` § "Presentation/Domain
separation") specifically so the prototype can be aligned into the UI layer later without a
backend rebuild. See `docs/implementation-plan.md` for the assumption record (ADR-0001).

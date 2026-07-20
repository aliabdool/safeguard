# Roles & Permissions

## 1. Role catalogue (seeded into `roles`)

| Code | Name | Typical scope |
|---|---|---|
| `SUPER_ADMIN` | Super Administrator | All properties, all admin functions, **no** medical access by default |
| `GROUP_HS_ADMIN` | Group Health and Safety Administrator | All properties, H&S data, admin functions except identity/infra config |
| `PROPERTY_HS_OFFICER` | Property Health and Safety Officer | One or more assigned properties, all departments within them |
| `INTERNAL_AUDITOR` | Internal Auditor | Assigned properties, audit module full access, read across incidents/CAPA for audit purposes |
| `DEPARTMENT_MANAGER` | Department Manager | Assigned property + department(s) |
| `DUTY_MANAGER` | Duty Manager | Assigned property, cross-department incident reporting/first response |
| `NURSE_MEDICAL` | Nurse or Medical User | Assigned property; **requires** separate medical-data permission grant to see clinical detail |
| `INCIDENT_REPORTER` | Incident Reporter | Assigned property/department, report-only (no investigation/CAPA authority) |
| `EXECUTIVE_READONLY` | Executive Read-Only User | Group-wide, read-only dashboards, no medical, no PII detail (aggregated/redacted views) |
| `EXTERNAL_AUDITOR_READONLY` | External Auditor Read-Only User | Specific properties/audits, read-only, time-boxed (`external_expiry_date` required) |

A user may hold more than one role (`user_roles` is many-to-many) — e.g. a Department Manager who
is also an Incident Reporter. Effective permission is the **union** of all held roles' grants,
still bounded by the user's explicit property/department assignments.

## 2. Permission matrix

Legend: **F** full (create/edit/close), **C** create/contribute only, **V** view, **VR** view
redacted/aggregated only, **—** none. Medical column is independent of role — see §3.

| Capability | Super Admin | Group HS Admin | Property HS Officer | Internal Auditor | Dept Manager | Duty Manager | Nurse/Medical | Incident Reporter | Executive RO | External Auditor RO |
|---|---|---|---|---|---|---|---|---|---|---|
| Report incident | F | F | F | V | C | C | C | C | — | — |
| Investigate incident | F | F | F | V | C (own dept) | C | — | — | — | — |
| Assign investigator | F | F | F | — | — | — | — | — | — | — |
| CAPA create/own | F | F | F | C (findings) | C | C | — | — | — | — |
| CAPA verify/close | F | F | F | — | V | — | — | — | — | — |
| Medical record access | Permission-gated | Permission-gated | Permission-gated | — | — | Permission-gated | Permission-gated | — | — | — |
| Control assessments | F | F | F | F (audit-linked) | V | — | — | — | VR | V (assigned) |
| Audit programme mgmt | F | F | V (own property) | F | — | — | — | — | V | V (assigned) |
| Audit execution | F | F | C | F | — | — | — | — | — | V (assigned) |
| Findings mgmt | F | F | C | F | V (own) | — | — | — | V | V (assigned) |
| Document upload/approve | F | F | C/F (property-scoped) | C | C | — | — | — | — | — |
| Document view (approved) | F | F | F | F | V (applicable) | V (applicable) | V (applicable) | V (applicable) | V | V (assigned) |
| KPI catalogue edit | F | F | — | — | — | — | — | — | — | — |
| Dashboards | F | F | F (own property) | F | V (own dept) | V (own property) | — | — | F (group, redacted) | V (assigned, redacted) |
| Data export | F | F | F (own property) | F | V | — | — | — | F (redacted) | — |
| User admin console | F | F (excl. Super Admin mgmt) | — | — | — | — | — | — | — | — |
| Audit-log viewing | F | F | — | — | — | — | — | — | — | — |

## 3. Medical-data permission (orthogonal to role)

- `user_medical_permission` is a **separate grant**, made by an admin, independent of role.
- Only `NURSE_MEDICAL` is *expected* to typically hold it, but the system does not hard-code that —
  in a small-property scenario a Duty Manager with first-aid responsibility might legitimately be
  granted it. `SUPER_ADMIN`/`GROUP_HS_ADMIN` do **not** receive it automatically; if an admin needs
  to see medical detail (e.g. investigating a serious incident personally) it must be explicitly
  granted, which itself is an `audit_log` event (`role_changes`/medical-permission-granted).
- Every access to `medical_records`/`medical_attachments` — grant or denial — is auditable; grants
  additionally require a `reason` (spec: "Reason where required").

## 4. Property & department scoping

- Property access (`user_property_access`) is the outer boundary — a user with no grant for a
  property sees nothing from it, regardless of role, except `EXECUTIVE_READONLY` which is
  group-wide by definition (still redacted/aggregated, never raw incident detail with PII).
- Department access (`user_department_access`) is scoped *within* a granted property. A Property
  H&S Officer typically gets all departments at their property(s) granted at once; a Department
  Manager gets only their department(s).
- `INTERNAL_AUDITOR` and `EXTERNAL_AUDITOR_READONLY` get property access scoped to their assigned
  audits, not blanket property access — assignment happens via `audit_team_members`, and RLS for
  audit-relevant tables additionally accepts "is on the audit team for an audit at this property".

## 5. Registration → active-access lifecycle

```
sign up / accept invite → PENDING_APPROVAL (no protected routes reachable)
        │
        ▼
admin reviews registration_requests row
        │
   ┌────┴────┐
   ▼         ▼
APPROVED   REJECTED → profiles.status = 'rejected', audit_log entry, user notified
   │
   ▼
admin assigns: role(s), propert(y/ies), department(s), medical permission (if applicable)
   │
   ▼
profiles.status = 'active' → protected routes reachable, scoped per grants above
```

`PENDING_APPROVAL` and `rejected` users are blocked at all three enforcement layers (app-layer
`(app)` layout redirect, RLS `app_auth.is_active()` predicate on every scoped table, Storage policy
mirroring the same predicate) — not just a UI redirect.

## 6. Suspension & reactivation

- `SUSPENDED`: immediate effect on next request regardless of token validity (checked in `(app)`
  layout, not just at login). Admin action logs `reason` (required field per audit-trail spec).
- Reactivation restores prior role/property/department grants (not re-prompted from scratch) unless
  the admin explicitly changes them at reactivation time.
- Session revocation is a distinct action from suspension (an admin may revoke sessions without
  suspending, e.g. suspected credential compromise while investigation is pending).

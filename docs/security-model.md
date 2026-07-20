# Security Model

## 1. Threat model summary

Assets to protect: incident/medical records (special-category personal data), guest PII
(GDPR-relevant for international guests, Mauritius DPA for all data subjects), controlled
documents, audit findings (reputational/legal sensitivity), user credentials/sessions.
Primary adversaries considered: an authenticated low-privilege user attempting horizontal privilege
escalation (viewing another property's data) or vertical escalation (medical data, admin functions);
an external party attempting credential stuffing / session hijack; a compromised client bundle
attempting to call privileged endpoints directly.

## 2. Defense in depth — three enforcement layers, always all three

1. **Application layer** — every Server Action/Route Handler checks role + property + department +
   (where relevant) medical permission before running any query. See `system-architecture.md` §5.
2. **Row-Level Security** — every table containing property/department-scoped or medical data has
   RLS enabled and `FORCE ROW LEVEL SECURITY` set, including for the table owner, so a bug in
   application-layer scoping cannot silently over-fetch.
3. **Storage policy** — private buckets, policy predicates mirror the RLS logic for the
   corresponding domain table (see §6).

The interface must never be the only thing hiding a capability — hidden buttons are UX, not
security, per the spec's explicit instruction.

## 3. RLS design

### 3.1 Helper functions (SQL, `security definer`, schema `app_auth`)

To avoid repeating multi-join predicates in every policy (which also hurts planner performance),
Phase 1 creates a small set of `stable` SQL functions callable from policies:

- `app_auth.current_profile_status() returns text`
- `app_auth.has_role(role_code text) returns boolean`
- `app_auth.has_any_role(role_codes text[]) returns boolean`
- `app_auth.has_property_access(p_property_id uuid) returns boolean`
- `app_auth.has_department_access(p_property_id uuid, p_department_id uuid) returns boolean`
- `app_auth.has_medical_permission() returns boolean`
- `app_auth.is_active() returns boolean` — `profiles.status = 'active'`

All read `auth.uid()` internally. Marked `stable` (not `volatile`) so the planner can cache the
result within a statement.

### 3.2 Canonical policy pattern

For a scoped table (e.g. `incidents`):

```sql
alter table incidents enable row level security;
alter table incidents force row level security;

create policy incidents_select on incidents for select
  using (
    app_auth.is_active()
    and app_auth.has_property_access(property_id)
    and (
      app_auth.has_any_role(array['SUPER_ADMIN','GROUP_HS_ADMIN'])
      or app_auth.has_department_access(property_id, department_id)
      or app_auth.has_any_role(array['EXECUTIVE_READ_ONLY']) -- group rollups, no dept filter
    )
  );

create policy incidents_insert on incidents for insert
  with check (
    app_auth.is_active()
    and app_auth.has_property_access(property_id)
    and app_auth.has_any_role(array['INCIDENT_REPORTER','DUTY_MANAGER','DEPARTMENT_MANAGER',
                                     'PROPERTY_HS_OFFICER','GROUP_HS_ADMIN','SUPER_ADMIN'])
  );
```

`update`/`delete` policies are narrower still (e.g. only the assigned investigator or a H&S
Officer/Admin can transition `investigations`; `capa_actions.status = 'closed'` transition policy
additionally checks `final_approved_by <> owner_id` at the RLS layer as a second, independent
check beyond the application-layer check).

### 3.3 Medical data isolation

`medical_records` and `medical_attachments` RLS ignores role entirely except for
`app_auth.has_medical_permission()`:

```sql
create policy medical_records_select on medical_records for select
  using (app_auth.is_active() and app_auth.has_medical_permission()
         and app_auth.has_property_access(
               (select property_id from incidents where incidents.id = medical_records.incident_id)));
```

Super Administrator is **not** in this predicate. A Super Admin without an explicit
`user_medical_permission` grant gets zero rows, same as anyone else. This is tested explicitly in
the RLS integration test suite (Phase 5) as a named test case, since it's the single easiest rule
to accidentally regress.

### 3.4 Audit trail integrity

```sql
alter table audit_log enable row level security;
alter table audit_log force row level security;
create policy audit_log_insert on audit_log for insert with check (true); -- app layer decides what's written
create policy audit_log_select on audit_log for select
  using (app_auth.has_any_role(array['SUPER_ADMIN','GROUP_HS_ADMIN']) or actor_id = auth.uid());
revoke update, delete on audit_log from authenticated, anon;
```

No `update`/`delete` policy exists at all (RLS defaults to deny), and the grants are revoked at the
Postgres role level too — belt and braces, so even a future migration that adds a broad policy
elsewhere by accident can't reopen it.

## 4. Storage design

Five private buckets exactly as specified: `incident-evidence`, `controlled-documents`,
`audit-evidence`, `capa-evidence`, `restricted-medical`. All `public = false`.

- **Upload path:** client requests a signed *upload* URL from a Server Action, which first runs the
  same permission check as the corresponding domain table, validates declared MIME type + extension
  + size against an allow-list before minting the URL, then records a `pending` row in `files`. On
  upload-complete webhook (or client-confirmed callback), the server computes/verifies the SHA-256
  checksum server-side (never trusts a client-supplied checksum) and flips `validation_status`.
- **Download path:** always via a short-lived signed URL (default 5 minutes) minted by a Server
  Action after the same permission check; every issuance writes a `file_access_log` row and an
  `audit_log` "document_download"/"medical_record_access" event. The browser never receives a
  long-lived or public URL.
- **Storage RLS policies** mirror the owning domain table's predicate (e.g. `restricted-medical`
  bucket policy also requires `has_medical_permission()`), so even a leaked signed-URL-minting bug
  is caught by Storage's own policy layer.
- File-size limits (per bucket, e.g. 15 MB photos, 50 MB documents), MIME allow-list, and extension
  allow-list are enforced both client-side (fast feedback) and server-side (the only check that
  matters security-wise).

## 5. AuthN/session security

- Supabase Auth, email+password with mandatory email verification before first login completes.
- Secure, `HttpOnly`, `SameSite=Lax` session cookies via `@supabase/ssr` — no tokens in
  `localStorage`.
- CSRF: Server Actions are POST-only and same-origin by default under Next.js's built-in Origin
  check; Route Handlers that mutate state additionally verify `Origin`/`Referer` and use
  double-submit tokens for any form not using a Server Action directly.
- Rate limiting: login, password-reset request, and registration endpoints rate-limited per-IP and
  per-email via Cloudflare (Workers rate-limiting rule / KV-backed token bucket), since Workers
  hosting gives us edge-level rate limiting for free rather than building it in-app.
- Session revocation: admin "revoke session" calls Supabase Admin API to invalidate refresh tokens;
  reflected within one request due to short-lived access tokens (Supabase default 1 hour, can be
  tuned down for this app in project auth settings).
- Account suspension (`profiles.status = 'suspended'`) is checked in the `(app)` layout on every
  request, independent of whether the session token is still technically valid — so suspension is
  effective immediately, not only at next token refresh.
- External users (`is_external = true`, e.g. External Auditor Read-Only) require
  `external_expiry_date`; a scheduled job auto-suspends on expiry and logs it.

## 6. Application security controls

- **Input validation:** Zod schemas at every Server Action boundary, shared between client-side
  form validation and server-side re-validation (never trust client validation alone).
- **Output encoding:** React's default JSX escaping; any place that renders user content as HTML
  (none planned in v1 — all rich text is rendered as plain text/markdown-to-safe-subset) goes
  through a sanitizer, never `dangerouslySetInnerHTML` with raw user input.
- **Content Security Policy:** strict CSP set via Next.js `headers()`/middleware —
  `default-src 'self'`, `img-src 'self' <supabase-storage-domain> data:`,
  `connect-src 'self' <supabase-project-domain>`, no `unsafe-inline` script (nonce-based for the
  few inline bootstrap scripts Next.js itself needs), no third-party analytics/trackers in v1.
- **Secret management:** Cloudflare encrypted secrets (`wrangler secret put`) per environment;
  `.env.local` for local dev only, gitignored; `NEXT_PUBLIC_*` restricted to the Supabase URL and
  anon key only — the anon key is safe to expose by design (it's meaningless without RLS, which is
  always on). The service-role key is **never** referenced in any file under `src/app/**/page.tsx`,
  `src/components/**`, or anything bundled client-side; it's confined to a small
  `src/server/service-role.ts` module imported only by Route Handlers/Server Actions that need it,
  and a lint rule (`no-restricted-imports`) blocks importing that module from client components.
- **Data minimisation:** guest/public incident records store only what's operationally necessary
  (no guest ID/passport numbers captured for incident records; if hotel operations later needs
  that, it's a deliberate, reviewed schema change, not a default field).
- **Retention:** `documents.retention_period_months` drives a scheduled job that flags (not
  auto-deletes) records past retention for admin review — auto-deletion of anything tied to an
  incident/audit trail is never automatic, given legal-hold implications.
- **Backup & recovery:** Production Supabase project on a tier with point-in-time recovery;
  documented RPO/RTO targets and restore drill cadence are a Phase 5 deliverable once the
  Production project exists (needs credentials — tracked as open item).
- **Logging:** security-relevant events (failed logins, permission denials, suspicious rate-limit
  triggers) go to both `audit_log` (business-readable) and Cloudflare's request logging
  (operational/security-readable), kept separate so `audit_log` stays free of noise per the spec's
  "no passwords/secrets" rule.

## 7. Compliance posture (Mauritius DPA + GDPR-aware)

- Lawful basis documented per data category (employment contract/legal obligation for employee
  incident data, legitimate interest for guest incident data, explicit consent captured
  separately wherever medical detail is recorded for a non-employee).
- Data subject rights (access/rectification/erasure-with-legal-hold-exception) are a Phase 5+
  admin-console capability, scoped after core workflows are live — recorded as a Phase 5 task, not
  dropped.
- Cross-border transfer: Supabase project region pinned to a region consistent with guest data
  residency expectations — **decision required from product owner**, see
  `docs/implementation-plan.md` §Decisions requiring approval.

## 8. Known residual risks (Phase 0 assessment)

1. **Polymorphic FKs** (`capa_actions.source_id`, `evidence_links.linked_entity_id`) trade referential
   integrity at the DB layer for schema flexibility — mitigated by application-layer validation and
   an integration test asserting every polymorphic reference resolves, run in CI.
2. **Edge runtime + pooled Postgres** — Cloudflare Workers' connection model means every request
   pays a pooler round-trip; mitigated by keeping hot-path queries narrow and indexed (see
   database-model §12), revisit with Hyperdrive caching once real traffic patterns exist.
3. **Signed URL exfiltration window** — a signed download URL, once issued, is valid for its TTL
   even if permissions change a second later; mitigated by short TTL (5 min) and access logging
   (detective control), not eliminated (this is an inherent property of signed URLs).
4. **Single Postgres instance for RLS-critical logic** — a Drizzle migration mistake that disables
   `FORCE ROW LEVEL SECURITY` on a new table is a silent regression; mitigated by a Phase 5 CI check
   that asserts RLS+FORCE is enabled on every table in the target schema before deploy.

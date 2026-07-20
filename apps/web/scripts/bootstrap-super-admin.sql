-- One-time cold-start script: promotes exactly one already-registered user to Super
-- Administrator. See docs/implementation-plan.md §7 for the full procedure.
--
-- This is deliberately NOT exposed through the application UI or any API route — there is no
-- in-app path that can self-grant Super Administrator. Run this by hand, once, directly against
-- the target Supabase project (SQL editor or `psql` with the postgres/service-role connection
-- string), only after the intended person has completed normal registration through the app.
--
-- Usage: replace the email below, then run this whole script in the Supabase SQL editor.

do $$
declare
  target_email text := 'REPLACE_WITH_SUPER_ADMIN_EMAIL@example.com';
  target_user_id uuid;
  super_admin_role_id uuid;
begin
  select id into target_user_id from auth.users where email = target_email;
  if target_user_id is null then
    raise exception 'No auth.users row for %. They must complete registration through the app first.', target_email;
  end if;

  select id into super_admin_role_id from public.roles where code = 'SUPER_ADMIN';
  if super_admin_role_id is null then
    raise exception 'SUPER_ADMIN role not found — run the seed script (npm run db:seed) first.';
  end if;

  update public.profiles
    set status = 'active', approved_by = target_user_id, approved_at = now(), updated_at = now()
    where id = target_user_id;

  insert into public.user_roles (user_id, role_id, granted_by)
    values (target_user_id, super_admin_role_id, target_user_id)
    on conflict do nothing;

  insert into public.audit_log (actor_id, event_type, entity_type, entity_id, reason)
    values (target_user_id, 'registration_approved', 'profiles', target_user_id,
      'Bootstrap: first Super Administrator, promoted via bootstrap-super-admin.sql');

  raise notice 'Promoted % (%) to SUPER_ADMIN.', target_email, target_user_id;
end $$;

-- Note: this does NOT grant property/department access or medical permission — a Super
-- Administrator only needs those explicitly if they intend to work property-scoped data or
-- medical records directly, per docs/roles-permissions.md §2-3. Grant those separately from the
-- admin console once logged in, if needed.

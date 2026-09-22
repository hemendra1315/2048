-- ====================================================================
-- READ-ONLY security verification queries for production.
-- Run in the Supabase SQL editor. Nothing here changes data.
-- Expected results are noted above each query.
-- ====================================================================

-- 1. Super admins. Expect: only accounts you promoted with grant_super_admin(),
--    each with has_secrets = true, a normal (non @vault.local) email, status active.
select p.id, p.username, p.uid, p.status, p.created_at,
       u.email,
       exists (select 1 from public.account_secrets s where s.user_id = p.id) as has_secrets
from public.profiles p
left join auth.users u on u.id = p.id
where p.role = 'super_admin'
order by p.created_at;

-- 2. Accounts created outside the approved flow. Expect: 0 rows.
--    (every profile made by vault-auth has an account_secrets row; @vault.local came from the unsafe script)
select p.id, p.username, p.role, p.status, u.email
from public.profiles p
left join auth.users u on u.id = p.id
where not exists (select 1 from public.account_secrets s where s.user_id = p.id)
   or u.email ilike '%@vault.local';

-- 3. Auth users with no profile (direct sign-ups through the public Auth API). Review every row.
select u.id, u.email, u.created_at, u.raw_user_meta_data
from auth.users u
left join public.profiles p on p.id = u.id
where p.id is null
order by u.created_at desc;

-- 4. Audit trail of role changes. Expect: one GRANT_SUPER_ADMIN per admin you promoted.
select created_at, action_type, admin_id, target_user_id, metadata
from public.admin_access_log
where action_type in ('GRANT_SUPER_ADMIN', 'REVOKE_SUPER_ADMIN')
order by created_at desc;

-- 5. RLS enabled on every public table. Expect: rls_enabled = true for all rows.
select c.relname as table_name, c.relrowsecurity as rls_enabled, c.relforcerowsecurity as rls_forced
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r'
order by 1;

-- 6. All RLS policies. Expect: none of the names below, and no qual/with_check equal to 'true'.
--    Must NOT exist: "Profiles are readable by authenticated users", "Users can insert own profile",
--    "Users can update own profile or super admin", "Members can view messages", "Members can send messages",
--    "Users can view own gallery or super admin", "Users can insert own gallery", "Users can delete own gallery",
--    "admin_access_log_insert_policy".
select schemaname, tablename, policyname, cmd, roles, qual, with_check
from pg_policies
where schemaname in ('public', 'storage')
order by schemaname, tablename, policyname;

-- 6b. Policies that allow everything. Expect: 0 rows.
select schemaname, tablename, policyname, cmd, qual, with_check
from pg_policies
where schemaname in ('public', 'storage')
  and (trim(coalesce(qual, '')) = 'true' or trim(coalesce(with_check, '')) = 'true');

-- 7. Storage buckets. Expect: gallery public = false (avatars public = true is by design).
select id, name, public, file_size_limit, allowed_mime_types from storage.buckets order by id;

-- 8. Table privileges for anon. Expect: 0 rows.
select table_name, privilege_type
from information_schema.role_table_grants
where grantee = 'anon' and table_schema = 'public'
order by 1, 2;

-- 9. Table privileges for authenticated on sensitive tables. Expect: 0 rows.
select table_name, privilege_type
from information_schema.role_table_grants
where grantee = 'authenticated' and table_schema = 'public'
  and table_name in ('account_secrets', 'auth_throttle', 'webauthn_challenges')
order by 1, 2;

-- 9b. authenticated must not be able to INSERT profiles. Expect: 0 rows.
select privilege_type from information_schema.role_table_grants
where grantee = 'authenticated' and table_schema = 'public' and table_name = 'profiles' and privilege_type = 'INSERT';

-- 10. SECURITY DEFINER functions: who can execute them, and whether search_path is pinned.
--     Expect: search_path set on every row; anon only on nothing sensitive;
--     grant_super_admin / revoke_super_admin executable by nobody except the owner.
select p.proname,
       pg_get_function_identity_arguments(p.oid) as args,
       p.proconfig as settings,
       has_function_privilege('anon', p.oid, 'EXECUTE') as anon_exec,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') as auth_exec,
       has_function_privilege('service_role', p.oid, 'EXECUTE') as service_exec
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.prosecdef
order by p.proname;

-- 11. Old client-trusting functions. Expect: 0 rows.
select proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and proname in ('biometric_login_user', 'login_frictionless_user', 'register_frictionless_user',
                  'reset_user_pin', 'reset_user_password', 'update_profile_frictionless', 'handle_new_user');

-- 12. Triggers that protect profiles and requests. Expect: guard_profile_insert, guard_profile_update,
--     guard_connection_request, guard_conversation_member present; no on_auth_user_created.
select event_object_schema, event_object_table, trigger_name, action_timing, event_manipulation
from information_schema.triggers
where trigger_name in ('guard_profile_insert', 'guard_profile_update', 'guard_connection_request',
                       'guard_conversation_member', 'on_auth_user_created')
order by 2, 3;

-- 13. Roles with BYPASSRLS. Expect: only postgres / supabase internal roles and service_role.
select rolname, rolbypassrls, rolsuper from pg_roles where rolbypassrls or rolsuper order by 1;

-- 14. Applied migrations. Expect: through 20260923000006.
select version, name from supabase_migrations.schema_migrations order by version;

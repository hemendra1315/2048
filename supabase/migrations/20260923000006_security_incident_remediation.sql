-- Migration: 20260923000006_security_incident_remediation.sql
--
-- Security incident remediation. Safe to run whether or not the unsafe bootstrap script
-- (supabase/init_schema_and_admin.sql, now replaced) was ever executed. Every statement is idempotent.
--
-- 1. Removes the permissive policies that script added (RLS policies are OR-combined, so one
--    permissive policy silently overrides every stricter one on the same table).
-- 2. Blocks end users from inserting their own profile rows (profiles are created only by the
--    vault-auth Edge Function with the service role).
-- 3. Forces the private gallery bucket back to private.
-- 4. Restores the audit-log insert check that the acting admin must be the caller.
-- 5. Pins search_path on log_admin_action (SECURITY DEFINER).
-- 6. Neutralises super-admin accounts created outside the approved flow (no account_secrets row),
--    including the account the old bootstrap script created with a password committed to git.

-- ---------------------------------------------------------------------------
-- 1. Permissive policies from the unsafe bootstrap script
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Profiles are readable by authenticated users" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile or super admin" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
DROP POLICY IF EXISTS "Members can view messages" ON public.messages;
DROP POLICY IF EXISTS "Members can send messages" ON public.messages;
DROP POLICY IF EXISTS "Users can view own gallery or super admin" ON public.gallery_items;
DROP POLICY IF EXISTS "Users can insert own gallery" ON public.gallery_items;
DROP POLICY IF EXISTS "Users can delete own gallery" ON public.gallery_items;

-- ---------------------------------------------------------------------------
-- 2. Profiles are provisioned only by the server
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_profile_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
BEGIN
  IF coalesce(auth.role(), '') IN ('authenticated', 'anon') THEN
    RAISE EXCEPTION 'Profiles are created by the server during sign-up' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$func$;

DROP TRIGGER IF EXISTS guard_profile_insert ON public.profiles;
CREATE TRIGGER guard_profile_insert
  BEFORE INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.guard_profile_insert();

REVOKE INSERT ON public.profiles FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_profile_insert() FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Private gallery bucket
-- ---------------------------------------------------------------------------
UPDATE storage.buckets SET public = FALSE WHERE id = 'gallery' AND public IS DISTINCT FROM FALSE;

-- ---------------------------------------------------------------------------
-- 4. Audit log: the acting admin recorded in a row must be the caller
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "admin_access_log_insert_policy" ON public.admin_access_log;
DROP POLICY IF EXISTS "admin_log_insert_policy" ON public.admin_access_log;
CREATE POLICY "admin_log_insert_policy" ON public.admin_access_log
  FOR INSERT TO authenticated WITH CHECK (public.is_super_admin() AND admin_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 5. SECURITY DEFINER hygiene
-- ---------------------------------------------------------------------------
ALTER FUNCTION public.log_admin_action(TEXT, UUID, TEXT, JSONB) SET search_path = public;
ALTER FUNCTION public.is_super_admin() SET search_path = public;
REVOKE ALL ON FUNCTION public.log_admin_action(TEXT, UUID, TEXT, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.log_admin_action(TEXT, UUID, TEXT, JSONB) TO authenticated;

-- ---------------------------------------------------------------------------
-- 6. Super admins created outside the approved flow
-- ---------------------------------------------------------------------------
-- Every account created by the vault-auth Edge Function (or migrated by 20260923000003) has an
-- account_secrets row. A super admin without one was inserted directly into the database.
-- It is demoted and suspended (not deleted, so its data remains available for review), and any
-- password it had is replaced with a random one. Re-promote a legitimate account with
-- grant_super_admin() after it signs in through the app.
DO $remediate$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT p.id, p.username, p.uid
    FROM public.profiles p
    WHERE p.role = 'super_admin'
      AND (
        NOT EXISTS (SELECT 1 FROM public.account_secrets s WHERE s.user_id = p.id)
        OR EXISTS (SELECT 1 FROM auth.users u WHERE u.id = p.id AND u.email ILIKE '%@vault.local')
      )
  LOOP
    UPDATE public.profiles SET role = 'user', status = 'suspended', updated_at = NOW() WHERE id = r.id;
    UPDATE auth.users
    SET encrypted_password = extensions.crypt(encode(extensions.gen_random_bytes(32), 'hex'), extensions.gen_salt('bf', 10))
    WHERE id = r.id;
    INSERT INTO public.admin_access_log (admin_id, action_type, target_user_id, metadata)
    VALUES (NULL, 'REVOKE_SUPER_ADMIN', r.id,
            jsonb_build_object('reason', 'security_incident_remediation: super admin created outside approved flow',
                               'username', r.username, 'uid', r.uid));
  END LOOP;
END;
$remediate$;

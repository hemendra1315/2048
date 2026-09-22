-- Migration: 20260923000004_super_admin_tools.sql
--
-- 1. public.grant_super_admin(username, uid): promotes an existing, normally registered account.
--    It can only be run by the database owner (Supabase SQL editor / CLI). No API role
--    (anon, authenticated or service_role) can execute it, so there is no way to become an
--    admin through the app, the REST API or the Edge Function.
-- 2. Server-side admin actions for the Super Admin hub. Each one checks is_super_admin()
--    (i.e. auth.uid() of the signed-in caller) and writes the audit log in the same transaction.

-- ---------------------------------------------------------------------------
-- 1. Promotion (SQL editor only)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.grant_super_admin(p_username TEXT, p_uid TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  v_profile public.profiles;
  v_uid TEXT := NULLIF(UPPER(TRIM(coalesce(p_uid, ''))), '');
  v_uid_changed BOOLEAN := FALSE;
BEGIN
  SELECT * INTO v_profile FROM public.profiles WHERE username = LOWER(TRIM(p_username)) FOR UPDATE;
  IF v_profile.id IS NULL THEN
    RAISE EXCEPTION 'No account named "%". Register it in the app first, then run this again.', p_username;
  END IF;

  IF v_uid IS NOT NULL AND v_uid IS DISTINCT FROM v_profile.uid THEN
    IF v_uid !~ '^[A-Z]{2,12}-[0-9]{4}$' THEN
      RAISE EXCEPTION 'UID must look like WORD-1234';
    END IF;
    IF EXISTS (SELECT 1 FROM public.profiles WHERE uid = v_uid AND id <> v_profile.id) THEN
      RAISE EXCEPTION 'UID % is already used by another account', v_uid;
    END IF;
    v_uid_changed := TRUE;
  END IF;

  UPDATE public.profiles
  SET role = 'super_admin',
      status = 'active',
      uid = CASE WHEN v_uid_changed THEN v_uid ELSE uid END,
      updated_at = NOW()
  WHERE id = v_profile.id;

  INSERT INTO public.admin_access_log (admin_id, action_type, target_user_id, target_resource_id, metadata)
  VALUES (
    NULL, 'GRANT_SUPER_ADMIN', v_profile.id, NULL,
    jsonb_build_object(
      'granted_via', 'sql',
      'previous_role', v_profile.role,
      'previous_status', v_profile.status,
      'previous_uid', CASE WHEN v_uid_changed THEN v_profile.uid END
    )
  );

  RETURN jsonb_build_object(
    'id', v_profile.id,
    'username', v_profile.username,
    'uid', CASE WHEN v_uid_changed THEN v_uid ELSE v_profile.uid END,
    'role', 'super_admin',
    'status', 'active',
    'previous_role', v_profile.role,
    'previous_status', v_profile.status,
    'registered_at', v_profile.created_at
  );
END;
$func$;

CREATE OR REPLACE FUNCTION public.revoke_super_admin(p_username TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  v_id UUID;
BEGIN
  UPDATE public.profiles SET role = 'user', updated_at = NOW()
  WHERE username = LOWER(TRIM(p_username)) AND role = 'super_admin'
  RETURNING id INTO v_id;
  IF v_id IS NULL THEN
    RAISE EXCEPTION 'No super admin named "%"', p_username;
  END IF;
  INSERT INTO public.admin_access_log (admin_id, action_type, target_user_id, metadata)
  VALUES (NULL, 'REVOKE_SUPER_ADMIN', v_id, jsonb_build_object('revoked_via', 'sql'));
  RETURN jsonb_build_object('id', v_id, 'role', 'user');
END;
$func$;

REVOKE ALL ON FUNCTION public.grant_super_admin(TEXT, TEXT) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.revoke_super_admin(TEXT) FROM PUBLIC, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. Admin actions used by the Super Admin hub
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_set_user_status(p_target UUID, p_status public.account_status, p_reason TEXT DEFAULT NULL)
RETURNS public.profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  v_row public.profiles;
  v_before public.account_status;
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Access denied: super admin only' USING ERRCODE = '42501';
  END IF;
  IF p_target = auth.uid() THEN
    RAISE EXCEPTION 'You cannot change your own status' USING ERRCODE = '42501';
  END IF;

  SELECT status INTO v_before FROM public.profiles WHERE id = p_target;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'User not found';
  END IF;
  IF EXISTS (SELECT 1 FROM public.profiles WHERE id = p_target AND role = 'super_admin') THEN
    RAISE EXCEPTION 'Super admins can only be changed from the database console' USING ERRCODE = '42501';
  END IF;

  UPDATE public.profiles SET status = p_status, updated_at = NOW() WHERE id = p_target RETURNING * INTO v_row;

  INSERT INTO public.admin_access_log (admin_id, action_type, target_user_id, metadata)
  VALUES (
    auth.uid(),
    CASE p_status WHEN 'banned' THEN 'BAN_USER' WHEN 'suspended' THEN 'SUSPEND_USER' ELSE 'UNBAN_USER' END,
    p_target,
    jsonb_build_object('reason', NULLIF(TRIM(coalesce(p_reason, '')), ''), 'previous_status', v_before)
  );
  RETURN v_row;
END;
$func$;

CREATE OR REPLACE FUNCTION public.admin_delete_gallery_item(p_item_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  v_item public.gallery_items;
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Access denied: super admin only' USING ERRCODE = '42501';
  END IF;
  DELETE FROM public.gallery_items WHERE id = p_item_id RETURNING * INTO v_item;
  IF v_item.id IS NULL THEN
    RAISE EXCEPTION 'Item not found';
  END IF;
  INSERT INTO public.admin_access_log (admin_id, action_type, target_user_id, target_resource_id, metadata)
  VALUES (auth.uid(), 'DELETE_GALLERY_ITEM', v_item.user_id, v_item.id::TEXT,
          jsonb_build_object('storage_path', v_item.storage_path));
  RETURN v_item.storage_path;  -- the caller removes the file from storage (admins may delete in the gallery bucket)
END;
$func$;

REVOKE ALL ON FUNCTION public.admin_set_user_status(UUID, public.account_status, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_delete_gallery_item(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_user_status(UUID, public.account_status, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_delete_gallery_item(UUID) TO authenticated;

-- =============================================================================
-- Migration: 20260924000015_no_external_avatars.sql
-- Avatars no longer come from api.dicebear.com. Loading them sent every user's ID to a third
-- party each time a profile was shown. People without a photo now get initials, drawn in the app.
--   1. auth_provision_profile() stops giving new accounts a dicebear avatar_url.
--   2. Existing dicebear avatar_url values are cleared (the image was generated from the uid,
--      so nothing the user chose is lost).
-- =============================================================================

-- 1. Sign-up: same as 20260923000003 without the dicebear avatar.
CREATE OR REPLACE FUNCTION public.auth_provision_profile(p_user_id UUID, p_username TEXT, p_password TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $func$
DECLARE
  v_username TEXT := LOWER(TRIM(p_username));
  v_code TEXT;
  v_hex TEXT;
BEGIN
  IF v_username !~ '^[a-z0-9_]{2,24}$' THEN
    RAISE EXCEPTION 'invalid_username';
  END IF;
  IF EXISTS (SELECT 1 FROM public.profiles WHERE username = v_username) THEN
    RAISE EXCEPTION 'username_taken';
  END IF;

  v_hex := upper(encode(gen_random_bytes(8), 'hex'));
  v_code := 'RC-' || substr(v_hex, 1, 4) || '-' || substr(v_hex, 5, 4) || '-' || substr(v_hex, 9, 4) || '-' || substr(v_hex, 13, 4);

  INSERT INTO public.profiles (id, uid, username, display_name, avatar_url, role, status, biometric_enabled)
  VALUES (p_user_id, public.generate_unique_uid(), v_username, v_username, NULL, 'user', 'active', FALSE);

  INSERT INTO public.account_secrets (user_id, recovery_code_hash, unlock_password_hash, auth_migrated_at)
  VALUES (p_user_id, crypt(v_code, gen_salt('bf', 10)), crypt(p_password, gen_salt('bf', 10)), NOW());

  INSERT INTO public.user_preferences (user_id, unlock_secret_hash) VALUES (p_user_id, '')
  ON CONFLICT (user_id) DO NOTHING;
  INSERT INTO public.game_preferences (user_id) VALUES (p_user_id)
  ON CONFLICT (user_id) DO NOTHING;

  RETURN jsonb_build_object('profile', public.auth_get_profile(p_user_id), 'recovery_code', v_code);
END;
$func$;

REVOKE ALL ON FUNCTION public.auth_provision_profile(UUID, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.auth_provision_profile(UUID, TEXT, TEXT) TO service_role;

-- 2. Existing accounts.
UPDATE public.profiles
   SET avatar_url = NULL
 WHERE avatar_url LIKE 'https://api.dicebear.com/%';

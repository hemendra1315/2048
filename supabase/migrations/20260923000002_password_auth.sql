-- Migration: 20260923000002_password_auth.sql
-- Description: Replace numeric PINs with passwords.
--   * Account passwords are hashed on the server with bcrypt (pgcrypto crypt/gen_salt('bf')).
--     The client sends the password over HTTPS; no password or reusable hash is computed in the browser.
--   * Existing accounts keep working: their old PIN is accepted once as their password and
--     is upgraded to a bcrypt password hash on first successful sign-in.
--   * The stealth unlock secret becomes a password too, verified by bcrypt.

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS password_hash TEXT;

-- ---------------------------------------------------------------------------
-- Internal helpers (not callable by clients)
-- ---------------------------------------------------------------------------

-- Legacy check: the old client hashed sha256("<identifier>:<pin>:vault_pin_salt_v2"),
-- where <identifier> was whatever the user typed (username or UID, lower-cased).
CREATE OR REPLACE FUNCTION public._legacy_pin_matches(p_profile public.profiles, p_secret TEXT)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
SET search_path = public, extensions
AS $func$
  SELECT p_profile.pin_hash IS NOT NULL AND p_profile.pin_hash IN (
    encode(digest(lower(coalesce(p_profile.username, '')) || ':' || p_secret || ':vault_pin_salt_v2', 'sha256'), 'hex'),
    encode(digest(lower(coalesce(p_profile.uid, ''))      || ':' || p_secret || ':vault_pin_salt_v2', 'sha256'), 'hex')
  );
$func$;

-- Returns TRUE when p_password is the account's password. Upgrades legacy PIN hashes to bcrypt.
CREATE OR REPLACE FUNCTION public._check_account_password(p_user_id UUID, p_password TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $func$
DECLARE
  v_profile public.profiles;
BEGIN
  SELECT * INTO v_profile FROM public.profiles WHERE id = p_user_id;
  IF v_profile.id IS NULL OR p_password IS NULL OR p_password = '' THEN
    RETURN FALSE;
  END IF;

  IF v_profile.password_hash IS NOT NULL THEN
    RETURN v_profile.password_hash = crypt(p_password, v_profile.password_hash);
  END IF;

  IF public._legacy_pin_matches(v_profile, p_password) THEN
    UPDATE public.profiles
    SET password_hash = crypt(p_password, gen_salt('bf', 10)),
        pin_hash = NULL,
        updated_at = NOW()
    WHERE id = p_user_id;
    RETURN TRUE;
  END IF;

  RETURN FALSE;
END;
$func$;

CREATE OR REPLACE FUNCTION public._validate_new_password(p_password TEXT)
RETURNS VOID
LANGUAGE plpgsql
IMMUTABLE
AS $func$
BEGIN
  IF p_password IS NULL OR char_length(p_password) < 8 THEN
    RAISE EXCEPTION 'Password must be at least 8 characters';
  END IF;
  IF octet_length(p_password) > 72 THEN
    RAISE EXCEPTION 'Password must be at most 72 bytes';
  END IF;
END;
$func$;

CREATE OR REPLACE FUNCTION public._profile_json(p_id UUID)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $func$
  SELECT jsonb_build_object(
    'id', p.id,
    'uid', p.uid,
    'username', p.username,
    'display_name', p.display_name,
    'avatar_url', p.avatar_url,
    'biometric_enabled', p.biometric_enabled,
    'role', p.role,
    'status', p.status,
    'created_at', p.created_at,
    'last_login_at', p.last_login_at,
    'updated_at', p.updated_at
  )
  FROM public.profiles p WHERE p.id = p_id;
$func$;

REVOKE ALL ON FUNCTION public._legacy_pin_matches(public.profiles, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._check_account_password(UUID, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._validate_new_password(TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._profile_json(UUID) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Replace PIN RPCs (parameter names change, so the old signatures are dropped)
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.register_frictionless_user(TEXT, TEXT, TEXT, TEXT, BOOLEAN, TEXT);
DROP FUNCTION IF EXISTS public.login_frictionless_user(TEXT, TEXT);
DROP FUNCTION IF EXISTS public.reset_user_pin(TEXT, TEXT, TEXT);

-- Register
CREATE FUNCTION public.register_frictionless_user(
  p_username TEXT,
  p_uid TEXT,
  p_password TEXT,
  p_recovery_code_hash TEXT,
  p_biometric_enabled BOOLEAN DEFAULT FALSE,
  p_avatar_url TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $func$
DECLARE
  v_user_id UUID := gen_random_uuid();
  v_clean_username TEXT := LOWER(TRIM(p_username));
  v_clean_uid TEXT := UPPER(TRIM(p_uid));
  v_hash TEXT;
BEGIN
  IF char_length(v_clean_username) < 2 THEN
    RAISE EXCEPTION 'Username must be at least 2 characters long';
  END IF;
  IF EXISTS (SELECT 1 FROM public.profiles WHERE username = v_clean_username) THEN
    RAISE EXCEPTION 'Username "%" is already taken', v_clean_username;
  END IF;
  IF EXISTS (SELECT 1 FROM public.profiles WHERE uid = v_clean_uid) THEN
    RAISE EXCEPTION 'UID "%" is already allocated', v_clean_uid;
  END IF;
  PERFORM public._validate_new_password(p_password);

  v_hash := crypt(p_password, gen_salt('bf', 10));

  INSERT INTO public.profiles (
    id, uid, username, display_name, avatar_url,
    password_hash, pin_hash, recovery_code_hash, biometric_enabled,
    role, status, created_at, last_login_at, updated_at
  ) VALUES (
    v_user_id, v_clean_uid, v_clean_username, TRIM(p_username), p_avatar_url,
    v_hash, NULL, p_recovery_code_hash, COALESCE(p_biometric_enabled, FALSE),
    'user', 'active', NOW(), NOW(), NOW()
  );

  -- The stealth unlock password starts out equal to the account password (separate bcrypt hash).
  INSERT INTO public.user_preferences (
    user_id, custom_app_name, selected_icon, selected_game,
    unlock_method, unlock_secret_hash, theme_preference, auto_lock_seconds
  ) VALUES (
    v_user_id, 'Retro Arcade', 'arcade_gamepad', 'game_2048',
    'pin', crypt(p_password, gen_salt('bf', 10)), 'dark_modern', 60
  ) ON CONFLICT (user_id) DO NOTHING;

  INSERT INTO public.game_preferences (user_id, selected_game, sound_enabled, haptics_enabled, difficulty)
  VALUES (v_user_id, 'game_2048', TRUE, TRUE, 'normal')
  ON CONFLICT (user_id) DO NOTHING;

  RETURN public._profile_json(v_user_id);
END;
$func$;

-- Login
CREATE FUNCTION public.login_frictionless_user(
  p_identifier TEXT,
  p_password TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $func$
DECLARE
  v_id UUID;
  v_clean_ident TEXT := TRIM(p_identifier);
BEGIN
  SELECT id INTO v_id
  FROM public.profiles
  WHERE (username = LOWER(v_clean_ident) OR uid = UPPER(v_clean_ident))
    AND status <> 'banned';

  -- Same message for unknown user and wrong password.
  IF v_id IS NULL OR NOT public._check_account_password(v_id, p_password) THEN
    RAISE EXCEPTION 'Invalid username or password';
  END IF;

  UPDATE public.profiles SET last_login_at = NOW() WHERE id = v_id;
  RETURN public._profile_json(v_id);
END;
$func$;

-- Reset password with recovery key
CREATE FUNCTION public.reset_user_password(
  p_identifier TEXT,
  p_recovery_code_hash TEXT,
  p_new_password TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $func$
DECLARE
  v_id UUID;
  v_stored TEXT;
  v_clean_ident TEXT := TRIM(p_identifier);
BEGIN
  SELECT id, recovery_code_hash INTO v_id, v_stored
  FROM public.profiles
  WHERE (username = LOWER(v_clean_ident) OR uid = UPPER(v_clean_ident));

  IF v_id IS NULL OR v_stored IS NULL OR v_stored <> p_recovery_code_hash THEN
    RAISE EXCEPTION 'Invalid username or recovery key';
  END IF;
  PERFORM public._validate_new_password(p_new_password);

  UPDATE public.profiles
  SET password_hash = crypt(p_new_password, gen_salt('bf', 10)),
      pin_hash = NULL,
      updated_at = NOW(),
      last_login_at = NOW()
  WHERE id = v_id;

  UPDATE public.user_preferences
  SET unlock_secret_hash = crypt(p_new_password, gen_salt('bf', 10)),
      updated_at = NOW()
  WHERE user_id = v_id;

  RETURN public._profile_json(v_id);
END;
$func$;

-- ---------------------------------------------------------------------------
-- Stealth unlock password
-- ---------------------------------------------------------------------------
-- Existing unlock hashes that are not bcrypt (older PIN hashes) accept the account password
-- once and are then re-hashed with bcrypt.
CREATE OR REPLACE FUNCTION public._check_unlock_password(p_user_id UUID, p_secret TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $func$
DECLARE
  v_hash TEXT;
BEGIN
  IF p_secret IS NULL OR p_secret = '' THEN
    RETURN FALSE;
  END IF;

  SELECT unlock_secret_hash INTO v_hash FROM public.user_preferences WHERE user_id = p_user_id;

  IF v_hash LIKE '$2%' THEN
    RETURN v_hash = crypt(p_secret, v_hash);
  END IF;

  IF public._check_account_password(p_user_id, p_secret) THEN
    UPDATE public.user_preferences
    SET unlock_secret_hash = crypt(p_secret, gen_salt('bf', 10)), updated_at = NOW()
    WHERE user_id = p_user_id;
    RETURN FOUND;
  END IF;

  RETURN FALSE;
END;
$func$;
REVOKE ALL ON FUNCTION public._check_unlock_password(UUID, TEXT) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.verify_vault_unlock(p_user_id UUID, p_secret TEXT)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $func$
  SELECT public._check_unlock_password(p_user_id, p_secret);
$func$;

CREATE OR REPLACE FUNCTION public.update_vault_unlock(p_user_id UUID, p_old_secret TEXT, p_new_secret TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $func$
BEGIN
  IF NOT public._check_unlock_password(p_user_id, p_old_secret) THEN
    RAISE EXCEPTION 'Current unlock password is incorrect';
  END IF;
  IF p_new_secret IS NULL OR char_length(p_new_secret) < 4 THEN
    RAISE EXCEPTION 'Unlock password must be at least 4 characters';
  END IF;
  IF octet_length(p_new_secret) > 72 THEN
    RAISE EXCEPTION 'Unlock password must be at most 72 bytes';
  END IF;

  UPDATE public.user_preferences
  SET unlock_secret_hash = crypt(p_new_secret, gen_salt('bf', 10)), updated_at = NOW()
  WHERE user_id = p_user_id;
  RETURN TRUE;
END;
$func$;

GRANT EXECUTE ON FUNCTION public.register_frictionless_user(TEXT, TEXT, TEXT, TEXT, BOOLEAN, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.login_frictionless_user(TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reset_user_password(TEXT, TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verify_vault_unlock(UUID, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_vault_unlock(UUID, TEXT, TEXT) TO anon, authenticated;

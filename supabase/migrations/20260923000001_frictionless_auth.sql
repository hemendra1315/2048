-- Migration: 20260923000001_frictionless_auth.sql
-- Description: Frictionless PIN & Biometric Authentication Schema, RPCs, and Profile Enhancements

-- 1. Alter profiles table
ALTER TABLE public.profiles ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_id_fkey;

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS username TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS pin_hash TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS recovery_code_hash TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS biometric_enabled BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Populate username for existing profiles
UPDATE public.profiles 
SET username = LOWER(REPLACE(display_name, ' ', '_')) 
WHERE username IS NULL;

-- Enable permissions
GRANT ALL ON public.profiles TO anon, authenticated, service_role;
GRANT ALL ON public.user_preferences TO anon, authenticated, service_role;
GRANT ALL ON public.game_preferences TO anon, authenticated, service_role;
GRANT ALL ON public.game_progress TO anon, authenticated, service_role;
GRANT ALL ON public.conversations TO anon, authenticated, service_role;
GRANT ALL ON public.conversation_members TO anon, authenticated, service_role;
GRANT ALL ON public.messages TO anon, authenticated, service_role;
GRANT ALL ON public.connections TO anon, authenticated, service_role;
GRANT ALL ON public.connection_requests TO anon, authenticated, service_role;
GRANT ALL ON public.gallery_items TO anon, authenticated, service_role;
GRANT ALL ON public.admin_access_log TO anon, authenticated, service_role;

-- 2. Frictionless Register RPC
CREATE OR REPLACE FUNCTION public.register_frictionless_user(
  p_username TEXT,
  p_uid TEXT,
  p_pin_hash TEXT,
  p_recovery_code_hash TEXT,
  p_biometric_enabled BOOLEAN DEFAULT FALSE,
  p_avatar_url TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  v_user_id UUID;
  v_clean_username TEXT;
  v_clean_uid TEXT;
  v_profile RECORD;
BEGIN
  v_clean_username := LOWER(TRIM(p_username));
  v_clean_uid := UPPER(TRIM(p_uid));

  IF char_length(v_clean_username) < 2 THEN
    RAISE EXCEPTION 'Username must be at least 2 characters long';
  END IF;

  IF EXISTS (SELECT 1 FROM public.profiles WHERE username = v_clean_username) THEN
    RAISE EXCEPTION 'Username "%" is already taken', v_clean_username;
  END IF;

  IF EXISTS (SELECT 1 FROM public.profiles WHERE uid = v_clean_uid) THEN
    RAISE EXCEPTION 'UID "%" is already allocated', v_clean_uid;
  END IF;

  v_user_id := gen_random_uuid();

  INSERT INTO public.profiles (
    id,
    uid,
    username,
    display_name,
    avatar_url,
    pin_hash,
    recovery_code_hash,
    biometric_enabled,
    role,
    status,
    created_at,
    last_login_at,
    updated_at
  ) VALUES (
    v_user_id,
    v_clean_uid,
    v_clean_username,
    TRIM(p_username),
    p_avatar_url,
    p_pin_hash,
    p_recovery_code_hash,
    COALESCE(p_biometric_enabled, FALSE),
    'user',
    'active',
    NOW(),
    NOW(),
    NOW()
  )
  RETURNING * INTO v_profile;

  -- Create initial preferences
  INSERT INTO public.user_preferences (
    user_id,
    custom_app_name,
    selected_icon,
    selected_game,
    unlock_method,
    unlock_secret_hash,
    theme_preference,
    auto_lock_seconds
  ) VALUES (
    v_user_id,
    'Retro Arcade',
    'arcade_gamepad',
    'game_2048',
    'pin',
    p_pin_hash,
    'dark_modern',
    60
  ) ON CONFLICT (user_id) DO NOTHING;

  -- Create initial game preferences
  INSERT INTO public.game_preferences (
    user_id,
    selected_game,
    sound_enabled,
    haptics_enabled,
    difficulty
  ) VALUES (
    v_user_id,
    'game_2048',
    TRUE,
    TRUE,
    'normal'
  ) ON CONFLICT (user_id) DO NOTHING;

  RETURN jsonb_build_object(
    'id', v_profile.id,
    'uid', v_profile.uid,
    'username', v_profile.username,
    'display_name', v_profile.display_name,
    'avatar_url', v_profile.avatar_url,
    'biometric_enabled', v_profile.biometric_enabled,
    'role', v_profile.role,
    'status', v_profile.status,
    'created_at', v_profile.created_at,
    'last_login_at', v_profile.last_login_at,
    'updated_at', v_profile.updated_at
  );
END;
$func$;

-- 3. Frictionless Login RPC
CREATE OR REPLACE FUNCTION public.login_frictionless_user(
  p_identifier TEXT,
  p_pin_hash TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  v_profile RECORD;
  v_clean_ident TEXT;
BEGIN
  v_clean_ident := TRIM(p_identifier);

  SELECT * INTO v_profile
  FROM public.profiles
  WHERE (username = LOWER(v_clean_ident) OR uid = UPPER(v_clean_ident))
    AND status <> 'banned';

  IF v_profile.id IS NULL THEN
    RAISE EXCEPTION 'User not found or account is suspended';
  END IF;

  IF v_profile.pin_hash <> p_pin_hash THEN
    RAISE EXCEPTION 'Invalid PIN code';
  END IF;

  UPDATE public.profiles
  SET last_login_at = NOW()
  WHERE id = v_profile.id;

  RETURN jsonb_build_object(
    'id', v_profile.id,
    'uid', v_profile.uid,
    'username', v_profile.username,
    'display_name', v_profile.display_name,
    'avatar_url', v_profile.avatar_url,
    'biometric_enabled', v_profile.biometric_enabled,
    'role', v_profile.role,
    'status', v_profile.status,
    'created_at', v_profile.created_at,
    'last_login_at', NOW(),
    'updated_at', v_profile.updated_at
  );
END;
$func$;

-- 4. Biometric Direct Login RPC
CREATE OR REPLACE FUNCTION public.biometric_login_user(
  p_identifier TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  v_profile RECORD;
  v_clean_ident TEXT;
BEGIN
  v_clean_ident := TRIM(p_identifier);

  SELECT * INTO v_profile
  FROM public.profiles
  WHERE (username = LOWER(v_clean_ident) OR uid = UPPER(v_clean_ident))
    AND status <> 'banned';

  IF v_profile.id IS NULL THEN
    RAISE EXCEPTION 'User not found';
  END IF;

  IF NOT v_profile.biometric_enabled THEN
    RAISE EXCEPTION 'Biometric authentication is not enabled for this identity';
  END IF;

  UPDATE public.profiles
  SET last_login_at = NOW()
  WHERE id = v_profile.id;

  RETURN jsonb_build_object(
    'id', v_profile.id,
    'uid', v_profile.uid,
    'username', v_profile.username,
    'display_name', v_profile.display_name,
    'avatar_url', v_profile.avatar_url,
    'biometric_enabled', v_profile.biometric_enabled,
    'role', v_profile.role,
    'status', v_profile.status,
    'created_at', v_profile.created_at,
    'last_login_at', NOW(),
    'updated_at', v_profile.updated_at
  );
END;
$func$;

-- 5. Reset PIN via Recovery Code RPC
CREATE OR REPLACE FUNCTION public.reset_user_pin(
  p_identifier TEXT,
  p_recovery_code_hash TEXT,
  p_new_pin_hash TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  v_profile RECORD;
  v_clean_ident TEXT;
BEGIN
  v_clean_ident := TRIM(p_identifier);

  SELECT * INTO v_profile
  FROM public.profiles
  WHERE (username = LOWER(v_clean_ident) OR uid = UPPER(v_clean_ident));

  IF v_profile.id IS NULL THEN
    RAISE EXCEPTION 'Identity not found';
  END IF;

  IF v_profile.recovery_code_hash <> p_recovery_code_hash THEN
    RAISE EXCEPTION 'Invalid recovery code';
  END IF;

  UPDATE public.profiles
  SET pin_hash = p_new_pin_hash,
      updated_at = NOW(),
      last_login_at = NOW()
  WHERE id = v_profile.id;

  UPDATE public.user_preferences
  SET unlock_secret_hash = p_new_pin_hash,
      updated_at = NOW()
  WHERE user_id = v_profile.id;

  RETURN jsonb_build_object(
    'id', v_profile.id,
    'uid', v_profile.uid,
    'username', v_profile.username,
    'display_name', v_profile.display_name,
    'avatar_url', v_profile.avatar_url,
    'biometric_enabled', v_profile.biometric_enabled,
    'role', v_profile.role,
    'status', v_profile.status,
    'created_at', v_profile.created_at,
    'last_login_at', NOW(),
    'updated_at', NOW()
  );
END;
$func$;

-- 6. Update Profile RPC
CREATE OR REPLACE FUNCTION public.update_profile_frictionless(
  p_user_id UUID,
  p_display_name TEXT DEFAULT NULL,
  p_avatar_url TEXT DEFAULT NULL,
  p_biometric_enabled BOOLEAN DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  v_profile RECORD;
BEGIN
  UPDATE public.profiles
  SET 
    display_name = COALESCE(p_display_name, display_name),
    avatar_url = COALESCE(p_avatar_url, avatar_url),
    biometric_enabled = COALESCE(p_biometric_enabled, biometric_enabled),
    updated_at = NOW()
  WHERE id = p_user_id
  RETURNING * INTO v_profile;

  IF v_profile.id IS NULL THEN
    RAISE EXCEPTION 'User profile not found';
  END IF;

  RETURN jsonb_build_object(
    'id', v_profile.id,
    'uid', v_profile.uid,
    'username', v_profile.username,
    'display_name', v_profile.display_name,
    'avatar_url', v_profile.avatar_url,
    'biometric_enabled', v_profile.biometric_enabled,
    'role', v_profile.role,
    'status', v_profile.status,
    'created_at', v_profile.created_at,
    'last_login_at', v_profile.last_login_at,
    'updated_at', v_profile.updated_at
  );
END;
$func$;

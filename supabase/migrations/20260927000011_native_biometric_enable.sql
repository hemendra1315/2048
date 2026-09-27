-- =============================================================================
-- Migration: 20260927000011_native_biometric_enable.sql
-- Adds p_enable_biometrics parameter to update_my_profile so the native
-- Capacitor biometric flow can mark biometric_enabled = TRUE without
-- needing a WebAuthn credential.
-- Also adds p_instagram_url so profile updates don't need a separate call.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.update_my_profile(
  p_display_name      TEXT    DEFAULT NULL,
  p_avatar_url        TEXT    DEFAULT NULL,
  p_instagram_url     TEXT    DEFAULT NULL,
  p_enable_biometrics BOOLEAN DEFAULT FALSE,
  p_disable_biometrics BOOLEAN DEFAULT FALSE
)
RETURNS public.profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  v_uid UUID := auth.uid();
  v_row public.profiles;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not signed in' USING ERRCODE = '42501';
  END IF;

  -- Disable: wipe WebAuthn credentials and set flag to false
  IF p_disable_biometrics THEN
    DELETE FROM public.webauthn_credentials WHERE user_id = v_uid;
  END IF;

  UPDATE public.profiles
  SET display_name     = COALESCE(NULLIF(TRIM(p_display_name), ''), display_name),
      avatar_url       = COALESCE(p_avatar_url, avatar_url),
      instagram_url    = COALESCE(p_instagram_url, instagram_url),
      biometric_enabled = CASE
        WHEN p_disable_biometrics THEN FALSE
        WHEN p_enable_biometrics  THEN TRUE
        ELSE biometric_enabled
      END,
      updated_at = NOW()
  WHERE id = v_uid
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$func$;

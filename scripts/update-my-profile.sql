CREATE OR REPLACE FUNCTION public.update_my_profile(
  p_display_name TEXT DEFAULT NULL,
  p_avatar_url TEXT DEFAULT NULL,
  p_disable_biometrics BOOLEAN DEFAULT FALSE,
  p_instagram_url TEXT DEFAULT NULL
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

  IF p_disable_biometrics THEN
    DELETE FROM public.webauthn_credentials WHERE user_id = v_uid;
  END IF;

  UPDATE public.profiles
  SET display_name = COALESCE(NULLIF(TRIM(p_display_name), ''), display_name),
      avatar_url = COALESCE(p_avatar_url, avatar_url),
      instagram_url = COALESCE(p_instagram_url, instagram_url),
      biometric_enabled = CASE WHEN p_disable_biometrics THEN FALSE ELSE biometric_enabled END,
      updated_at = NOW()
  WHERE id = v_uid
  RETURNING * INTO v_row;
  RETURN v_row;
END;
$func$;

GRANT EXECUTE ON FUNCTION public.update_my_profile(TEXT, TEXT, BOOLEAN, TEXT) TO authenticated;

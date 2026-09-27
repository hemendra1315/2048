-- =============================================================================
-- Migration: 20260927000016_legacy_password_check_tries_both_forms.sql
-- (Recorded after the fact: this was applied live via apply_migration during
-- this session and is only now being saved as a local file for repo/DB parity.)
--
-- auth_check_legacy_password gated login for pre-migration accounts against
-- only the exact password string given; login's client-side padded/raw
-- fallback (AuthContext.tsx) meant a real typo double-counted against the
-- login lockout here too. Try both forms server-side (same fix as
-- _unlock_password_matches) so a legacy account can match on one request
-- whichever form was originally used to set its legacy hash.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.auth_check_legacy_password(p_user_id uuid, p_password text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_s public.account_secrets;
  v_username TEXT;
  v_uid TEXT;
  v_padded TEXT;
BEGIN
  SELECT * INTO v_s FROM public.account_secrets WHERE user_id = p_user_id;
  SELECT username, uid INTO v_username, v_uid FROM public.profiles WHERE id = p_user_id;
  IF v_s.user_id IS NULL OR p_password IS NULL OR p_password = '' THEN
    RETURN FALSE;
  END IF;

  v_padded := public._pin_to_secret(p_password);

  IF v_s.legacy_password_hash IS NOT NULL THEN
    RETURN v_s.legacy_password_hash = crypt(p_password, v_s.legacy_password_hash)
        OR (v_padded IS DISTINCT FROM p_password AND v_s.legacy_password_hash = crypt(v_padded, v_s.legacy_password_hash));
  END IF;

  RETURN v_s.legacy_pin_hash IS NOT NULL AND (
    v_s.legacy_pin_hash IN (
      encode(digest(lower(coalesce(v_username, '')) || ':' || p_password || ':vault_pin_salt_v2', 'sha256'), 'hex'),
      encode(digest(lower(coalesce(v_uid, ''))      || ':' || p_password || ':vault_pin_salt_v2', 'sha256'), 'hex')
    )
    OR (v_padded IS DISTINCT FROM p_password AND v_s.legacy_pin_hash IN (
      encode(digest(lower(coalesce(v_username, '')) || ':' || v_padded || ':vault_pin_salt_v2', 'sha256'), 'hex'),
      encode(digest(lower(coalesce(v_uid, ''))      || ':' || v_padded || ':vault_pin_salt_v2', 'sha256'), 'hex')
    ))
  );
END;
$function$;

-- =============================================================================
-- Migration: 20260927000017_clear_my_webauthn_credentials_rpc.sql
-- (Recorded after the fact: this was applied live via apply_migration during
-- this session and is only now being saved as a local file for repo/DB parity.)
--
-- disableBiometrics' error-fallback path (AuthContext.tsx) could not clean up
-- WebAuthn credential rows after update_my_profile failed, since
-- webauthn_credentials has zero grants to authenticated (correctly -- direct
-- client access would be a security hole). Gives it a narrowly-scoped RPC to
-- call instead.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.clear_my_webauthn_credentials()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not signed in' USING ERRCODE = '42501';
  END IF;
  DELETE FROM public.webauthn_credentials WHERE user_id = v_uid;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.clear_my_webauthn_credentials() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.clear_my_webauthn_credentials() TO authenticated;

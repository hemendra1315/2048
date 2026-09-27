-- =============================================================================
-- Migration: 20260927000015_medium_severity_fixes.sql
-- Remaining medium-severity fixes from a full codebase audit:
--
-- 12. delete_own_account() left password/PIN/recovery-code hashes and WebAuthn
--     credentials behind -- account_secrets/webauthn_credentials were never
--     touched, contradicting the function's own "self-service deletion" purpose.
-- 14. Wrong-PIN retry logic (client tries the padded form, then falls back to
--     the raw form for legacy vaults) called the server twice per real typo,
--     double-counting against the 5-attempt lockout. Moved the fallback logic
--     server-side into _unlock_password_matches, so one client call now tries
--     both forms and only ever counts as one throttle_fail hit.
-- 15. purge_deleted_gallery_items() only deleted DB rows (Postgres can't reach
--     the Storage API) and was never actually scheduled anyway -- pg_cron was
--     not installed, so the "nightly purge" the schema comment described never
--     ran at all. Installed pg_cron, deployed a purge-gallery-trash Edge
--     Function that removes the storage object AND the row, and scheduled it.
-- 25. admin_set_user_gender was missing SET search_path = public, inconsistent
--     with every other SECURITY DEFINER function in this codebase.
-- 26. idx_messages_conv_created was a byte-for-byte duplicate of
--     idx_messages_conversation_created -- dropped the redundant one.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 12. Self-service deletion also removes credential material.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.delete_own_account(p_reason TEXT DEFAULT NULL)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_uid UUID := auth.uid();
  v_role TEXT;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT role INTO v_role FROM public.profiles WHERE id = v_uid;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Account not found';
  END IF;
  IF v_role = 'super_admin' THEN
    RAISE EXCEPTION 'Super admin accounts cannot self-delete; demote first from the database console' USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.gallery_items WHERE user_id = v_uid;
  DELETE FROM public.push_subscriptions WHERE user_id = v_uid;
  DELETE FROM public.user_preferences WHERE user_id = v_uid;
  DELETE FROM public.game_preferences WHERE user_id = v_uid;
  DELETE FROM public.game_progress WHERE user_id = v_uid;
  DELETE FROM public.contact_notification_preferences WHERE owner_id = v_uid;
  DELETE FROM public.user_blocks WHERE blocker_id = v_uid OR blocked_id = v_uid;
  DELETE FROM public.connection_requests WHERE sender_id = v_uid OR receiver_id = v_uid;
  DELETE FROM public.admin_user_notes WHERE user_id = v_uid;

  -- Credential material: password/PIN/recovery-code hashes and WebAuthn public keys.
  DELETE FROM public.account_secrets WHERE user_id = v_uid;
  DELETE FROM public.webauthn_credentials WHERE user_id = v_uid;

  UPDATE public.profiles
  SET display_name = 'Deleted Account',
      avatar_url = NULL,
      status = 'deleted',
      biometric_enabled = FALSE,
      updated_at = NOW()
  WHERE id = v_uid;

  PERFORM p_reason;
END;
$function$;

-- -----------------------------------------------------------------------------
-- 14. Try both the current-scheme padded PIN and the legacy raw PIN inside a
--     single server call, so a client retry never double-counts a lockout attempt.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._pin_to_secret(p_pin TEXT)
RETURNS TEXT LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN p_pin IS NULL OR p_pin = '' THEN ''
    WHEN char_length(trim(p_pin)) < 8 THEN 'GAMES_PIN_' || trim(p_pin) || '_SECURE'
    ELSE trim(p_pin)
  END;
$$;

CREATE OR REPLACE FUNCTION public._secret_matches_hash(p_hash TEXT, p_username TEXT, p_uid TEXT, p_secret TEXT)
RETURNS BOOLEAN LANGUAGE sql IMMUTABLE SET search_path = public, extensions AS $$
  SELECT CASE
    WHEN p_hash IS NULL OR p_hash = '' OR p_secret IS NULL OR p_secret = '' THEN FALSE
    WHEN p_hash LIKE '$2%' THEN p_hash = crypt(p_secret, p_hash)
    ELSE p_hash IN (
      encode(digest(lower(coalesce(p_username, '')) || ':' || p_secret || ':vault_pin_salt_v2', 'sha256'), 'hex'),
      encode(digest(lower(coalesce(p_uid, ''))      || ':' || p_secret || ':vault_pin_salt_v2', 'sha256'), 'hex')
    )
  END;
$$;

CREATE OR REPLACE FUNCTION public._unlock_password_matches(p_user_id UUID, p_secret TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $function$
DECLARE
  v_hash TEXT;
  v_username TEXT;
  v_uid TEXT;
  v_padded TEXT;
  v_matched TEXT;
BEGIN
  IF p_secret IS NULL OR p_secret = '' THEN
    RETURN FALSE;
  END IF;

  SELECT s.unlock_password_hash, p.username, p.uid INTO v_hash, v_username, v_uid
  FROM public.account_secrets s JOIN public.profiles p ON p.id = s.user_id
  WHERE s.user_id = p_user_id;

  IF v_hash IS NULL OR v_hash = '' THEN
    RETURN FALSE;
  END IF;

  v_padded := public._pin_to_secret(p_secret);

  IF public._secret_matches_hash(v_hash, v_username, v_uid, p_secret) THEN
    v_matched := p_secret;
  ELSIF v_padded IS DISTINCT FROM p_secret AND public._secret_matches_hash(v_hash, v_username, v_uid, v_padded) THEN
    v_matched := v_padded;
  ELSE
    RETURN FALSE;
  END IF;

  IF v_hash NOT LIKE '$2%' THEN
    UPDATE public.account_secrets
    SET unlock_password_hash = crypt(v_matched, gen_salt('bf', 10)), updated_at = NOW()
    WHERE user_id = p_user_id;
  END IF;

  RETURN TRUE;
END;
$function$;

-- -----------------------------------------------------------------------------
-- 15. Install pg_cron, deploy target already published (purge-gallery-trash
--     Edge Function), schedule it via pg_net (already enabled).
-- -----------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pg_cron;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'purge-deleted-gallery-items';
    PERFORM cron.schedule(
      'purge-deleted-gallery-items',
      '0 4 * * *',
      $cron$
      SELECT net.http_post(
        url := 'https://dddsplxihciighvmaqqt.supabase.co/functions/v1/purge-gallery-trash',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRkZHNwbHhpaGNpaWdodm1hcXF0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk3MzkwMjMsImV4cCI6MjEwNTMxNTAyM30.pnsb2zejuaHkauMMM0d6otRofPxMtx-K0-1iMvWeyJ8'
        ),
        body := '{}'::jsonb
      );
      $cron$
    );
  END IF;
END;
$$;

-- Row-only fallback function is kept (REVOKEd from clients) in case the Edge
-- Function is ever unreachable; it is no longer relied on as the primary path.
REVOKE EXECUTE ON FUNCTION public.purge_deleted_gallery_items() FROM PUBLIC, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 25. admin_set_user_gender: match this codebase's SECURITY DEFINER convention.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_set_user_gender(p_target UUID, p_gender TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_admin_id UUID;
BEGIN
  v_admin_id := auth.uid();
  IF v_admin_id IS NULL OR NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Only super admins can set user gender';
  END IF;

  IF p_gender NOT IN ('Male', 'Female', 'male', 'female') THEN
    RAISE EXCEPTION 'Invalid gender: must be Male or Female';
  END IF;

  UPDATE public.profiles
  SET gender = CASE WHEN lower(p_gender) = 'female' THEN 'Female' ELSE 'Male' END,
      updated_at = NOW()
  WHERE id = p_target;

  RETURN jsonb_build_object('success', true, 'user_id', p_target, 'gender', p_gender);
END;
$function$;

-- -----------------------------------------------------------------------------
-- 26. Drop the duplicate index.
-- -----------------------------------------------------------------------------
DROP INDEX IF EXISTS public.idx_messages_conv_created;

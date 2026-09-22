-- Migration: 20260923000003_session_auth_hardening.sql
--
-- Moves authentication onto real Supabase Auth sessions and removes every RPC that trusted a
-- user id, username or "biometric success" flag supplied by the browser.
--
-- After this migration:
--   * Sign-up, password login, recovery reset and fingerprint (WebAuthn) login run in the
--     `vault-auth` Edge Function (supabase/functions/vault-auth). It verifies credentials on the
--     server and returns a normal Supabase Auth session, so auth.uid() is set for every request.
--   * All ownership checks use auth.uid(). No client-callable function accepts a user id.
--   * Password material (legacy hashes, recovery keys, unlock passwords) lives in
--     public.account_secrets, which only the service role can read.
--   * Failed attempts are counted in public.auth_throttle (lockout with exponential back-off).
--   * Users can no longer change their own role/status/username/uid or rewrite who a connection
--     request or conversation membership belongs to.
--
-- Deploy together with the vault-auth Edge Function (see supabase/functions/vault-auth/README.md).

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- ---------------------------------------------------------------------------
-- 0. Remove the client-trusting RPCs from 20260923000001 and 20260923000002
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.register_frictionless_user(TEXT, TEXT, TEXT, TEXT, BOOLEAN, TEXT);
DROP FUNCTION IF EXISTS public.login_frictionless_user(TEXT, TEXT);
DROP FUNCTION IF EXISTS public.biometric_login_user(TEXT);
DROP FUNCTION IF EXISTS public.reset_user_pin(TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.reset_user_password(TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.update_profile_frictionless(UUID, TEXT, TEXT, BOOLEAN);
DROP FUNCTION IF EXISTS public.verify_vault_unlock(UUID, TEXT);
DROP FUNCTION IF EXISTS public.update_vault_unlock(UUID, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.verify_unlock_secret(TEXT);
DROP FUNCTION IF EXISTS public.update_unlock_secret(TEXT, TEXT);
DROP FUNCTION IF EXISTS public._check_unlock_password(UUID, TEXT);
DROP FUNCTION IF EXISTS public._check_account_password(UUID, TEXT);
DROP FUNCTION IF EXISTS public._legacy_pin_matches(public.profiles, TEXT);
DROP FUNCTION IF EXISTS public._validate_new_password(TEXT);
DROP FUNCTION IF EXISTS public._profile_json(UUID);

-- The auth.users trigger copied `role` from user-editable sign-up metadata, so anyone calling
-- supabase.auth.signUp({ options: { data: { role: 'super_admin' } } }) became a super admin.
-- Profiles are now provisioned only by the vault-auth Edge Function.
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user();

-- ---------------------------------------------------------------------------
-- 1. Table privileges: 20260923000001 granted ALL on every table to anon.
--    Anonymous callers need no direct table access at all.
-- ---------------------------------------------------------------------------
REVOKE ALL ON
  public.profiles, public.user_preferences, public.game_preferences, public.game_progress,
  public.connection_requests, public.connections, public.user_blocks, public.conversations,
  public.conversation_members, public.messages, public.gallery_items, public.admin_access_log
FROM anon;

-- The audit log is append-only for everyone except the service role.
REVOKE UPDATE, DELETE, TRUNCATE ON public.admin_access_log FROM authenticated;

-- ---------------------------------------------------------------------------
-- 2. Secrets move out of profiles (profiles are readable by connected users)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.account_secrets (
  user_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  legacy_password_hash TEXT,        -- bcrypt from 20260923000002, until the account moves to Supabase Auth
  legacy_pin_hash TEXT,             -- SHA-256 PIN hash from 20260923000001, same
  recovery_code_hash TEXT,          -- bcrypt (new) or legacy SHA-256
  unlock_password_hash TEXT,        -- bcrypt (or legacy SHA-256 PIN hash until first use)
  auth_migrated_at TIMESTAMPTZ,     -- set once a Supabase Auth user with the same id exists
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.account_secrets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.account_secrets FROM PUBLIC, anon, authenticated;

INSERT INTO public.account_secrets (user_id, legacy_password_hash, legacy_pin_hash, recovery_code_hash, unlock_password_hash, auth_migrated_at)
SELECT p.id, p.password_hash, p.pin_hash, p.recovery_code_hash, up.unlock_secret_hash,
       CASE WHEN EXISTS (SELECT 1 FROM auth.users u WHERE u.id = p.id) THEN NOW() END
FROM public.profiles p
LEFT JOIN public.user_preferences up ON up.user_id = p.id
ON CONFLICT (user_id) DO NOTHING;

ALTER TABLE public.profiles DROP COLUMN IF EXISTS password_hash;
ALTER TABLE public.profiles DROP COLUMN IF EXISTS pin_hash;
ALTER TABLE public.profiles DROP COLUMN IF EXISTS recovery_code_hash;

-- The owner could read (and overwrite) this column through the preferences policy.
ALTER TABLE public.user_preferences ALTER COLUMN unlock_secret_hash SET DEFAULT '';
UPDATE public.user_preferences SET unlock_secret_hash = '';

-- Fingerprint logins were never verified by the server, so no existing enrollment can be trusted.
-- Users re-enroll from Settings; enrollment now stores a server-verified WebAuthn credential.
UPDATE public.profiles SET biometric_enabled = FALSE;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_username_key ON public.profiles (username);

-- ---------------------------------------------------------------------------
-- 3. Guard triggers: stop users rewriting fields RLS cannot protect column-by-column
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_profile_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
BEGIN
  -- Only end-user requests are restricted; the service role and migrations are trusted.
  IF coalesce(auth.role(), '') <> 'authenticated' THEN
    RETURN NEW;
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.uid IS DISTINCT FROM OLD.uid
     OR NEW.username IS DISTINCT FROM OLD.username
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'These profile fields cannot be changed' USING ERRCODE = '42501';
  END IF;

  IF NEW.biometric_enabled AND NOT OLD.biometric_enabled THEN
    RAISE EXCEPTION 'Enable fingerprint unlock by enrolling a device' USING ERRCODE = '42501';
  END IF;

  IF NEW.role IS DISTINCT FROM OLD.role OR NEW.status IS DISTINCT FROM OLD.status THEN
    IF NOT public.is_super_admin() OR OLD.id = auth.uid() THEN
      RAISE EXCEPTION 'Not allowed to change role or status' USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$func$;

DROP TRIGGER IF EXISTS guard_profile_update ON public.profiles;
CREATE TRIGGER guard_profile_update
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.guard_profile_update();

-- Connection requests: the receiver may only change the status, and new requests start pending.
-- (Before, the receiver could rewrite sender_id to any user and "accept", creating a connection
-- and conversation with someone who never asked for it.)
CREATE OR REPLACE FUNCTION public.guard_connection_request()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $func$
BEGIN
  IF coalesce(auth.role(), '') <> 'authenticated' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' THEN
    NEW.status := 'pending';
  ELSIF NEW.sender_id IS DISTINCT FROM OLD.sender_id
     OR NEW.receiver_id IS DISTINCT FROM OLD.receiver_id
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Only the request status can be changed' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$func$;

DROP TRIGGER IF EXISTS guard_connection_request ON public.connection_requests;
CREATE TRIGGER guard_connection_request
  BEFORE INSERT OR UPDATE ON public.connection_requests
  FOR EACH ROW EXECUTE FUNCTION public.guard_connection_request();

-- Conversation membership rows: only read/typing state is user-editable.
CREATE OR REPLACE FUNCTION public.guard_conversation_member()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $func$
BEGIN
  IF coalesce(auth.role(), '') <> 'authenticated' THEN
    RETURN NEW;
  END IF;
  IF NEW.conversation_id IS DISTINCT FROM OLD.conversation_id
     OR NEW.user_id IS DISTINCT FROM OLD.user_id
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Only read and typing state can be changed' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$func$;

DROP TRIGGER IF EXISTS guard_conversation_member ON public.conversation_members;
CREATE TRIGGER guard_conversation_member
  BEFORE UPDATE ON public.conversation_members
  FOR EACH ROW EXECUTE FUNCTION public.guard_conversation_member();

-- Existing SECURITY DEFINER helpers get a fixed search_path; lookups require a signed-in user.
ALTER FUNCTION public.is_super_admin() SET search_path = public;
ALTER FUNCTION public.lookup_profile_by_uid(TEXT) SET search_path = public;
ALTER FUNCTION public.log_admin_action(TEXT, UUID, TEXT, JSONB) SET search_path = public;
REVOKE EXECUTE ON FUNCTION public.lookup_profile_by_uid(TEXT) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.log_admin_action(TEXT, UUID, TEXT, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.lookup_profile_by_uid(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.log_admin_action(TEXT, UUID, TEXT, JSONB) TO authenticated;

-- ---------------------------------------------------------------------------
-- 4. Brute-force protection
-- ---------------------------------------------------------------------------
-- A bucket is locked after `max_failures` failures inside `window`. Each lock lasts
-- base_lock * 2^(previous locks), capped at 24 hours. A success clears the bucket.
CREATE TABLE IF NOT EXISTS public.auth_throttle (
  bucket TEXT PRIMARY KEY,
  failures INT NOT NULL DEFAULT 0,
  window_started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  lockouts INT NOT NULL DEFAULT 0,
  locked_until TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.auth_throttle ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.auth_throttle FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.throttle_locked_until(p_bucket TEXT)
RETURNS TIMESTAMPTZ
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $func$
  SELECT locked_until FROM public.auth_throttle
  WHERE bucket = p_bucket AND locked_until > NOW();
$func$;

CREATE OR REPLACE FUNCTION public.throttle_fail(
  p_bucket TEXT,
  p_max_failures INT,
  p_window INTERVAL,
  p_base_lock INTERVAL
)
RETURNS TIMESTAMPTZ
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  v_row public.auth_throttle;
BEGIN
  INSERT INTO public.auth_throttle AS t (bucket, failures, window_started_at)
  VALUES (p_bucket, 1, NOW())
  ON CONFLICT (bucket) DO UPDATE
    SET failures = CASE WHEN t.window_started_at < NOW() - p_window THEN 1 ELSE t.failures + 1 END,
        window_started_at = CASE WHEN t.window_started_at < NOW() - p_window THEN NOW() ELSE t.window_started_at END,
        updated_at = NOW()
  RETURNING * INTO v_row;

  IF v_row.failures >= p_max_failures THEN
    UPDATE public.auth_throttle
    SET locked_until = NOW() + LEAST(p_base_lock * power(2, lockouts)::INT, INTERVAL '24 hours'),
        lockouts = lockouts + 1,
        failures = 0,
        window_started_at = NOW()
    WHERE bucket = p_bucket
    RETURNING * INTO v_row;
  END IF;

  RETURN CASE WHEN v_row.locked_until > NOW() THEN v_row.locked_until END;
END;
$func$;

CREATE OR REPLACE FUNCTION public.throttle_clear(p_bucket TEXT)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $func$
  DELETE FROM public.auth_throttle WHERE bucket = p_bucket;
$func$;

-- ---------------------------------------------------------------------------
-- 5. Vault unlock password (auth.uid() only; no user id parameter)
-- ---------------------------------------------------------------------------
-- Thresholds: 5 wrong unlock passwords in 15 minutes lock unlocking for 15 minutes,
-- doubling on each further lockout (max 24 hours). The counter is shared with the
-- "current password" check when changing the unlock password.

CREATE OR REPLACE FUNCTION public._unlock_password_matches(p_user_id UUID, p_secret TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $func$
DECLARE
  v_hash TEXT;
  v_username TEXT;
  v_uid TEXT;
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

  IF v_hash LIKE '$2%' THEN
    RETURN v_hash = crypt(p_secret, v_hash);
  END IF;

  -- Legacy SHA-256 PIN hash written by 20260923000001: accept once, then store bcrypt.
  IF v_hash IN (
    encode(digest(lower(coalesce(v_username, '')) || ':' || p_secret || ':vault_pin_salt_v2', 'sha256'), 'hex'),
    encode(digest(lower(coalesce(v_uid, ''))      || ':' || p_secret || ':vault_pin_salt_v2', 'sha256'), 'hex')
  ) THEN
    UPDATE public.account_secrets
    SET unlock_password_hash = crypt(p_secret, gen_salt('bf', 10)), updated_at = NOW()
    WHERE user_id = p_user_id;
    RETURN TRUE;
  END IF;

  RETURN FALSE;
END;
$func$;

CREATE OR REPLACE FUNCTION public.verify_vault_unlock(p_secret TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  v_uid UUID := auth.uid();
  v_bucket TEXT;
  v_locked TIMESTAMPTZ;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'not_authenticated');
  END IF;
  v_bucket := 'unlock:' || v_uid;

  v_locked := public.throttle_locked_until(v_bucket);
  IF v_locked IS NOT NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'locked', 'locked_until', v_locked);
  END IF;

  IF public._unlock_password_matches(v_uid, p_secret) THEN
    PERFORM public.throttle_clear(v_bucket);
    RETURN jsonb_build_object('ok', TRUE);
  END IF;

  v_locked := public.throttle_fail(v_bucket, 5, INTERVAL '15 minutes', INTERVAL '15 minutes');
  RETURN jsonb_build_object('ok', FALSE, 'error', CASE WHEN v_locked IS NULL THEN 'invalid' ELSE 'locked' END,
                            'locked_until', v_locked);
END;
$func$;

CREATE OR REPLACE FUNCTION public.update_vault_unlock(p_old_secret TEXT, p_new_secret TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $func$
DECLARE
  v_uid UUID := auth.uid();
  v_bucket TEXT;
  v_locked TIMESTAMPTZ;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'not_authenticated');
  END IF;
  v_bucket := 'unlock:' || v_uid;

  v_locked := public.throttle_locked_until(v_bucket);
  IF v_locked IS NOT NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'locked', 'locked_until', v_locked);
  END IF;

  IF NOT public._unlock_password_matches(v_uid, p_old_secret) THEN
    v_locked := public.throttle_fail(v_bucket, 5, INTERVAL '15 minutes', INTERVAL '15 minutes');
    RETURN jsonb_build_object('ok', FALSE, 'error', CASE WHEN v_locked IS NULL THEN 'invalid' ELSE 'locked' END,
                              'locked_until', v_locked);
  END IF;

  IF p_new_secret IS NULL OR char_length(p_new_secret) < 4 THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'too_short');
  END IF;
  IF octet_length(p_new_secret) > 72 THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'too_long');
  END IF;

  UPDATE public.account_secrets
  SET unlock_password_hash = crypt(p_new_secret, gen_salt('bf', 10)), updated_at = NOW()
  WHERE user_id = v_uid;
  PERFORM public.throttle_clear(v_bucket);
  RETURN jsonb_build_object('ok', TRUE);
END;
$func$;

-- Profile edits by the signed-in user. Fingerprint unlock can only be switched off here;
-- switching it on requires a server-verified WebAuthn enrollment.
CREATE OR REPLACE FUNCTION public.update_my_profile(
  p_display_name TEXT DEFAULT NULL,
  p_avatar_url TEXT DEFAULT NULL,
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

  IF p_disable_biometrics THEN
    DELETE FROM public.webauthn_credentials WHERE user_id = v_uid;
  END IF;

  UPDATE public.profiles
  SET display_name = COALESCE(NULLIF(TRIM(p_display_name), ''), display_name),
      avatar_url = COALESCE(p_avatar_url, avatar_url),
      biometric_enabled = CASE WHEN p_disable_biometrics THEN FALSE ELSE biometric_enabled END,
      updated_at = NOW()
  WHERE id = v_uid
  RETURNING * INTO v_row;
  RETURN v_row;
END;
$func$;

-- ---------------------------------------------------------------------------
-- 6. WebAuthn (fingerprint / Face ID / Windows Hello) credentials and challenges
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.webauthn_credentials (
  id TEXT PRIMARY KEY,                               -- base64url credential id
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  public_key_spki TEXT NOT NULL,                     -- base64url SubjectPublicKeyInfo (DER)
  algorithm INT NOT NULL CHECK (algorithm IN (-7, -257)),
  sign_count BIGINT NOT NULL DEFAULT 0,
  rp_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_webauthn_credentials_user ON public.webauthn_credentials (user_id);
ALTER TABLE public.webauthn_credentials ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.webauthn_credentials FROM PUBLIC, anon, authenticated;
GRANT SELECT (id, algorithm, rp_id, created_at, last_used_at), DELETE ON public.webauthn_credentials TO authenticated;
DROP POLICY IF EXISTS "webauthn_credentials_own_select" ON public.webauthn_credentials;
CREATE POLICY "webauthn_credentials_own_select" ON public.webauthn_credentials
  FOR SELECT TO authenticated USING (user_id = auth.uid());
DROP POLICY IF EXISTS "webauthn_credentials_own_delete" ON public.webauthn_credentials;
CREATE POLICY "webauthn_credentials_own_delete" ON public.webauthn_credentials
  FOR DELETE TO authenticated USING (user_id = auth.uid());

CREATE TABLE IF NOT EXISTS public.webauthn_challenges (
  challenge TEXT PRIMARY KEY,                        -- base64url, 32 random bytes generated on the server
  purpose TEXT NOT NULL CHECK (purpose IN ('register', 'login')),
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  rp_id TEXT NOT NULL,
  origin TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.webauthn_challenges ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.webauthn_challenges FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 7. Service-role functions used by the vault-auth Edge Function
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.auth_resolve_account(p_identifier TEXT)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $func$
  SELECT jsonb_build_object(
    'user_id', p.id,
    'username', p.username,
    'status', p.status,
    'biometric_enabled', p.biometric_enabled,
    'auth_migrated', s.auth_migrated_at IS NOT NULL
  )
  FROM public.profiles p
  LEFT JOIN public.account_secrets s ON s.user_id = p.id
  WHERE p.username = LOWER(TRIM(p_identifier)) OR p.uid = UPPER(TRIM(p_identifier))
  LIMIT 1;
$func$;

CREATE OR REPLACE FUNCTION public.auth_get_profile(p_user_id UUID)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $func$
  SELECT to_jsonb(p) FROM public.profiles p WHERE p.id = p_user_id;
$func$;

-- Legacy credential check for accounts created before Supabase Auth was used.
CREATE OR REPLACE FUNCTION public.auth_check_legacy_password(p_user_id UUID, p_password TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $func$
DECLARE
  v_s public.account_secrets;
  v_username TEXT;
  v_uid TEXT;
BEGIN
  SELECT * INTO v_s FROM public.account_secrets WHERE user_id = p_user_id;
  SELECT username, uid INTO v_username, v_uid FROM public.profiles WHERE id = p_user_id;
  IF v_s.user_id IS NULL OR p_password IS NULL OR p_password = '' THEN
    RETURN FALSE;
  END IF;
  IF v_s.legacy_password_hash IS NOT NULL THEN
    RETURN v_s.legacy_password_hash = crypt(p_password, v_s.legacy_password_hash);
  END IF;
  RETURN v_s.legacy_pin_hash IS NOT NULL AND v_s.legacy_pin_hash IN (
    encode(digest(lower(coalesce(v_username, '')) || ':' || p_password || ':vault_pin_salt_v2', 'sha256'), 'hex'),
    encode(digest(lower(coalesce(v_uid, ''))      || ':' || p_password || ':vault_pin_salt_v2', 'sha256'), 'hex')
  );
END;
$func$;

CREATE OR REPLACE FUNCTION public.auth_mark_migrated(p_user_id UUID)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $func$
  INSERT INTO public.account_secrets (user_id, auth_migrated_at) VALUES (p_user_id, NOW())
  ON CONFLICT (user_id) DO UPDATE
    SET auth_migrated_at = NOW(), legacy_password_hash = NULL, legacy_pin_hash = NULL, updated_at = NOW();
$func$;

CREATE OR REPLACE FUNCTION public.auth_check_recovery_code(p_user_id UUID, p_code TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $func$
DECLARE
  v_hash TEXT;
  v_code TEXT := UPPER(TRIM(coalesce(p_code, '')));
BEGIN
  SELECT recovery_code_hash INTO v_hash FROM public.account_secrets WHERE user_id = p_user_id;
  IF v_hash IS NULL OR v_code = '' THEN
    RETURN FALSE;
  END IF;
  IF v_hash LIKE '$2%' THEN
    RETURN v_hash = crypt(v_code, v_hash);
  END IF;
  -- Legacy: SHA-256(code || '_vault_salt_2026') computed in the browser by the old client.
  RETURN v_hash = encode(digest(v_code || '_vault_salt_2026', 'sha256'), 'hex');
END;
$func$;

-- Creates the profile, preferences and secrets for a Supabase Auth user created by the Edge
-- Function. Returns the profile plus a fresh recovery key (shown to the user once).
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

  UPDATE public.profiles
  SET avatar_url = 'https://api.dicebear.com/7.x/bottts/svg?seed=' || uid
  WHERE id = p_user_id;

  RETURN jsonb_build_object('profile', public.auth_get_profile(p_user_id), 'recovery_code', v_code);
END;
$func$;

-- After a recovery reset: new unlock password = new account password, and a new recovery key.
CREATE OR REPLACE FUNCTION public.auth_after_password_reset(p_user_id UUID, p_new_password TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $func$
DECLARE
  v_hex TEXT := upper(encode(gen_random_bytes(8), 'hex'));
  v_code TEXT;
BEGIN
  v_code := 'RC-' || substr(v_hex, 1, 4) || '-' || substr(v_hex, 5, 4) || '-' || substr(v_hex, 9, 4) || '-' || substr(v_hex, 13, 4);
  UPDATE public.account_secrets
  SET unlock_password_hash = crypt(p_new_password, gen_salt('bf', 10)),
      recovery_code_hash = crypt(v_code, gen_salt('bf', 10)),
      updated_at = NOW()
  WHERE user_id = p_user_id;
  PERFORM public.throttle_clear('unlock:' || p_user_id);
  RETURN v_code;
END;
$func$;

CREATE OR REPLACE FUNCTION public.auth_touch_login(p_user_id UUID)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $func$
  UPDATE public.profiles SET last_login_at = NOW() WHERE id = p_user_id;
$func$;

CREATE OR REPLACE FUNCTION public.webauthn_create_challenge(
  p_purpose TEXT, p_user_id UUID, p_rp_id TEXT, p_origin TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $func$
DECLARE
  v_challenge TEXT := rtrim(translate(encode(gen_random_bytes(32), 'base64'), '+/', '-_'), '=');
BEGIN
  DELETE FROM public.webauthn_challenges WHERE expires_at < NOW() - INTERVAL '1 hour';
  INSERT INTO public.webauthn_challenges (challenge, purpose, user_id, rp_id, origin, expires_at)
  VALUES (v_challenge, p_purpose, p_user_id, p_rp_id, p_origin, NOW() + INTERVAL '2 minutes');
  RETURN v_challenge;
END;
$func$;

-- Single use: returns the challenge row only the first time, and only while unexpired.
CREATE OR REPLACE FUNCTION public.webauthn_consume_challenge(p_challenge TEXT, p_purpose TEXT)
RETURNS JSONB
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $func$
  UPDATE public.webauthn_challenges
  SET consumed_at = NOW()
  WHERE challenge = p_challenge AND purpose = p_purpose AND consumed_at IS NULL AND expires_at > NOW()
  RETURNING jsonb_build_object('challenge', challenge, 'user_id', user_id, 'rp_id', rp_id, 'origin', origin);
$func$;

CREATE OR REPLACE FUNCTION public.webauthn_list_credentials(p_user_id UUID)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $func$
  SELECT coalesce(jsonb_agg(jsonb_build_object('id', id)), '[]'::jsonb)
  FROM public.webauthn_credentials WHERE user_id = p_user_id;
$func$;

CREATE OR REPLACE FUNCTION public.webauthn_get_credential(p_id TEXT)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $func$
  SELECT to_jsonb(c) FROM public.webauthn_credentials c WHERE c.id = p_id;
$func$;

CREATE OR REPLACE FUNCTION public.webauthn_save_credential(
  p_id TEXT, p_user_id UUID, p_public_key_spki TEXT, p_algorithm INT, p_sign_count BIGINT, p_rp_id TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
BEGIN
  IF EXISTS (SELECT 1 FROM public.webauthn_credentials WHERE id = p_id AND user_id <> p_user_id) THEN
    RAISE EXCEPTION 'credential_in_use';
  END IF;
  INSERT INTO public.webauthn_credentials (id, user_id, public_key_spki, algorithm, sign_count, rp_id)
  VALUES (p_id, p_user_id, p_public_key_spki, p_algorithm, p_sign_count, p_rp_id)
  ON CONFLICT (id) DO UPDATE SET public_key_spki = EXCLUDED.public_key_spki, algorithm = EXCLUDED.algorithm,
    sign_count = EXCLUDED.sign_count, rp_id = EXCLUDED.rp_id;
  UPDATE public.profiles SET biometric_enabled = TRUE, updated_at = NOW() WHERE id = p_user_id;
END;
$func$;

CREATE OR REPLACE FUNCTION public.webauthn_touch_credential(p_id TEXT, p_sign_count BIGINT)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $func$
  UPDATE public.webauthn_credentials SET sign_count = p_sign_count, last_used_at = NOW() WHERE id = p_id;
$func$;

-- ---------------------------------------------------------------------------
-- 8. Execute privileges
-- ---------------------------------------------------------------------------
DO $grants$
DECLARE
  f TEXT;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'public.throttle_locked_until(TEXT)',
    'public.throttle_fail(TEXT, INT, INTERVAL, INTERVAL)',
    'public.throttle_clear(TEXT)',
    'public._unlock_password_matches(UUID, TEXT)',
    'public.auth_resolve_account(TEXT)',
    'public.auth_get_profile(UUID)',
    'public.auth_check_legacy_password(UUID, TEXT)',
    'public.auth_mark_migrated(UUID)',
    'public.auth_check_recovery_code(UUID, TEXT)',
    'public.auth_provision_profile(UUID, TEXT, TEXT)',
    'public.auth_after_password_reset(UUID, TEXT)',
    'public.auth_touch_login(UUID)',
    'public.webauthn_create_challenge(TEXT, UUID, TEXT, TEXT)',
    'public.webauthn_consume_challenge(TEXT, TEXT)',
    'public.webauthn_list_credentials(UUID)',
    'public.webauthn_get_credential(TEXT)',
    'public.webauthn_save_credential(TEXT, UUID, TEXT, INT, BIGINT, TEXT)',
    'public.webauthn_touch_credential(TEXT, BIGINT)',
    'public.guard_profile_update()',
    'public.guard_connection_request()',
    'public.guard_conversation_member()'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', f);
  END LOOP;

  FOREACH f IN ARRAY ARRAY[
    'public.verify_vault_unlock(TEXT)',
    'public.update_vault_unlock(TEXT, TEXT)',
    'public.update_my_profile(TEXT, TEXT, BOOLEAN)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', f);
  END LOOP;
END;
$grants$;

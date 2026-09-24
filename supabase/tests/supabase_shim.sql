-- Minimal stand-ins for the Supabase platform pieces the migrations use, so the real
-- migrations can be replayed on a plain PostgreSQL (15+) for automated tests.
-- NOT for production: on Supabase these objects already exist.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;
END $$;

CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;
GRANT USAGE ON SCHEMA extensions TO anon, authenticated, service_role;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
DO $$ BEGIN EXECUTE format('ALTER DATABASE %I SET search_path = public, extensions', current_database()); END $$;
SET search_path = public, extensions;

-- auth -------------------------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS auth;
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
CREATE TABLE IF NOT EXISTS auth.users (
  instance_id UUID,
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  aud TEXT, role TEXT,
  email TEXT UNIQUE,
  encrypted_password TEXT,
  email_confirmed_at TIMESTAMPTZ,
  raw_app_meta_data JSONB DEFAULT '{}'::jsonb,
  raw_user_meta_data JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  last_sign_in_at TIMESTAMPTZ,
  banned_until TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ
);
CREATE OR REPLACE FUNCTION auth.uid() RETURNS UUID LANGUAGE sql STABLE AS $$
  SELECT nullif(coalesce(current_setting('request.jwt.claim.sub', true),
                         (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')), '')::uuid
$$;
CREATE OR REPLACE FUNCTION auth.role() RETURNS TEXT LANGUAGE sql STABLE AS $$
  SELECT coalesce(nullif(current_setting('request.jwt.claim.role', true), ''),
                  nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')
$$;
CREATE OR REPLACE FUNCTION auth.jwt() RETURNS JSONB LANGUAGE sql STABLE AS $$
  SELECT coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb)
$$;
CREATE TABLE IF NOT EXISTS auth.sessions (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id UUID, created_at TIMESTAMPTZ DEFAULT now());
CREATE TABLE IF NOT EXISTS auth.refresh_tokens (id BIGSERIAL PRIMARY KEY, user_id TEXT, session_id UUID, revoked BOOLEAN DEFAULT false);
CREATE TABLE IF NOT EXISTS auth.identities (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id UUID, provider TEXT, identity_data JSONB, provider_id TEXT);

-- storage ----------------------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS storage;
GRANT USAGE ON SCHEMA storage TO anon, authenticated, service_role;
CREATE TABLE IF NOT EXISTS storage.buckets (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, owner UUID, public BOOLEAN DEFAULT false,
  file_size_limit BIGINT, allowed_mime_types TEXT[], created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE TABLE IF NOT EXISTS storage.objects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), bucket_id TEXT REFERENCES storage.buckets(id), name TEXT,
  owner UUID, owner_id TEXT, metadata JSONB, created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON storage.objects TO anon, authenticated;
GRANT SELECT ON storage.buckets TO anon, authenticated;
CREATE OR REPLACE FUNCTION storage.foldername(name TEXT) RETURNS TEXT[] LANGUAGE sql IMMUTABLE AS $$
  SELECT (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1]
$$;
CREATE OR REPLACE FUNCTION storage.filename(name TEXT) RETURNS TEXT LANGUAGE sql IMMUTABLE AS $$
  SELECT (string_to_array(name, '/'))[array_length(string_to_array(name, '/'), 1)]
$$;

-- vault ------------------------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS vault;
CREATE TABLE IF NOT EXISTS vault.secrets (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), name TEXT UNIQUE, secret TEXT);
CREATE OR REPLACE VIEW vault.decrypted_secrets AS SELECT id, name, secret AS decrypted_secret FROM vault.secrets;
CREATE OR REPLACE FUNCTION vault.create_secret(new_secret TEXT, new_name TEXT DEFAULT NULL) RETURNS UUID LANGUAGE sql AS $$
  INSERT INTO vault.secrets (name, secret) VALUES (new_name, new_secret) RETURNING id
$$;

-- pg_net (records calls instead of sending them) -----------------------------------
CREATE SCHEMA IF NOT EXISTS net;
CREATE TABLE IF NOT EXISTS net.http_request_log (id BIGSERIAL PRIMARY KEY, url TEXT, headers JSONB, body JSONB, created TIMESTAMPTZ DEFAULT now());
CREATE OR REPLACE FUNCTION net.http_post(url TEXT, body JSONB DEFAULT '{}'::jsonb, params JSONB DEFAULT '{}'::jsonb,
                                         headers JSONB DEFAULT '{}'::jsonb, timeout_milliseconds INT DEFAULT 5000)
RETURNS BIGINT LANGUAGE sql AS $$
  INSERT INTO net.http_request_log (url, headers, body) VALUES (url, headers, body) RETURNING id
$$;

-- realtime publication ------------------------------------------------------------
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;
END $$;

-- Supabase grants everything in public to the API roles by default; RLS and explicit
-- REVOKEs are what actually protect data. Mirror that so tests see production privileges.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;

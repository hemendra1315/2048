-- Migration: 20260922000001_initial_schema.sql
-- Description: Production Schema with Hashed Secrets, Strict 1-to-1 Conversations, Centralized Admin Logging, RLS & Storage

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

--------------------------------------------------------------------------------
-- 1. ENUMS
--------------------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE public.user_role AS ENUM ('user', 'super_admin');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE public.account_status AS ENUM ('active', 'suspended', 'banned');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE public.request_status AS ENUM ('pending', 'accepted', 'rejected');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE public.unlock_method_type AS ENUM ('pin', 'long_press_header', 'tile_pattern', 'secret_gesture', 'score_threshold');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE public.cover_game_type AS ENUM (
    'game_2048',
    'snake',
    'tic_tac_toe',
    'sudoku',
    'minesweeper',
    'brick_breaker',
    'memory_match',
    'bubble_shooter',
    'block_puzzle',
    'flappy_bird'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

--------------------------------------------------------------------------------
-- 2. CORE TABLES
--------------------------------------------------------------------------------

-- Profiles
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  uid TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL CHECK (char_length(display_name) >= 2 AND char_length(display_name) <= 50),
  avatar_url TEXT,
  role public.user_role NOT NULL DEFAULT 'user',
  status public.account_status NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- User Preferences (with HASHED secret storage - no plaintext)
CREATE TABLE IF NOT EXISTS public.user_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID UNIQUE NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  custom_app_name TEXT NOT NULL DEFAULT 'Retro Arcade' CHECK (char_length(custom_app_name) <= 30),
  selected_icon TEXT NOT NULL DEFAULT 'arcade_gamepad',
  selected_game public.cover_game_type NOT NULL DEFAULT 'game_2048',
  unlock_method public.unlock_method_type NOT NULL DEFAULT 'pin',
  unlock_secret_hash TEXT NOT NULL, -- Stored as bcrypt or crypt() hash
  theme_preference TEXT NOT NULL DEFAULT 'dark_modern',
  auto_lock_seconds INT NOT NULL DEFAULT 60,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Game Preferences
CREATE TABLE IF NOT EXISTS public.game_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID UNIQUE NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  selected_game public.cover_game_type NOT NULL DEFAULT 'game_2048',
  sound_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  haptics_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  difficulty TEXT NOT NULL DEFAULT 'normal',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Game Progress (Separate high score & progress per game)
CREATE TABLE IF NOT EXISTS public.game_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  game_name public.cover_game_type NOT NULL,
  high_score BIGINT NOT NULL DEFAULT 0,
  progress_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT unique_user_game_progress UNIQUE (user_id, game_name)
);

-- Connection Requests
CREATE TABLE IF NOT EXISTS public.connection_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  receiver_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status public.request_status NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT no_self_request CHECK (sender_id <> receiver_id),
  CONSTRAINT unique_pending_req UNIQUE (sender_id, receiver_id)
);

-- Connections
CREATE TABLE IF NOT EXISTS public.connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_a UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  user_b UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ordered_users CHECK (user_a < user_b),
  CONSTRAINT unique_connection_pair UNIQUE (user_a, user_b)
);

-- User Blocks
CREATE TABLE IF NOT EXISTS public.user_blocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  blocker_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  blocked_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT no_self_block CHECK (blocker_id <> blocked_id),
  CONSTRAINT unique_block_pair UNIQUE (blocker_id, blocked_id)
);

-- Strict 1-to-1 Conversations (Database-level guarantee of exactly 2 members and no duplicate conversations)
CREATE TABLE IF NOT EXISTS public.conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_a UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  user_b UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT conv_ordered_pair CHECK (user_a < user_b),
  CONSTRAINT unique_conversation_pair UNIQUE (user_a, user_b)
);

-- Conversation Members (Tracks per-user read receipt & live typing)
CREATE TABLE IF NOT EXISTS public.conversation_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  last_read_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_typing BOOLEAN NOT NULL DEFAULT FALSE,
  typing_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT unique_conv_member UNIQUE (conversation_id, user_id)
);

-- Messages (Centralized moderation enabled, no E2EE)
CREATE TABLE IF NOT EXISTS public.messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  content TEXT NOT NULL CHECK (char_length(content) >= 1 AND char_length(content) <= 4000),
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Private Gallery Items
CREATE TABLE IF NOT EXISTS public.gallery_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  image_url TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  caption TEXT CHECK (char_length(caption) <= 250),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Permanent Append-Only Admin Access Log
CREATE TABLE IF NOT EXISTS public.admin_access_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  action_type TEXT NOT NULL, -- VIEW_USER, VIEW_CONVERSATION, VIEW_GALLERY, SUSPEND_USER, BAN_USER, DELETE_GALLERY_ITEM, DELETE_MESSAGE
  target_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  target_resource_id TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

--------------------------------------------------------------------------------
-- 3. INDEXES
--------------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_profiles_uid ON public.profiles (uid);
CREATE INDEX IF NOT EXISTS idx_profiles_status_role ON public.profiles (status, role);

CREATE INDEX IF NOT EXISTS idx_user_preferences_user ON public.user_preferences (user_id);
CREATE INDEX IF NOT EXISTS idx_game_progress_user_game ON public.game_progress (user_id, game_name);

CREATE INDEX IF NOT EXISTS idx_connection_requests_receiver ON public.connection_requests (receiver_id, status);
CREATE INDEX IF NOT EXISTS idx_connection_requests_sender ON public.connection_requests (sender_id, status);
CREATE INDEX IF NOT EXISTS idx_connections_user_a ON public.connections (user_a);
CREATE INDEX IF NOT EXISTS idx_connections_user_b ON public.connections (user_b);
CREATE INDEX IF NOT EXISTS idx_user_blocks_blocker ON public.user_blocks (blocker_id);
CREATE INDEX IF NOT EXISTS idx_user_blocks_blocked ON public.user_blocks (blocked_id);

CREATE INDEX IF NOT EXISTS idx_conversations_users ON public.conversations (user_a, user_b);
CREATE INDEX IF NOT EXISTS idx_conversation_members_user ON public.conversation_members (user_id);
CREATE INDEX IF NOT EXISTS idx_conversation_members_conv ON public.conversation_members (conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_conversation_created ON public.messages (conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_unread ON public.messages (conversation_id, is_read) WHERE is_read = FALSE;

CREATE INDEX IF NOT EXISTS idx_gallery_items_user_created ON public.gallery_items (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_admin_access_log_admin ON public.admin_access_log (admin_id);
CREATE INDEX IF NOT EXISTS idx_admin_access_log_target_user ON public.admin_access_log (target_user_id);
CREATE INDEX IF NOT EXISTS idx_admin_access_log_action ON public.admin_access_log (action_type);
CREATE INDEX IF NOT EXISTS idx_admin_access_log_created ON public.admin_access_log (created_at DESC);

--------------------------------------------------------------------------------
-- 4. FUNCTIONS & TRIGGERS
--------------------------------------------------------------------------------

-- Super Admin Check
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'super_admin' AND status = 'active'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- UID Generator
CREATE OR REPLACE FUNCTION public.generate_unique_uid()
RETURNS TEXT AS $$
DECLARE
  words TEXT[] := ARRAY[
    'CIPHER', 'SHADOW', 'NEXUS', 'SOLAR', 'PRISM', 'VORTEX', 'ECHO', 'AEON',
    'ORBIT', 'APEX', 'ZENITH', 'PULSE', 'TITAN', 'NOVA', 'LUMEN', 'SPECTER',
    'CYBER', 'ATLAS', 'HELIX', 'QUANTUM', 'PHOENIX', 'RADAR', 'KINETIC', 'BLAZE'
  ];
  candidate_uid TEXT;
  exists_uid BOOLEAN;
BEGIN
  LOOP
    candidate_uid := words[floor(random() * array_length(words, 1) + 1)] || '-' || (floor(random() * 9000 + 1000)::INT)::TEXT;
    SELECT EXISTS (SELECT 1 FROM public.profiles WHERE uid = candidate_uid) INTO exists_uid;
    IF NOT exists_uid THEN RETURN candidate_uid; END IF;
  END LOOP;
END;
$$ LANGUAGE plpgsql VOLATILE;

-- Auth Trigger: Initialize Profile, Preferences (Hashed Secret), and Game Settings
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  new_uid TEXT;
  default_secret TEXT;
  secret_hash TEXT;
BEGIN
  new_uid := public.generate_unique_uid();
  default_secret := COALESCE(NEW.raw_user_meta_data->>'unlock_secret', '2048');
  secret_hash := crypt(default_secret, gen_salt('bf', 8));

  -- 1. Profile
  INSERT INTO public.profiles (id, uid, display_name, avatar_url, role)
  VALUES (
    NEW.id,
    new_uid,
    COALESCE(NEW.raw_user_meta_data->>'display_name', 'Player-' || SUBSTRING(NEW.id::TEXT FROM 1 FOR 6)),
    NEW.raw_user_meta_data->>'avatar_url',
    COALESCE((NEW.raw_user_meta_data->>'role')::public.user_role, 'user')
  );

  -- 2. User Preferences (Hashed Secret)
  INSERT INTO public.user_preferences (
    user_id, custom_app_name, selected_icon, selected_game, unlock_method, unlock_secret_hash
  )
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'custom_app_name', 'Retro Arcade'),
    'arcade_gamepad',
    'game_2048',
    'pin',
    secret_hash
  );

  -- 3. Game Preferences
  INSERT INTO public.game_preferences (user_id, selected_game)
  VALUES (NEW.id, 'game_2048');

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Trigger: Maintain conversation_members synchronization when conversation is created
CREATE OR REPLACE FUNCTION public.handle_conversation_created()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.conversation_members (conversation_id, user_id) VALUES (NEW.id, NEW.user_a);
  INSERT INTO public.conversation_members (conversation_id, user_id) VALUES (NEW.id, NEW.user_b);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_conversation_created ON public.conversations;
CREATE TRIGGER on_conversation_created
  AFTER INSERT ON public.conversations
  FOR EACH ROW EXECUTE FUNCTION public.handle_conversation_created();

-- Trigger: When connection request is accepted, create connection and 1-on-1 conversation
CREATE OR REPLACE FUNCTION public.handle_connection_accepted()
RETURNS TRIGGER AS $$
DECLARE
  u1 UUID;
  u2 UUID;
BEGIN
  IF NEW.status = 'accepted' AND OLD.status = 'pending' THEN
    IF NEW.sender_id < NEW.receiver_id THEN
      u1 := NEW.sender_id;
      u2 := NEW.receiver_id;
    ELSE
      u1 := NEW.receiver_id;
      u2 := NEW.sender_id;
    END IF;

    -- Insert connection
    INSERT INTO public.connections (user_a, user_b)
    VALUES (u1, u2)
    ON CONFLICT (user_a, user_b) DO NOTHING;

    -- Insert 1-to-1 conversation (automatically creates 2 members via trigger)
    INSERT INTO public.conversations (user_a, user_b)
    VALUES (u1, u2)
    ON CONFLICT (user_a, user_b) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_connection_request_updated ON public.connection_requests;
CREATE TRIGGER on_connection_request_updated
  AFTER UPDATE OF status ON public.connection_requests
  FOR EACH ROW EXECUTE FUNCTION public.handle_connection_accepted();

-- RPC: Verify Hashed Unlock Secret
CREATE OR REPLACE FUNCTION public.verify_unlock_secret(input_secret TEXT)
RETURNS BOOLEAN AS $$
DECLARE
  stored_hash TEXT;
BEGIN
  SELECT unlock_secret_hash INTO stored_hash
  FROM public.user_preferences
  WHERE user_id = auth.uid();

  IF stored_hash IS NULL THEN
    RETURN FALSE;
  END IF;

  RETURN (stored_hash = crypt(input_secret, stored_hash));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- RPC: Update Hashed Unlock Secret
CREATE OR REPLACE FUNCTION public.update_unlock_secret(old_secret TEXT, new_secret TEXT)
RETURNS BOOLEAN AS $$
DECLARE
  stored_hash TEXT;
  new_hash TEXT;
BEGIN
  SELECT unlock_secret_hash INTO stored_hash
  FROM public.user_preferences
  WHERE user_id = auth.uid();

  IF stored_hash IS NULL OR stored_hash <> crypt(old_secret, stored_hash) THEN
    RAISE EXCEPTION 'Current secret is incorrect.';
  END IF;

  new_hash := crypt(new_secret, gen_salt('bf', 8));

  UPDATE public.user_preferences
  SET unlock_secret_hash = new_hash, updated_at = NOW()
  WHERE user_id = auth.uid();

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- RPC: Exact UID Lookup
CREATE OR REPLACE FUNCTION public.lookup_profile_by_uid(lookup_uid TEXT)
RETURNS TABLE (id UUID, uid TEXT, display_name TEXT, avatar_url TEXT) AS $$
BEGIN
  RETURN QUERY
  SELECT p.id, p.uid, p.display_name, p.avatar_url
  FROM public.profiles p
  WHERE p.uid = UPPER(TRIM(lookup_uid))
    AND p.status = 'active'
    AND p.id <> auth.uid()
    AND NOT EXISTS (
      SELECT 1 FROM public.user_blocks ub
      WHERE (ub.blocker_id = auth.uid() AND ub.blocked_id = p.id)
         OR (ub.blocker_id = p.id AND ub.blocked_id = auth.uid())
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Centralized Admin Action Logger RPC
CREATE OR REPLACE FUNCTION public.log_admin_action(
  p_action_type TEXT,
  p_target_user_id UUID,
  p_target_resource_id TEXT,
  p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS UUID AS $$
DECLARE
  v_log_id UUID;
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Access Denied: Only Super Admins can log moderation events.';
  END IF;

  INSERT INTO public.admin_access_log (
    admin_id, action_type, target_user_id, target_resource_id, metadata
  )
  VALUES (
    auth.uid(), p_action_type, p_target_user_id, p_target_resource_id, p_metadata
  )
  RETURNING id INTO v_log_id;

  RETURN v_log_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

--------------------------------------------------------------------------------
-- 5. ROW LEVEL SECURITY (RLS) POLICIES
--------------------------------------------------------------------------------

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.connection_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gallery_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_access_log ENABLE ROW LEVEL SECURITY;

-- Profiles Policies
DROP POLICY IF EXISTS "profiles_select_policy" ON public.profiles;
CREATE POLICY "profiles_select_policy" ON public.profiles
  FOR SELECT TO authenticated
  USING (
    id = auth.uid() OR public.is_super_admin()
    OR EXISTS (SELECT 1 FROM public.connections WHERE (user_a = auth.uid() AND user_b = profiles.id) OR (user_b = auth.uid() AND user_a = profiles.id))
    OR EXISTS (SELECT 1 FROM public.connection_requests WHERE (sender_id = auth.uid() AND receiver_id = profiles.id) OR (receiver_id = auth.uid() AND sender_id = profiles.id))
  );

DROP POLICY IF EXISTS "profiles_update_policy" ON public.profiles;
CREATE POLICY "profiles_update_policy" ON public.profiles
  FOR UPDATE TO authenticated
  USING (id = auth.uid() OR public.is_super_admin())
  WITH CHECK (id = auth.uid() OR public.is_super_admin());

-- Preferences & Progress (Direct selection of unlock_secret_hash is prevented by omitting it in normal queries)
DROP POLICY IF EXISTS "user_prefs_all_policy" ON public.user_preferences;
CREATE POLICY "user_prefs_all_policy" ON public.user_preferences
  FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "game_prefs_all_policy" ON public.game_preferences;
CREATE POLICY "game_prefs_all_policy" ON public.game_preferences
  FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "game_progress_all_policy" ON public.game_progress;
CREATE POLICY "game_progress_all_policy" ON public.game_progress
  FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- Connection Requests Policies
DROP POLICY IF EXISTS "requests_select_policy" ON public.connection_requests;
CREATE POLICY "requests_select_policy" ON public.connection_requests
  FOR SELECT TO authenticated USING (sender_id = auth.uid() OR receiver_id = auth.uid() OR public.is_super_admin());

DROP POLICY IF EXISTS "requests_insert_policy" ON public.connection_requests;
CREATE POLICY "requests_insert_policy" ON public.connection_requests
  FOR INSERT TO authenticated
  WITH CHECK (
    sender_id = auth.uid()
    AND NOT EXISTS (SELECT 1 FROM public.user_blocks ub WHERE (ub.blocker_id = receiver_id AND ub.blocked_id = auth.uid()) OR (ub.blocker_id = auth.uid() AND ub.blocked_id = receiver_id))
    AND NOT EXISTS (SELECT 1 FROM public.connections WHERE (user_a = LEAST(auth.uid(), receiver_id) AND user_b = GREATEST(auth.uid(), receiver_id)))
  );

DROP POLICY IF EXISTS "requests_update_policy" ON public.connection_requests;
CREATE POLICY "requests_update_policy" ON public.connection_requests
  FOR UPDATE TO authenticated USING (receiver_id = auth.uid() OR public.is_super_admin()) WITH CHECK (receiver_id = auth.uid() OR public.is_super_admin());

DROP POLICY IF EXISTS "requests_delete_policy" ON public.connection_requests;
CREATE POLICY "requests_delete_policy" ON public.connection_requests
  FOR DELETE TO authenticated USING (sender_id = auth.uid() OR receiver_id = auth.uid() OR public.is_super_admin());

-- Connections & Blocks Policies
DROP POLICY IF EXISTS "connections_select_policy" ON public.connections;
CREATE POLICY "connections_select_policy" ON public.connections
  FOR SELECT TO authenticated USING (user_a = auth.uid() OR user_b = auth.uid() OR public.is_super_admin());

DROP POLICY IF EXISTS "connections_delete_policy" ON public.connections;
CREATE POLICY "connections_delete_policy" ON public.connections
  FOR DELETE TO authenticated USING (user_a = auth.uid() OR user_b = auth.uid() OR public.is_super_admin());

DROP POLICY IF EXISTS "blocks_all_policy" ON public.user_blocks;
CREATE POLICY "blocks_all_policy" ON public.user_blocks
  FOR ALL TO authenticated USING (blocker_id = auth.uid()) WITH CHECK (blocker_id = auth.uid());

-- Conversations & Members Policies
DROP POLICY IF EXISTS "conversations_select_policy" ON public.conversations;
CREATE POLICY "conversations_select_policy" ON public.conversations
  FOR SELECT TO authenticated USING (user_a = auth.uid() OR user_b = auth.uid() OR public.is_super_admin());

DROP POLICY IF EXISTS "members_select_policy" ON public.conversation_members;
CREATE POLICY "members_select_policy" ON public.conversation_members
  FOR SELECT TO authenticated
  USING (
    conversation_id IN (SELECT id FROM public.conversations WHERE user_a = auth.uid() OR user_b = auth.uid())
    OR public.is_super_admin()
  );

DROP POLICY IF EXISTS "members_update_policy" ON public.conversation_members;
CREATE POLICY "members_update_policy" ON public.conversation_members
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- Messages Policies
DROP POLICY IF EXISTS "messages_select_policy" ON public.messages;
CREATE POLICY "messages_select_policy" ON public.messages
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.conversations c WHERE c.id = messages.conversation_id AND (c.user_a = auth.uid() OR c.user_b = auth.uid()))
    OR public.is_super_admin()
  );

DROP POLICY IF EXISTS "messages_insert_policy" ON public.messages;
CREATE POLICY "messages_insert_policy" ON public.messages
  FOR INSERT TO authenticated
  WITH CHECK (
    sender_id = auth.uid()
    AND EXISTS (SELECT 1 FROM public.conversations c WHERE c.id = messages.conversation_id AND (c.user_a = auth.uid() OR c.user_b = auth.uid()))
    AND NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND status <> 'active')
  );

DROP POLICY IF EXISTS "messages_delete_policy" ON public.messages;
CREATE POLICY "messages_delete_policy" ON public.messages
  FOR DELETE TO authenticated
  USING (sender_id = auth.uid() OR public.is_super_admin());

-- Gallery Items Policies
DROP POLICY IF EXISTS "gallery_select_policy" ON public.gallery_items;
CREATE POLICY "gallery_select_policy" ON public.gallery_items
  FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.is_super_admin());

DROP POLICY IF EXISTS "gallery_insert_policy" ON public.gallery_items;
CREATE POLICY "gallery_insert_policy" ON public.gallery_items
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND status <> 'active'));

DROP POLICY IF EXISTS "gallery_delete_policy" ON public.gallery_items;
CREATE POLICY "gallery_delete_policy" ON public.gallery_items
  FOR DELETE TO authenticated USING (user_id = auth.uid() OR public.is_super_admin());

-- Admin Access Log Policies (Permanent Append-Only Audit Trail)
DROP POLICY IF EXISTS "admin_log_select_policy" ON public.admin_access_log;
CREATE POLICY "admin_log_select_policy" ON public.admin_access_log
  FOR SELECT TO authenticated USING (public.is_super_admin());

DROP POLICY IF EXISTS "admin_log_insert_policy" ON public.admin_access_log;
CREATE POLICY "admin_log_insert_policy" ON public.admin_access_log
  FOR INSERT TO authenticated WITH CHECK (public.is_super_admin() AND admin_id = auth.uid());

--------------------------------------------------------------------------------
-- 6. STORAGE BUCKETS & POLICIES
--------------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES 
  ('gallery', 'gallery', false, 20971520, ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']),
  ('avatars', 'avatars', true, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO NOTHING;

-- Private Gallery Bucket Policies
DROP POLICY IF EXISTS "gallery_storage_select" ON storage.objects;
CREATE POLICY "gallery_storage_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'gallery' 
    AND ((storage.foldername(name))[1] = auth.uid()::text OR public.is_super_admin())
  );

DROP POLICY IF EXISTS "gallery_storage_insert" ON storage.objects;
CREATE POLICY "gallery_storage_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'gallery' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "gallery_storage_delete" ON storage.objects;
CREATE POLICY "gallery_storage_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'gallery' 
    AND ((storage.foldername(name))[1] = auth.uid()::text OR public.is_super_admin())
  );

-- Avatars Bucket Policies
DROP POLICY IF EXISTS "avatars_storage_select" ON storage.objects;
CREATE POLICY "avatars_storage_select" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'avatars');

DROP POLICY IF EXISTS "avatars_storage_insert" ON storage.objects;
CREATE POLICY "avatars_storage_insert" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "avatars_storage_delete" ON storage.objects;
CREATE POLICY "avatars_storage_delete" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

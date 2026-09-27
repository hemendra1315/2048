-- Migration: 20260927000008_shared_vault_revamp.sql
-- Production schema for Spacious Shared Vault Revamp with Albums, Group Chat RLS, and Soft Deletion.

-- 1. Create shared_vault_albums table
CREATE TABLE IF NOT EXISTS public.shared_vault_albums (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  cover_url TEXT,
  gradient_preset TEXT DEFAULT 'sunset',
  is_locked BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for album queries
CREATE INDEX IF NOT EXISTS idx_shared_vault_albums_conv ON public.shared_vault_albums(conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_shared_vault_albums_creator ON public.shared_vault_albums(created_by);

-- Enable RLS for albums
ALTER TABLE public.shared_vault_albums ENABLE ROW LEVEL SECURITY;

-- Helper function or inline check for 1:1 and Group Chat conversation access
DROP POLICY IF EXISTS "Conversation participants can view albums" ON public.shared_vault_albums;
CREATE POLICY "Conversation participants can view albums"
  ON public.shared_vault_albums FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id = shared_vault_albums.conversation_id
      AND (
        c.user_a = auth.uid() 
        OR c.user_b = auth.uid()
        OR (c.is_group = TRUE AND EXISTS (
          SELECT 1 FROM public.conversation_members cm 
          WHERE cm.conversation_id = c.id AND cm.user_id = auth.uid()
        ))
      )
    ) OR public.is_super_admin()
  );

DROP POLICY IF EXISTS "Conversation participants can insert albums" ON public.shared_vault_albums;
CREATE POLICY "Conversation participants can insert albums"
  ON public.shared_vault_albums FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id = conversation_id
      AND (
        c.user_a = auth.uid() 
        OR c.user_b = auth.uid()
        OR (c.is_group = TRUE AND EXISTS (
          SELECT 1 FROM public.conversation_members cm 
          WHERE cm.conversation_id = c.id AND cm.user_id = auth.uid()
        ))
      )
    )
  );

DROP POLICY IF EXISTS "Conversation participants can update albums" ON public.shared_vault_albums;
CREATE POLICY "Conversation participants can update albums"
  ON public.shared_vault_albums FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id = shared_vault_albums.conversation_id
      AND (
        c.user_a = auth.uid() 
        OR c.user_b = auth.uid()
        OR (c.is_group = TRUE AND EXISTS (
          SELECT 1 FROM public.conversation_members cm 
          WHERE cm.conversation_id = c.id AND cm.user_id = auth.uid()
        ))
      )
    )
  );

DROP POLICY IF EXISTS "Album creator or admin can delete album" ON public.shared_vault_albums;
CREATE POLICY "Album creator or admin can delete album"
  ON public.shared_vault_albums FOR DELETE
  USING (
    created_by = auth.uid() OR public.is_super_admin()
  );

GRANT ALL ON public.shared_vault_albums TO authenticated;

-- 2. Enhance shared_vault_items table
ALTER TABLE public.shared_vault_items
  ADD COLUMN IF NOT EXISTS album_id UUID REFERENCES public.shared_vault_albums(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS file_name TEXT,
  ADD COLUMN IF NOT EXISTS file_size INTEGER,
  ADD COLUMN IF NOT EXISTS mime_type TEXT,
  ADD COLUMN IF NOT EXISTS duration_seconds REAL,
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}';

-- Index for album association and soft delete filtering
CREATE INDEX IF NOT EXISTS idx_shared_vault_album ON public.shared_vault_items(album_id);
CREATE INDEX IF NOT EXISTS idx_shared_vault_deleted ON public.shared_vault_items(conversation_id, deleted_at);

-- Update RLS for shared_vault_items to support Group Chats as well
DROP POLICY IF EXISTS "Participants can view shared vault items" ON public.shared_vault_items;
CREATE POLICY "Participants can view shared vault items"
  ON public.shared_vault_items FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id = shared_vault_items.conversation_id
      AND (
        c.user_a = auth.uid() 
        OR c.user_b = auth.uid()
        OR (c.is_group = TRUE AND EXISTS (
          SELECT 1 FROM public.conversation_members cm 
          WHERE cm.conversation_id = c.id AND cm.user_id = auth.uid()
        ))
      )
    ) OR public.is_super_admin()
  );

DROP POLICY IF EXISTS "Participants can insert shared vault items" ON public.shared_vault_items;
CREATE POLICY "Participants can insert shared vault items"
  ON public.shared_vault_items FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id = conversation_id
      AND (
        c.user_a = auth.uid() 
        OR c.user_b = auth.uid()
        OR (c.is_group = TRUE AND EXISTS (
          SELECT 1 FROM public.conversation_members cm 
          WHERE cm.conversation_id = c.id AND cm.user_id = auth.uid()
        ))
      )
    )
  );

DROP POLICY IF EXISTS "Participants can update shared vault items" ON public.shared_vault_items;
CREATE POLICY "Participants can update shared vault items"
  ON public.shared_vault_items FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id = shared_vault_items.conversation_id
      AND (
        c.user_a = auth.uid() 
        OR c.user_b = auth.uid()
        OR (c.is_group = TRUE AND EXISTS (
          SELECT 1 FROM public.conversation_members cm 
          WHERE cm.conversation_id = c.id AND cm.user_id = auth.uid()
        ))
      )
    )
  );

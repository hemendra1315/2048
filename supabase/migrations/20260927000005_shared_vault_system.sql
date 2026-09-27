-- Migration: 20260927000005_shared_vault_system.sql
-- Production schema for Shared Vault, Room Burn Clock, and Notification Preferences.

-- 1. Add burn_ttl_seconds to conversations
ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS burn_ttl_seconds INTEGER DEFAULT 0;

-- 2. Add notification_template to user_preferences if not present
ALTER TABLE public.user_preferences
  ADD COLUMN IF NOT EXISTS notification_template TEXT DEFAULT 'gaming',
  ADD COLUMN IF NOT EXISTS custom_notification_text TEXT,
  ADD COLUMN IF NOT EXISTS auto_lock_seconds INTEGER DEFAULT 0;

-- 3. Create shared_vault_items table
CREATE TABLE IF NOT EXISTS public.shared_vault_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  saved_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  message_id UUID REFERENCES public.messages(id) ON DELETE SET NULL,
  media_type TEXT NOT NULL CHECK (media_type IN ('image', 'video', 'audio', 'text_memory')),
  media_url TEXT NOT NULL,
  storage_path TEXT,
  caption TEXT,
  memory_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'::jsonb,
  is_favorite BOOLEAN NOT NULL DEFAULT FALSE,
  starred_by UUID[] DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for high-performance timeline queries
CREATE INDEX IF NOT EXISTS idx_shared_vault_conv_date ON public.shared_vault_items(conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_shared_vault_type ON public.shared_vault_items(conversation_id, media_type);
CREATE INDEX IF NOT EXISTS idx_shared_vault_fav ON public.shared_vault_items(conversation_id, is_favorite);
CREATE INDEX IF NOT EXISTS idx_shared_vault_saved_by ON public.shared_vault_items(saved_by);

-- Enable RLS
ALTER TABLE public.shared_vault_items ENABLE ROW LEVEL SECURITY;

-- Policy: View shared vault items (Participants or Super Admin)
DROP POLICY IF EXISTS "Participants can view shared vault items" ON public.shared_vault_items;
CREATE POLICY "Participants can view shared vault items"
  ON public.shared_vault_items FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id = shared_vault_items.conversation_id
      AND (c.user_a = auth.uid() OR c.user_b = auth.uid())
    ) OR public.is_super_admin()
  );

-- Policy: Insert shared vault items (Participants)
DROP POLICY IF EXISTS "Participants can insert shared vault items" ON public.shared_vault_items;
CREATE POLICY "Participants can insert shared vault items"
  ON public.shared_vault_items FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id = conversation_id
      AND (c.user_a = auth.uid() OR c.user_b = auth.uid())
    )
  );

-- Policy: Update shared vault items (Participants)
DROP POLICY IF EXISTS "Participants can update shared vault items" ON public.shared_vault_items;
CREATE POLICY "Participants can update shared vault items"
  ON public.shared_vault_items FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id = shared_vault_items.conversation_id
      AND (c.user_a = auth.uid() OR c.user_b = auth.uid())
    )
  );

-- Policy: Delete shared vault items (Creator or Super Admin)
DROP POLICY IF EXISTS "Creator or super admin can delete vault item" ON public.shared_vault_items;
CREATE POLICY "Creator or super admin can delete vault item"
  ON public.shared_vault_items FOR DELETE
  USING (
    saved_by = auth.uid() OR public.is_super_admin()
  );

GRANT ALL ON public.shared_vault_items TO authenticated;

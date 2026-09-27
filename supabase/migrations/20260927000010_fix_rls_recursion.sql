-- =============================================================================
-- Migration: 20260927000010_fix_rls_recursion.sql
-- Fixes infinite recursion in RLS policies caused by circular references
-- between conversation_members <-> conversations policies.
-- =============================================================================

-- ── conversation_members: simple, non-recursive ────────────────────────────────
-- A member can always see their own rows. No reference to conversations table
-- to avoid circular recursion (conversations policy -> conversation_members -> conversations).

DROP POLICY IF EXISTS "members_select_policy" ON public.conversation_members;
CREATE POLICY "members_select_policy" ON public.conversation_members
  FOR SELECT TO authenticated USING (
    user_id = auth.uid()
    OR public.is_super_admin()
  );

DROP POLICY IF EXISTS "members_insert_policy" ON public.conversation_members;
CREATE POLICY "members_insert_policy" ON public.conversation_members
  FOR INSERT TO authenticated WITH CHECK (
    user_id = auth.uid()
    OR public.is_super_admin()
  );

DROP POLICY IF EXISTS "members_update_policy" ON public.conversation_members;
CREATE POLICY "members_update_policy" ON public.conversation_members
  FOR UPDATE TO authenticated USING (
    user_id = auth.uid()
    OR public.is_super_admin()
  ) WITH CHECK (
    user_id = auth.uid()
    OR public.is_super_admin()
  );

DROP POLICY IF EXISTS "members_delete_policy" ON public.conversation_members;
CREATE POLICY "members_delete_policy" ON public.conversation_members
  FOR DELETE TO authenticated USING (
    user_id = auth.uid()
    OR public.is_super_admin()
  );

-- ── conversations: safe cross-reference to conversation_members ────────────────
-- Now that conversation_members policy does NOT reference conversations,
-- it is safe for conversations to reference conversation_members without recursion.

DROP POLICY IF EXISTS "conversations_select_policy" ON public.conversations;
CREATE POLICY "conversations_select_policy" ON public.conversations
  FOR SELECT TO authenticated USING (
    user_a = auth.uid()
    OR user_b = auth.uid()
    OR created_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.conversation_members cm
      WHERE cm.conversation_id = id AND cm.user_id = auth.uid()
    )
    OR public.is_super_admin()
  );

DROP POLICY IF EXISTS "conversations_insert_policy" ON public.conversations;
CREATE POLICY "conversations_insert_policy" ON public.conversations
  FOR INSERT TO authenticated WITH CHECK (
    (is_group = FALSE AND (user_a = auth.uid() OR user_b = auth.uid()))
    OR (is_group = TRUE AND (created_by = auth.uid() OR created_by IS NULL))
    OR public.is_super_admin()
  );

DROP POLICY IF EXISTS "conversations_update_policy" ON public.conversations;
CREATE POLICY "conversations_update_policy" ON public.conversations
  FOR UPDATE TO authenticated USING (
    user_a = auth.uid()
    OR user_b = auth.uid()
    OR created_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.conversation_members cm
      WHERE cm.conversation_id = id AND cm.user_id = auth.uid()
        AND cm.role IN ('owner','admin')
    )
    OR public.is_super_admin()
  );

-- ── messages: reference conversation_members safely ───────────────────────────
-- conversations_members policy no longer references conversations,
-- so this is also safe from recursion.

DROP POLICY IF EXISTS "messages_select_policy" ON public.messages;
CREATE POLICY "messages_select_policy" ON public.messages
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id = messages.conversation_id
        AND (
          c.user_a = auth.uid()
          OR c.user_b = auth.uid()
          OR c.created_by = auth.uid()
          OR EXISTS (
            SELECT 1 FROM public.conversation_members cm
            WHERE cm.conversation_id = c.id AND cm.user_id = auth.uid()
          )
        )
    )
    OR public.is_super_admin()
  );

DROP POLICY IF EXISTS "messages_insert_policy" ON public.messages;
CREATE POLICY "messages_insert_policy" ON public.messages
  FOR INSERT TO authenticated WITH CHECK (
    sender_id = auth.uid()
    AND NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND status <> 'active')
    AND EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id = messages.conversation_id
        AND (
          c.user_a = auth.uid()
          OR c.user_b = auth.uid()
          OR c.created_by = auth.uid()
          OR EXISTS (
            SELECT 1 FROM public.conversation_members cm
            WHERE cm.conversation_id = c.id AND cm.user_id = auth.uid()
          )
        )
    )
  );

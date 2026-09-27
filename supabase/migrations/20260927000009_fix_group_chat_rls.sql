-- =============================================================================
-- Migration: 20260927000009_fix_group_chat_rls.sql
-- Fixes RLS policies so group chats work alongside 1-on-1 conversations.
-- Also fixes messages/members policies to cover group membership.
-- =============================================================================

-- ── Conversations ─────────────────────────────────────────────────────────────

-- SELECT: members of the conversation can read it (both 1-on-1 and group)
DROP POLICY IF EXISTS "conversations_select_policy" ON public.conversations;
CREATE POLICY "conversations_select_policy" ON public.conversations
  FOR SELECT TO authenticated USING (
    user_a = auth.uid()
    OR user_b = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.conversation_members cm
      WHERE cm.conversation_id = id AND cm.user_id = auth.uid()
    )
    OR public.is_super_admin()
  );

-- INSERT: any authenticated user can create a conversation row
-- (1-on-1 pairs and group chats; integrity enforced by CHECK constraints + RPC)
DROP POLICY IF EXISTS "conversations_insert_policy" ON public.conversations;
CREATE POLICY "conversations_insert_policy" ON public.conversations
  FOR INSERT TO authenticated WITH CHECK (
    -- For 1-on-1: must be one of the participants
    (is_group = FALSE AND (user_a = auth.uid() OR user_b = auth.uid()))
    -- For group: creator must be the signed-in user
    OR (is_group = TRUE AND (created_by = auth.uid() OR created_by IS NULL))
  );

-- UPDATE: members who are owner or admin can update group info
DROP POLICY IF EXISTS "conversations_update_policy" ON public.conversations;
CREATE POLICY "conversations_update_policy" ON public.conversations
  FOR UPDATE TO authenticated USING (
    user_a = auth.uid()
    OR user_b = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.conversation_members cm
      WHERE cm.conversation_id = id AND cm.user_id = auth.uid() AND cm.role IN ('owner','admin')
    )
    OR public.is_super_admin()
  );

-- ── Conversation Members ───────────────────────────────────────────────────────

-- SELECT: see members if you are in the same conversation
DROP POLICY IF EXISTS "members_select_policy" ON public.conversation_members;
CREATE POLICY "members_select_policy" ON public.conversation_members
  FOR SELECT TO authenticated USING (
    user_id = auth.uid()
    OR conversation_id IN (
      SELECT id FROM public.conversations
      WHERE user_a = auth.uid() OR user_b = auth.uid()
    )
    OR conversation_id IN (
      SELECT conversation_id FROM public.conversation_members WHERE user_id = auth.uid()
    )
    OR public.is_super_admin()
  );

-- INSERT: you can add yourself, or an owner/admin can add anyone
DROP POLICY IF EXISTS "members_insert_policy" ON public.conversation_members;
CREATE POLICY "members_insert_policy" ON public.conversation_members
  FOR INSERT TO authenticated WITH CHECK (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.conversation_members cm
      WHERE cm.conversation_id = conversation_id
        AND cm.user_id = auth.uid()
        AND cm.role IN ('owner', 'admin')
    )
    OR public.is_super_admin()
  );

-- UPDATE: update your own membership row, or admins/owners can update others
DROP POLICY IF EXISTS "members_update_policy" ON public.conversation_members;
CREATE POLICY "members_update_policy" ON public.conversation_members
  FOR UPDATE TO authenticated USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.conversation_members cm
      WHERE cm.conversation_id = conversation_id
        AND cm.user_id = auth.uid()
        AND cm.role IN ('owner', 'admin')
    )
    OR public.is_super_admin()
  ) WITH CHECK (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.conversation_members cm
      WHERE cm.conversation_id = conversation_id
        AND cm.user_id = auth.uid()
        AND cm.role IN ('owner', 'admin')
    )
    OR public.is_super_admin()
  );

-- DELETE: leave group (remove yourself), or owner/admin can remove others
DROP POLICY IF EXISTS "members_delete_policy" ON public.conversation_members;
CREATE POLICY "members_delete_policy" ON public.conversation_members
  FOR DELETE TO authenticated USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.conversation_members cm
      WHERE cm.conversation_id = conversation_id
        AND cm.user_id = auth.uid()
        AND cm.role IN ('owner', 'admin')
    )
    OR public.is_super_admin()
  );

-- ── Messages ───────────────────────────────────────────────────────────────────

-- SELECT: see messages in any conversation you're a member of
DROP POLICY IF EXISTS "messages_select_policy" ON public.messages;
CREATE POLICY "messages_select_policy" ON public.messages
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id = messages.conversation_id
        AND (
          c.user_a = auth.uid()
          OR c.user_b = auth.uid()
          OR EXISTS (
            SELECT 1 FROM public.conversation_members cm
            WHERE cm.conversation_id = c.id AND cm.user_id = auth.uid()
          )
        )
    )
    OR public.is_super_admin()
  );

-- INSERT: send messages to any conversation you're a member of
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
          OR EXISTS (
            SELECT 1 FROM public.conversation_members cm
            WHERE cm.conversation_id = c.id AND cm.user_id = auth.uid()
          )
        )
    )
  );

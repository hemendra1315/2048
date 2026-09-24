-- Migration: 20260925000001_advisor_remediation.sql
--
-- Addresses `supabase db advisors` findings for objects this repo actually defines and controls.
-- The live project also reported findings for tables/functions (push_subscriptions, chat_games,
-- user_reports, client_crash_reports, message_reactions, disappearing_message_archive,
-- contact_notification_preferences, user_presence, webauthn_credentials, admin_user_notes,
-- admin_update_report, claim_push_token, and a set of duplicate "*_select"/"*_insert" policies
-- without the "_policy" suffix used here) that do not exist anywhere in this repo's migration
-- history. Those are intentionally left untouched - fixing them blind, without ever having seen
-- their real definition, would risk silently breaking functionality this repo can't see.
--
-- 1. Pins search_path on generate_unique_uid (SECURITY DEFINER function_search_path_mutable).
-- 2. Revokes anon's EXECUTE on is_super_admin() - every policy that calls it is already scoped
--    `TO authenticated`, so anon never legitimately needs it (anon_security_definer_function_executable).
-- 3. Drops the avatars bucket's broad SELECT policy on storage.objects. Public buckets serve
--    objects by URL regardless of RLS; this policy only let any authenticated user list/enumerate
--    every avatar file, which the linter flags (public_bucket_allows_listing).
-- 4. Drops the untracked duplicate index on public.messages, keeping the one this repo creates
--    (duplicate_index).
-- 5. Rewrites this repo's own RLS policies to wrap auth.uid()/is_super_admin() in `(select ...)`
--    so Postgres evaluates them once per query instead of once per row (auth_rls_initplan).
--    Logic is unchanged - this is a pure performance rewrite of policies already defined here.

-- ---------------------------------------------------------------------------
-- 1. Function search_path
-- ---------------------------------------------------------------------------
ALTER FUNCTION public.generate_unique_uid() SET search_path = public;

-- ---------------------------------------------------------------------------
-- 2. is_super_admin: anon never needs it
-- ---------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.is_super_admin() FROM anon;

-- ---------------------------------------------------------------------------
-- 3. Avatars bucket: public bucket doesn't need a listing SELECT policy
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "avatars_storage_select" ON storage.objects;

-- ---------------------------------------------------------------------------
-- 4. Duplicate index on messages
-- ---------------------------------------------------------------------------
DROP INDEX IF EXISTS public.idx_messages_conv_created;

-- ---------------------------------------------------------------------------
-- 5. RLS initplan: wrap auth.<fn>() calls in (select ...)
-- ---------------------------------------------------------------------------

-- Profiles
DROP POLICY IF EXISTS "profiles_select_policy" ON public.profiles;
CREATE POLICY "profiles_select_policy" ON public.profiles
  FOR SELECT TO authenticated
  USING (
    id = (select auth.uid()) OR (select public.is_super_admin())
    OR EXISTS (SELECT 1 FROM public.connections WHERE (user_a = (select auth.uid()) AND user_b = profiles.id) OR (user_b = (select auth.uid()) AND user_a = profiles.id))
    OR EXISTS (SELECT 1 FROM public.connection_requests WHERE (sender_id = (select auth.uid()) AND receiver_id = profiles.id) OR (receiver_id = (select auth.uid()) AND sender_id = profiles.id))
  );

DROP POLICY IF EXISTS "profiles_update_policy" ON public.profiles;
CREATE POLICY "profiles_update_policy" ON public.profiles
  FOR UPDATE TO authenticated
  USING (id = (select auth.uid()) OR (select public.is_super_admin()))
  WITH CHECK (id = (select auth.uid()) OR (select public.is_super_admin()));

-- Preferences & progress
DROP POLICY IF EXISTS "user_prefs_all_policy" ON public.user_preferences;
CREATE POLICY "user_prefs_all_policy" ON public.user_preferences
  FOR ALL TO authenticated USING (user_id = (select auth.uid())) WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "game_prefs_all_policy" ON public.game_preferences;
CREATE POLICY "game_prefs_all_policy" ON public.game_preferences
  FOR ALL TO authenticated USING (user_id = (select auth.uid())) WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "game_progress_all_policy" ON public.game_progress;
CREATE POLICY "game_progress_all_policy" ON public.game_progress
  FOR ALL TO authenticated USING (user_id = (select auth.uid())) WITH CHECK (user_id = (select auth.uid()));

-- Connection requests
DROP POLICY IF EXISTS "requests_select_policy" ON public.connection_requests;
CREATE POLICY "requests_select_policy" ON public.connection_requests
  FOR SELECT TO authenticated USING (sender_id = (select auth.uid()) OR receiver_id = (select auth.uid()) OR (select public.is_super_admin()));

DROP POLICY IF EXISTS "requests_insert_policy" ON public.connection_requests;
CREATE POLICY "requests_insert_policy" ON public.connection_requests
  FOR INSERT TO authenticated
  WITH CHECK (
    sender_id = (select auth.uid())
    AND NOT EXISTS (SELECT 1 FROM public.user_blocks ub WHERE (ub.blocker_id = receiver_id AND ub.blocked_id = (select auth.uid())) OR (ub.blocker_id = (select auth.uid()) AND ub.blocked_id = receiver_id))
    AND NOT EXISTS (SELECT 1 FROM public.connections WHERE (user_a = LEAST((select auth.uid()), receiver_id) AND user_b = GREATEST((select auth.uid()), receiver_id)))
  );

DROP POLICY IF EXISTS "requests_update_policy" ON public.connection_requests;
CREATE POLICY "requests_update_policy" ON public.connection_requests
  FOR UPDATE TO authenticated USING (receiver_id = (select auth.uid()) OR (select public.is_super_admin())) WITH CHECK (receiver_id = (select auth.uid()) OR (select public.is_super_admin()));

DROP POLICY IF EXISTS "requests_delete_policy" ON public.connection_requests;
CREATE POLICY "requests_delete_policy" ON public.connection_requests
  FOR DELETE TO authenticated USING (sender_id = (select auth.uid()) OR receiver_id = (select auth.uid()) OR (select public.is_super_admin()));

-- Connections & blocks
DROP POLICY IF EXISTS "connections_select_policy" ON public.connections;
CREATE POLICY "connections_select_policy" ON public.connections
  FOR SELECT TO authenticated USING (user_a = (select auth.uid()) OR user_b = (select auth.uid()) OR (select public.is_super_admin()));

DROP POLICY IF EXISTS "connections_delete_policy" ON public.connections;
CREATE POLICY "connections_delete_policy" ON public.connections
  FOR DELETE TO authenticated USING (user_a = (select auth.uid()) OR user_b = (select auth.uid()) OR (select public.is_super_admin()));

DROP POLICY IF EXISTS "blocks_all_policy" ON public.user_blocks;
CREATE POLICY "blocks_all_policy" ON public.user_blocks
  FOR ALL TO authenticated USING (blocker_id = (select auth.uid())) WITH CHECK (blocker_id = (select auth.uid()));

-- Conversations & members
DROP POLICY IF EXISTS "conversations_select_policy" ON public.conversations;
CREATE POLICY "conversations_select_policy" ON public.conversations
  FOR SELECT TO authenticated USING (user_a = (select auth.uid()) OR user_b = (select auth.uid()) OR (select public.is_super_admin()));

DROP POLICY IF EXISTS "members_select_policy" ON public.conversation_members;
CREATE POLICY "members_select_policy" ON public.conversation_members
  FOR SELECT TO authenticated
  USING (
    conversation_id IN (SELECT id FROM public.conversations WHERE user_a = (select auth.uid()) OR user_b = (select auth.uid()))
    OR (select public.is_super_admin())
  );

DROP POLICY IF EXISTS "members_update_policy" ON public.conversation_members;
CREATE POLICY "members_update_policy" ON public.conversation_members
  FOR UPDATE TO authenticated USING (user_id = (select auth.uid())) WITH CHECK (user_id = (select auth.uid()));

-- Messages
DROP POLICY IF EXISTS "messages_select_policy" ON public.messages;
CREATE POLICY "messages_select_policy" ON public.messages
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.conversations c WHERE c.id = messages.conversation_id AND (c.user_a = (select auth.uid()) OR c.user_b = (select auth.uid())))
    OR (select public.is_super_admin())
  );

DROP POLICY IF EXISTS "messages_insert_policy" ON public.messages;
CREATE POLICY "messages_insert_policy" ON public.messages
  FOR INSERT TO authenticated
  WITH CHECK (
    sender_id = (select auth.uid())
    AND EXISTS (SELECT 1 FROM public.conversations c WHERE c.id = messages.conversation_id AND (c.user_a = (select auth.uid()) OR c.user_b = (select auth.uid())))
    AND NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = (select auth.uid()) AND status <> 'active')
  );

-- Gallery items
DROP POLICY IF EXISTS "gallery_select_policy" ON public.gallery_items;
CREATE POLICY "gallery_select_policy" ON public.gallery_items
  FOR SELECT TO authenticated USING (user_id = (select auth.uid()) OR (select public.is_super_admin()));

DROP POLICY IF EXISTS "gallery_insert_policy" ON public.gallery_items;
CREATE POLICY "gallery_insert_policy" ON public.gallery_items
  FOR INSERT TO authenticated
  WITH CHECK (user_id = (select auth.uid()) AND NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = (select auth.uid()) AND status <> 'active'));

DROP POLICY IF EXISTS "gallery_delete_policy" ON public.gallery_items;
CREATE POLICY "gallery_delete_policy" ON public.gallery_items
  FOR DELETE TO authenticated USING (user_id = (select auth.uid()) OR (select public.is_super_admin()));

-- Admin access log
DROP POLICY IF EXISTS "admin_log_select_policy" ON public.admin_access_log;
CREATE POLICY "admin_log_select_policy" ON public.admin_access_log
  FOR SELECT TO authenticated USING ((select public.is_super_admin()));

DROP POLICY IF EXISTS "admin_log_insert_policy" ON public.admin_access_log;
CREATE POLICY "admin_log_insert_policy" ON public.admin_access_log
  FOR INSERT TO authenticated WITH CHECK ((select public.is_super_admin()) AND admin_id = (select auth.uid()));

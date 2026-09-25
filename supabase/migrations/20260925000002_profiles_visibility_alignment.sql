-- Migration: 20260925000002_profiles_visibility_alignment.sql
--
-- Resolves the profiles_select drift documented in supabase/UNTRACKED_SCHEMA.md. The live
-- project has two SELECT policies on public.profiles that don't behave the same way:
--
--   - "profiles_select_policy" (tracked here): visible only to yourself, super admins, and
--     users you already have a connection or connection request with.
--   - "profiles_select" (live-only, untracked): visible to anyone authenticated, as long as
--     the profile is active - qual: (status = 'active') OR is_super_admin().
--
-- Since Postgres OR's every applicable RLS policy together, the permissive one already governs
-- in practice - this repo's own "Add a friend" flow (MessagesView.handleCreateChatByUid) looks up
-- a complete stranger's profile by UID/username before any connection or request exists, which
-- only works because of the untracked permissive policy. The restrictive tracked policy alone
-- would break that flow.
--
-- profiles has no sensitive columns for this to leak (id, uid, username, display_name,
-- avatar_url, role, status, timestamps - no email, no password/PIN hashes, which live in the
-- separate account_secrets table this policy doesn't touch), so keeping lookup-by-UID broadly
-- readable is a reasonable, low-risk choice for a messenger whose entire onboarding is "find
-- someone by their UID." This migration keeps that behavior but makes it the one tracked,
-- intentional policy instead of an untracked duplicate silently carrying the real behavior.
--
-- Also drops two literally-duplicate policies on contact_notification_preferences
-- ("Users can manage own notification preferences" / "Users can manage their own notification
-- preferences" - same qual, same with_check, no behavioral difference) down to one.

DROP POLICY IF EXISTS "profiles_select_policy" ON public.profiles;
CREATE POLICY "profiles_select_policy" ON public.profiles
  FOR SELECT TO authenticated
  USING (status = 'active' OR (select public.is_super_admin()));

-- The untracked duplicate is now redundant with the policy above - same effective visibility.
DROP POLICY IF EXISTS "profiles_select" ON public.profiles;

DROP POLICY IF EXISTS "Users can manage their own notification preferences" ON public.contact_notification_preferences;
-- Keeps "Users can manage own notification preferences" (identical qual/with_check).

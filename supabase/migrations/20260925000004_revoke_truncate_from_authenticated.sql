-- Migration: 20260925000004_revoke_truncate_from_authenticated.sql
--
-- TRUNCATE is a table-level grant, not subject to Row-Level Security the way
-- SELECT/INSERT/UPDATE/DELETE are. The original 20260923000001_frictionless_auth.sql
-- migration ran "GRANT ALL ... TO anon, authenticated, service_role" on the core
-- tables, which includes TRUNCATE; 20260923000003_session_auth_hardening.sql only
-- revoked TRUNCATE (among others) on admin_access_log, leaving it granted to
-- authenticated everywhere else. Nothing in the standard PostgREST/Supabase-JS
-- surface can issue a bare TRUNCATE, so this was not reachable through the app —
-- but it's an unnecessary standing over-grant with no RLS backstop, so it's revoked
-- here as defense in depth.

REVOKE TRUNCATE ON
  public.profiles,
  public.contact_notification_preferences,
  public.push_subscriptions,
  public.user_preferences,
  public.game_preferences,
  public.game_progress,
  public.user_blocks,
  public.conversations,
  public.messages,
  public.connection_requests,
  public.connections,
  public.gallery_items,
  public.conversation_members
FROM authenticated;

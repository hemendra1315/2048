-- Migration: 20260923000007_definer_trigger_hardening.sql
-- Security hotfix: the two SECURITY DEFINER trigger functions from the initial schema had no pinned
-- search_path and were executable by anon/authenticated. Trigger functions cannot be invoked as
-- RPCs, so this is defence in depth: pin search_path and remove the unnecessary EXECUTE grants.
-- Triggers keep working (EXECUTE is checked when the trigger is created, not when it fires).

ALTER FUNCTION public.handle_connection_accepted() SET search_path = public;
ALTER FUNCTION public.handle_conversation_created() SET search_path = public;
REVOKE ALL ON FUNCTION public.handle_connection_accepted() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_conversation_created() FROM PUBLIC, anon, authenticated;

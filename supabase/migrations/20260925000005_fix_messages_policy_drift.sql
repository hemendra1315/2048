-- Migration: 20260925000005_fix_messages_policy_drift.sql
--
-- Found while re-verifying an earlier audit fix against the live database (not by reading
-- migration files alone): public.messages carried two INSERT policies simultaneously.
--
--   - "messages_insert" (from 20260922000001_initial_schema.sql): sender_id = auth.uid()
--     AND caller is a member of the conversation.
--   - "messages_insert_policy" (live-only; no migration in this repo created it): the same
--     checks, PLUS a NOT EXISTS check that the caller's profile status is 'active' - i.e. it
--     was meant to block suspended/banned accounts from sending messages.
--
-- Postgres OR-combines all matching RLS policies for the same command, so the looser
-- "messages_insert" fully defeated the suspended/banned-account check: a non-active account
-- could still insert messages through it. This is the same class of drift fixed for
-- admin_access_log in 20260925000003_fix_admin_log_insert_policy.sql - a stricter policy
-- was added live without ever removing the looser original.
--
-- Also drops "messages_select", an exact duplicate of "messages_select_policy" (same qual),
-- which was harmless but redundant.

DROP POLICY IF EXISTS "messages_insert" ON public.messages;
DROP POLICY IF EXISTS "messages_select" ON public.messages;

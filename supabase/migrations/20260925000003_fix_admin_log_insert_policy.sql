-- Migration: 20260925000003_fix_admin_log_insert_policy.sql
--
-- Drops a loose, live-only INSERT policy on public.admin_access_log named
-- "admin_log_insert" (WITH CHECK is_super_admin() only, no admin_id = auth.uid()
-- check). It let any super admin insert an audit-log row attributed to a different
-- admin. The correctly-scoped policy "admin_log_insert_policy" (WITH CHECK
-- is_super_admin() AND admin_id = auth.uid(), from migration 20260923000006) was
-- already present and remains; Postgres OR-combines all matching RLS policies, so
-- the loose one fully defeated the tight one while both existed.
--
-- Also drops a duplicate SELECT policy "admin_log_select" (identical effect to
-- "admin_log_select_policy").
--
-- Root cause: migration 20260923000005_super_admin_user_inspector.sql originally
-- created the loose policy under the name "admin_access_log_insert_policy"; that
-- file has been corrected in place so replaying it can't reopen this gap, but the
-- live database still had an older, differently-named copy of the loose policy
-- ("admin_log_insert") that no prior migration ever dropped.

DROP POLICY IF EXISTS "admin_log_insert" ON public.admin_access_log;
DROP POLICY IF EXISTS "admin_log_select" ON public.admin_access_log;

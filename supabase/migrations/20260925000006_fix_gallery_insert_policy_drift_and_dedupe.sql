-- Migration: 20260925000006_fix_gallery_insert_policy_drift_and_dedupe.sql
--
-- Found by systematically checking every table in the live database for duplicate
-- policies on the same command, after finding the same pattern on admin_access_log
-- (20260925000003) and messages (20260925000005).
--
-- Real gap: public.gallery_items had two permissive INSERT policies simultaneously -
-- "gallery_insert" (loose: user_id = auth.uid() only) and "gallery_insert_policy"
-- (strict: also blocks accounts whose profile status isn't 'active'). RLS OR-combines
-- permissive policies for the same command, so the loose one defeated the strict one -
-- a suspended or banned account could still upload gallery items.
--
-- Also drops four exact-duplicate policies found in the same sweep (identical
-- qual/with_check to a "_policy"-suffixed or differently-named twin) - harmless, but
-- redundant:
--   - conversations_select (dup of conversations_select_policy)
--   - gallery_delete (dup of gallery_delete_policy)
--   - gallery_select (dup of gallery_select_policy)
--   - "Users can manage their own push subscriptions" (dup of "Users can manage own
--     push subscriptions")
--
-- After this migration, a live sweep (see query below) shows no table/command with more
-- than one policy except messages/SELECT, which intentionally carries one permissive
-- policy (messages_select_policy) plus one restrictive policy (messages_hide_expired) -
-- restrictive policies AND-narrow rather than OR-widen, so that pair is correct by design.
--
--   select tablename, cmd, count(*) from pg_policies where schemaname = 'public'
--   group by tablename, cmd having count(*) > 1;

DROP POLICY IF EXISTS "gallery_insert" ON public.gallery_items;
DROP POLICY IF EXISTS "conversations_select" ON public.conversations;
DROP POLICY IF EXISTS "gallery_delete" ON public.gallery_items;
DROP POLICY IF EXISTS "gallery_select" ON public.gallery_items;
DROP POLICY IF EXISTS "Users can manage their own push subscriptions" ON public.push_subscriptions;

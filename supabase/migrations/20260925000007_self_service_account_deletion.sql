-- Migration: 20260925000007_self_service_account_deletion.sql
--
-- Self-service "Delete my account" for Settings. Every table that references a user's own
-- profile with ON DELETE CASCADE (messages, conversations, connections) is a SHARED row with
-- another person, not a per-user copy - hard-deleting auth.users would cascade-delete the
-- other party's conversation history too. So this does what Telegram/WhatsApp do instead:
-- scrub personal identity, permanently lock the account out (reusing the existing
-- "status <> 'active' ends the session / blocks login" enforcement already in AuthContext and
-- vault-auth), and hard-delete only the data that belongs to this user alone. Shared rows
-- (messages, conversations, connections) are left in place; the sender/partner just renders as
-- "Deleted Account" going forward since display_name/avatar_url are cleared.

-- ALTER TYPE ... ADD VALUE cannot run inside a PL/pgSQL block or the same transaction that
-- then uses the new value, so this stays a plain top-level statement.
ALTER TYPE public.account_status ADD VALUE IF NOT EXISTS 'deleted';

CREATE OR REPLACE FUNCTION public.delete_own_account(p_reason TEXT DEFAULT NULL)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_role TEXT;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT role INTO v_role FROM public.profiles WHERE id = v_uid;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Account not found';
  END IF;
  IF v_role = 'super_admin' THEN
    RAISE EXCEPTION 'Super admin accounts cannot self-delete; demote first from the database console' USING ERRCODE = '42501';
  END IF;

  -- Data that belongs to this user alone: safe to hard-delete.
  -- (Gallery storage objects are removed client-side first; this only drops the rows.)
  DELETE FROM public.gallery_items WHERE user_id = v_uid;
  DELETE FROM public.push_subscriptions WHERE user_id = v_uid;
  DELETE FROM public.user_preferences WHERE user_id = v_uid;
  DELETE FROM public.game_preferences WHERE user_id = v_uid;
  DELETE FROM public.game_progress WHERE user_id = v_uid;
  DELETE FROM public.contact_notification_preferences WHERE owner_id = v_uid;
  DELETE FROM public.user_blocks WHERE blocker_id = v_uid OR blocked_id = v_uid;
  DELETE FROM public.connection_requests WHERE sender_id = v_uid OR receiver_id = v_uid;
  DELETE FROM public.admin_user_notes WHERE user_id = v_uid;

  -- Identity scrub. uid/username are left as-is: they're opaque handles, not personal info, and
  -- other people's conversations still reference this row by id.
  UPDATE public.profiles
  SET display_name = 'Deleted Account',
      avatar_url = NULL,
      status = 'deleted',
      updated_at = NOW()
  WHERE id = v_uid;

  -- p_reason is accepted for future use (e.g. a private deletion-feedback table) but not
  -- stored anywhere yet; nothing else in this function reads it.
  PERFORM p_reason;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_own_account(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_own_account(TEXT) TO authenticated;

-- =============================================================================
-- Migration: 20260928000001_fix_group_read_and_presence.sql
-- Two more instances of the same recurring bug class already fixed elsewhere
-- this session: a membership/lookup check written against
-- conversations.user_a/user_b, which are NULL for group conversations, so the
-- check silently always fails for groups (NULL IN/EXISTS never matches).
--
-- 1. mark_conversation_read(): looked up the "other" participant via
--    `v_uid IN (c.user_a, c.user_b)` to verify membership before doing
--    anything. For a group conversation this is always NULL (false), so the
--    function always raised "not a member of this conversation" -- and since
--    the client calls it fire-and-forget with errors swallowed
--    (ChatRoom.tsx's `.then(() => undefined, () => undefined)`), group
--    messages silently never got marked as read, no matter how many times
--    the user opened the chat. Fixed to check real membership via
--    conversation_members, and to skip the pairwise (1:1-only)
--    read-receipts-sharing privacy gate for groups, where it doesn't apply.
--
-- 2. get_presence(): required an EXISTS(...) 1:1 conversation between the
--    caller and the target user via user_a/user_b to return presence/
--    last-seen info at all. For anyone the caller only shares a GROUP
--    conversation with, this never matched, so "last active" info for group
--    members was never returned (falls back to "Active recently" client-side,
--    regardless of their real status). Fixed to check shared membership via
--    conversation_members, covering both 1:1 and group conversations.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.mark_conversation_read(p_conversation_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_uid UUID := auth.uid();
    v_other UUID;
    v_is_member BOOLEAN;
    v_count INTEGER := 0;
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
    END IF;

    SELECT EXISTS (
        SELECT 1 FROM public.conversation_members cm
         WHERE cm.conversation_id = p_conversation_id AND cm.user_id = v_uid
    ) INTO v_is_member;
    IF NOT v_is_member THEN
        RAISE EXCEPTION 'not a member of this conversation' USING ERRCODE = '42501';
    END IF;

    UPDATE public.conversation_members SET last_read_at = now()
     WHERE conversation_id = p_conversation_id AND user_id = v_uid;

    SELECT CASE WHEN c.user_a = v_uid THEN c.user_b ELSE c.user_a END INTO v_other
      FROM public.conversations c WHERE c.id = p_conversation_id;

    IF v_other IS NULL THEN
        -- Group chat: no single pairwise "other" user, so the 1:1-only
        -- read-receipts-sharing privacy toggle doesn't apply here.
        UPDATE public.messages
           SET is_read = true
         WHERE conversation_id = p_conversation_id
           AND sender_id <> v_uid
           AND is_read = false;
        GET DIAGNOSTICS v_count = ROW_COUNT;
    ELSIF coalesce((SELECT share_read_receipts FROM public.user_presence WHERE user_id = v_uid), true)
       AND coalesce((SELECT share_read_receipts FROM public.user_presence WHERE user_id = v_other), true) THEN
        UPDATE public.messages
           SET is_read = true
         WHERE conversation_id = p_conversation_id
           AND sender_id <> v_uid
           AND is_read = false;
        GET DIAGNOSTICS v_count = ROW_COUNT;
    END IF;
    RETURN v_count;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_presence(p_user_ids UUID[])
RETURNS TABLE (user_id UUID, is_online BOOLEAN, last_seen_at TIMESTAMPTZ)
LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public AS $$
DECLARE
    v_uid UUID := auth.uid();
BEGIN
    IF v_uid IS NULL THEN RETURN; END IF;
    IF EXISTS (SELECT 1 FROM public.user_presence WHERE user_presence.user_id = v_uid AND NOT share_presence) THEN
        RETURN;
    END IF;
    RETURN QUERY
    SELECT p.user_id,
           (p.is_online AND p.last_seen_at > now() - interval '75 seconds') AS is_online,
           p.last_seen_at
      FROM public.user_presence p
     WHERE p.user_id = ANY (p_user_ids[1:200])
       AND p.user_id <> v_uid
       AND p.share_presence
       AND NOT public.is_blocked_between(v_uid, p.user_id)
       AND EXISTS (
           SELECT 1 FROM public.conversation_members cm1
            JOIN public.conversation_members cm2 ON cm2.conversation_id = cm1.conversation_id
           WHERE cm1.user_id = v_uid AND cm2.user_id = p.user_id
       );
END;
$$;

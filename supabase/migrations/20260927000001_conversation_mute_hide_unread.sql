-- =============================================================================
-- Migration: 20260927000001_conversation_mute_hide_unread.sql
-- Inbox actions for the DM redesign: mute, hide ("delete" for me only, reappears
-- if the other person sends a new message), and mark-as-unread. All per-member,
-- following the existing pinned_at/chat_theme pattern on conversation_members.
-- =============================================================================

ALTER TABLE public.conversation_members ADD COLUMN IF NOT EXISTS muted_at TIMESTAMPTZ;
ALTER TABLE public.conversation_members ADD COLUMN IF NOT EXISTS hidden_at TIMESTAMPTZ;

-- -----------------------------------------------------------------------------
-- Mute: silences a chat for the caller only. Purely a client-side notification
-- hint (push/toast suppression) — does not affect delivery or read receipts.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_chat_muted(p_conversation_id UUID, p_muted BOOLEAN)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_uid UUID := auth.uid();
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.conversation_members
                    WHERE conversation_id = p_conversation_id AND user_id = v_uid) THEN
        RAISE EXCEPTION 'not a member of this conversation' USING ERRCODE = '42501';
    END IF;
    UPDATE public.conversation_members
       SET muted_at = CASE WHEN p_muted THEN coalesce(muted_at, now()) ELSE NULL END
     WHERE conversation_id = p_conversation_id AND user_id = v_uid;
END;
$$;

-- -----------------------------------------------------------------------------
-- Hide ("delete" from the inbox, for the caller only). The thread and its
-- messages are never touched — this only hides the row from get_chat_list().
-- It reappears automatically once the other person sends a message after the
-- hide timestamp, same idea as WhatsApp/Telegram "delete chat".
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_chat_hidden(p_conversation_id UUID, p_hidden BOOLEAN)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_uid UUID := auth.uid();
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.conversation_members
                    WHERE conversation_id = p_conversation_id AND user_id = v_uid) THEN
        RAISE EXCEPTION 'not a member of this conversation' USING ERRCODE = '42501';
    END IF;
    UPDATE public.conversation_members
       SET hidden_at = CASE WHEN p_hidden THEN now() ELSE NULL END
     WHERE conversation_id = p_conversation_id AND user_id = v_uid;
END;
$$;

-- -----------------------------------------------------------------------------
-- Mark as unread: rewinds last_read_at to just before the partner's most recent
-- message, so it counts as unread again until the chat is reopened (which calls
-- the existing mark_conversation_read()). No new column needed — reuses
-- last_read_at, the same field get_chat_list() already counts unread against.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mark_conversation_unread(p_conversation_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_uid UUID := auth.uid();
    v_last_partner_msg TIMESTAMPTZ;
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.conversation_members
                    WHERE conversation_id = p_conversation_id AND user_id = v_uid) THEN
        RAISE EXCEPTION 'not a member of this conversation' USING ERRCODE = '42501';
    END IF;

    SELECT m.created_at INTO v_last_partner_msg
      FROM public.messages m
     WHERE m.conversation_id = p_conversation_id
       AND m.sender_id <> v_uid
       AND m.deleted_at IS NULL
       AND m.content NOT LIKE '[SYSTEM:%'
       AND (m.expires_at IS NULL OR m.expires_at > now())
     ORDER BY m.created_at DESC
     LIMIT 1;

    IF v_last_partner_msg IS NULL THEN RETURN; END IF;

    UPDATE public.conversation_members
       SET last_read_at = v_last_partner_msg - interval '1 second'
     WHERE conversation_id = p_conversation_id AND user_id = v_uid;
END;
$$;

-- -----------------------------------------------------------------------------
-- Chat list: expose muted_at, and hide conversations the caller hid unless a
-- newer message has arrived since (same LEFT JOIN LATERAL shape as before).
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.get_chat_list();
CREATE FUNCTION public.get_chat_list()
RETURNS TABLE (
    conversation_id UUID,
    partner_id UUID,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ,
    last_message_id UUID,
    last_message_content TEXT,
    last_message_sender_id UUID,
    last_message_at TIMESTAMPTZ,
    last_message_is_read BOOLEAN,
    unread_count INTEGER,
    pinned_at TIMESTAMPTZ,
    muted_at TIMESTAMPTZ,
    disappear_after_seconds INTEGER,
    chat_theme TEXT
)
LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public AS $$
DECLARE
    v_uid UUID := auth.uid();
BEGIN
    IF v_uid IS NULL THEN RETURN; END IF;
    RETURN QUERY
    SELECT c.id,
           CASE WHEN c.user_a = v_uid THEN c.user_b ELSE c.user_a END,
           c.created_at,
           c.updated_at,
           lm.id, lm.content, lm.sender_id, lm.created_at, lm.is_read,
           (SELECT count(*)::int FROM public.messages u
             WHERE u.conversation_id = c.id AND u.sender_id <> v_uid
               AND u.created_at > coalesce(cm.last_read_at, '-infinity'::timestamptz)
               AND NOT u.is_read
               AND u.deleted_at IS NULL AND u.content NOT LIKE '[SYSTEM:%'
               AND (u.expires_at IS NULL OR u.expires_at > now())),
           cm.pinned_at,
           cm.muted_at,
           c.disappear_after_seconds,
           coalesce(cm.chat_theme, 'default')
      FROM public.conversations c
      LEFT JOIN public.conversation_members cm ON cm.conversation_id = c.id AND cm.user_id = v_uid
      LEFT JOIN LATERAL (
          SELECT m.id, m.content, m.sender_id, m.created_at, m.is_read
            FROM public.messages m
           WHERE m.conversation_id = c.id AND (m.expires_at IS NULL OR m.expires_at > now())
           ORDER BY m.created_at DESC
           LIMIT 1
      ) lm ON true
     WHERE v_uid IN (c.user_a, c.user_b)
       AND (cm.hidden_at IS NULL OR cm.hidden_at < coalesce(lm.created_at, c.updated_at))
     ORDER BY cm.pinned_at IS NULL, cm.pinned_at, coalesce(lm.created_at, c.updated_at) DESC;
END;
$$;

-- -----------------------------------------------------------------------------
-- Permissions
-- -----------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.set_chat_muted(UUID, BOOLEAN) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.set_chat_hidden(UUID, BOOLEAN) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.mark_conversation_unread(UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_chat_list() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_chat_muted(UUID, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_chat_hidden(UUID, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_conversation_unread(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_chat_list() TO authenticated;

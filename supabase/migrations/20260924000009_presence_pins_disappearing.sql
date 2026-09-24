-- =============================================================================
-- Migration: 20260924000009_presence_pins_disappearing.sql
-- Chat batch 2: online / last seen (with a privacy switch), pinned chats,
-- disappearing messages, and a single chat-list query with unread counts.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Presence: online / last seen
--    The app calls presence_heartbeat() about every 30 s while open and
--    presence_offline() when it goes to the background. Nobody reads this table
--    directly; get_presence() decides what each person may see.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_presence (
    user_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
    share_presence BOOLEAN NOT NULL DEFAULT true,
    is_online BOOLEAN NOT NULL DEFAULT false,
    last_seen_at TIMESTAMPTZ
);

ALTER TABLE public.user_presence ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.user_presence FROM anon, authenticated;
GRANT SELECT ON public.user_presence TO authenticated;
DROP POLICY IF EXISTS "presence_select_own" ON public.user_presence;
CREATE POLICY "presence_select_own" ON public.user_presence
    FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.presence_heartbeat()
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    IF auth.uid() IS NULL THEN RETURN; END IF;
    INSERT INTO public.user_presence (user_id, is_online, last_seen_at)
    VALUES (auth.uid(), true, now())
    ON CONFLICT (user_id) DO UPDATE
        SET is_online = true,
            last_seen_at = now();
END;
$$;

CREATE OR REPLACE FUNCTION public.presence_offline()
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    IF auth.uid() IS NULL THEN RETURN; END IF;
    UPDATE public.user_presence SET is_online = false, last_seen_at = now() WHERE user_id = auth.uid();
END;
$$;

-- Turning sharing off also hides your last seen immediately.
CREATE OR REPLACE FUNCTION public.set_presence_sharing(p_share BOOLEAN)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
    END IF;
    INSERT INTO public.user_presence (user_id, share_presence)
    VALUES (auth.uid(), coalesce(p_share, true))
    ON CONFLICT (user_id) DO UPDATE SET share_presence = EXCLUDED.share_presence;
END;
$$;

-- Online / last seen for people you have a chat with. Works both ways, like
-- WhatsApp: if you hide yours, you can't see anyone else's either.
-- "Online" means a heartbeat in the last 75 seconds.
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
       AND EXISTS (
           SELECT 1 FROM public.conversations c
            WHERE (c.user_a = v_uid AND c.user_b = p.user_id)
               OR (c.user_b = v_uid AND c.user_a = p.user_id)
       );
END;
$$;

-- -----------------------------------------------------------------------------
-- 2. Pinned chats (per person, up to 3)
-- -----------------------------------------------------------------------------
ALTER TABLE public.conversation_members ADD COLUMN IF NOT EXISTS pinned_at TIMESTAMPTZ;

CREATE OR REPLACE FUNCTION public.set_chat_pinned(p_conversation_id UUID, p_pinned BOOLEAN)
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
    IF p_pinned AND (SELECT count(*) FROM public.conversation_members
                      WHERE user_id = v_uid AND pinned_at IS NOT NULL
                        AND conversation_id <> p_conversation_id) >= 3 THEN
        RAISE EXCEPTION 'you can pin up to 3 chats' USING ERRCODE = '54000';
    END IF;
    UPDATE public.conversation_members
       SET pinned_at = CASE WHEN p_pinned THEN coalesce(pinned_at, now()) ELSE NULL END
     WHERE conversation_id = p_conversation_id AND user_id = v_uid;
END;
$$;

-- -----------------------------------------------------------------------------
-- 3. Disappearing messages
-- -----------------------------------------------------------------------------
ALTER TABLE public.conversations
    ADD COLUMN IF NOT EXISTS disappear_after_seconds INTEGER
    CHECK (disappear_after_seconds IS NULL OR disappear_after_seconds IN (86400, 604800));
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_messages_expires_at ON public.messages (expires_at) WHERE expires_at IS NOT NULL;

-- Insert guard (replaces the batch 1 version): also stamps expires_at from the chat's setting.
CREATE OR REPLACE FUNCTION public.guard_message_insert()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_after INTEGER;
BEGIN
    SELECT disappear_after_seconds INTO v_after FROM public.conversations WHERE id = NEW.conversation_id;

    IF auth.uid() IS NULL THEN
        -- SQL editor / service role: keep given values, but still apply the chat's timer.
        IF NEW.expires_at IS NULL AND v_after IS NOT NULL THEN
            NEW.expires_at := coalesce(NEW.created_at, now()) + make_interval(secs => v_after);
        END IF;
        RETURN NEW;
    END IF;

    NEW.created_at := now();
    NEW.is_read := false;
    NEW.edited_at := NULL;
    NEW.deleted_at := NULL;
    NEW.expires_at := CASE WHEN v_after IS NULL THEN NULL ELSE now() + make_interval(secs => v_after) END;
    IF NEW.reply_to_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.messages m
         WHERE m.id = NEW.reply_to_id AND m.conversation_id = NEW.conversation_id
    ) THEN
        NEW.reply_to_id := NULL;
    END IF;
    -- System notices ([SYSTEM:...]) can only be written by set_disappearing_messages().
    IF NEW.content LIKE '[SYSTEM:%' AND current_setting('app.system_message', true) IS DISTINCT FROM 'on' THEN
        RAISE EXCEPTION 'reserved message format' USING ERRCODE = '22023';
    END IF;
    RETURN NEW;
END;
$$;

-- Expired messages are invisible to everyone (including admins) right away;
-- the cleanup job below then deletes them.
DROP POLICY IF EXISTS "messages_hide_expired" ON public.messages;
CREATE POLICY "messages_hide_expired" ON public.messages
    AS RESTRICTIVE FOR SELECT TO authenticated
    USING (expires_at IS NULL OR expires_at > now());

-- Either person can switch it: NULL = off, 86400 = 24 hours, 604800 = 7 days.
-- Applies to messages sent from now on, and posts a notice in the chat.
CREATE OR REPLACE FUNCTION public.set_disappearing_messages(p_conversation_id UUID, p_seconds INTEGER)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_uid UUID := auth.uid();
    v_current INTEGER;
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
    END IF;
    IF p_seconds IS NOT NULL AND p_seconds NOT IN (86400, 604800) THEN
        RAISE EXCEPTION 'invalid timer' USING ERRCODE = '22023';
    END IF;
    SELECT disappear_after_seconds INTO v_current FROM public.conversations
     WHERE id = p_conversation_id AND v_uid IN (user_a, user_b);
    IF NOT FOUND THEN
        RAISE EXCEPTION 'not a member of this conversation' USING ERRCODE = '42501';
    END IF;
    IF v_current IS NOT DISTINCT FROM p_seconds THEN
        RETURN;
    END IF;

    UPDATE public.conversations SET disappear_after_seconds = p_seconds WHERE id = p_conversation_id;

    PERFORM set_config('app.system_message', 'on', true);
    INSERT INTO public.messages (conversation_id, sender_id, content)
    VALUES (p_conversation_id, v_uid, '[SYSTEM:disappearing:' || coalesce(p_seconds::text, 'off') || ']');
    PERFORM set_config('app.system_message', 'off', true);
END;
$$;

-- No push notification for system notices.
DROP TRIGGER IF EXISTS tr_messages_send_push ON public.messages;
CREATE TRIGGER tr_messages_send_push
    AFTER INSERT ON public.messages
    FOR EACH ROW
    WHEN (NEW.content NOT LIKE '[SYSTEM:%')
    EXECUTE FUNCTION public.handle_new_message_push();

-- Cleanup every 10 minutes, if pg_cron is available (enable it under Database → Extensions).
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
        PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'delete-expired-messages';
        PERFORM cron.schedule(
            'delete-expired-messages',
            '*/10 * * * *',
            $cron$DELETE FROM public.messages WHERE expires_at IS NOT NULL AND expires_at <= now()$cron$
        );
    ELSE
        RAISE NOTICE 'pg_cron not enabled: expired messages are hidden but not deleted until it is';
    END IF;
END;
$$;

-- -----------------------------------------------------------------------------
-- 4. Chat list in one call: last message, unread count, pin, timer
--    (replaces downloading every message of every chat)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_chat_list()
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
    disappear_after_seconds INTEGER
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
             WHERE u.conversation_id = c.id AND u.sender_id <> v_uid AND NOT u.is_read
               AND u.deleted_at IS NULL AND u.content NOT LIKE '[SYSTEM:%'
               AND (u.expires_at IS NULL OR u.expires_at > now())),
           cm.pinned_at,
           c.disappear_after_seconds
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
     ORDER BY cm.pinned_at IS NULL, cm.pinned_at, coalesce(lm.created_at, c.updated_at) DESC;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_messages_conv_created ON public.messages (conversation_id, created_at DESC);

-- -----------------------------------------------------------------------------
-- 5. Permissions
-- -----------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.presence_heartbeat() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.presence_offline() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.set_presence_sharing(BOOLEAN) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_presence(UUID[]) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.set_chat_pinned(UUID, BOOLEAN) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.set_disappearing_messages(UUID, INTEGER) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_chat_list() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.presence_heartbeat() TO authenticated;
GRANT EXECUTE ON FUNCTION public.presence_offline() TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_presence_sharing(BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_presence(UUID[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_chat_pinned(UUID, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_disappearing_messages(UUID, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_chat_list() TO authenticated;

-- Live updates when the other person changes the chat's timer.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
       AND NOT EXISTS (SELECT 1 FROM pg_publication_tables
                        WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'conversations') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.conversations;
    END IF;
END;
$$;

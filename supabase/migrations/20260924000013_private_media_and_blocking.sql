-- =============================================================================
-- Migration: 20260924000013_private_media_and_blocking.sql
--   1. chat-media becomes private. Files live under <conversation_id>/..., and only
--      the two people in that chat (and super admins) can read them, through
--      short-lived signed links. Uploads must go into one of your own chats.
--   2. Blocking is enforced on the server (public.user_blocks already exists):
--      no messages, game invites, timer changes, reactions, game moves or presence
--      between two people when either has blocked the other.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Private chat media
-- -----------------------------------------------------------------------------
UPDATE storage.buckets SET public = false WHERE id = 'chat-media';

DROP POLICY IF EXISTS "chat_media_select_policy" ON storage.objects;
CREATE POLICY "chat_media_select_policy" ON storage.objects
    FOR SELECT TO authenticated
    USING (
        bucket_id = 'chat-media'
        AND (
            (storage.foldername(name))[1] IN (
                SELECT c.id::text FROM public.conversations c
                 WHERE auth.uid() IN (c.user_a, c.user_b)
            )
            OR public.is_super_admin()
        )
    );

DROP POLICY IF EXISTS "chat_media_insert_policy" ON storage.objects;
CREATE POLICY "chat_media_insert_policy" ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (
        bucket_id = 'chat-media'
        AND NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND status <> 'active')
        AND (storage.foldername(name))[1] IN (
            SELECT c.id::text FROM public.conversations c
             WHERE auth.uid() IN (c.user_a, c.user_b)
        )
    );

-- -----------------------------------------------------------------------------
-- 2. Blocking
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_blocked_between(p_a UUID, p_b UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.user_blocks
         WHERE (blocker_id = p_a AND blocked_id = p_b)
            OR (blocker_id = p_b AND blocked_id = p_a)
    );
$$;
REVOKE EXECUTE ON FUNCTION public.is_blocked_between(UUID, UUID) FROM PUBLIC, anon, authenticated;

-- For the chat screen: did I block them, and can we talk at all?
CREATE OR REPLACE FUNCTION public.get_block_status(p_other UUID)
RETURNS TABLE (i_blocked BOOLEAN, blocked_either_way BOOLEAN)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT
        EXISTS (SELECT 1 FROM public.user_blocks WHERE blocker_id = auth.uid() AND blocked_id = p_other),
        public.is_blocked_between(auth.uid(), p_other)
     WHERE auth.uid() IS NOT NULL;
$$;
REVOKE EXECUTE ON FUNCTION public.get_block_status(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_block_status(UUID) TO authenticated;

-- Message insert guard (latest version) + block check. Also covers messages written by
-- start_chat_game() and set_disappearing_messages(), since triggers run for those too.
CREATE OR REPLACE FUNCTION public.guard_message_insert()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_after INTEGER;
    v_other UUID;
BEGIN
    SELECT disappear_after_seconds,
           CASE WHEN user_a = NEW.sender_id THEN user_b ELSE user_a END
      INTO v_after, v_other
      FROM public.conversations WHERE id = NEW.conversation_id;

    IF auth.uid() IS NULL THEN
        IF NEW.expires_at IS NULL AND v_after IS NOT NULL THEN
            NEW.expires_at := coalesce(NEW.created_at, now()) + make_interval(secs => v_after);
        END IF;
        RETURN NEW;
    END IF;

    IF v_other IS NOT NULL AND public.is_blocked_between(NEW.sender_id, v_other) THEN
        RAISE EXCEPTION 'you can''t send messages in this chat' USING ERRCODE = '42501';
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
    IF (NEW.content LIKE '[SYSTEM:%' OR NEW.content LIKE '[GAME:%')
       AND current_setting('app.system_message', true) IS DISTINCT FROM 'on' THEN
        RAISE EXCEPTION 'reserved message format' USING ERRCODE = '22023';
    END IF;
    RETURN NEW;
END;
$$;

-- Reactions and game moves between blocked people are refused.
CREATE OR REPLACE FUNCTION public.guard_blocked_reaction()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_other UUID;
BEGIN
    IF auth.uid() IS NULL THEN RETURN NEW; END IF;
    SELECT CASE WHEN c.user_a = NEW.user_id THEN c.user_b ELSE c.user_a END INTO v_other
      FROM public.messages m JOIN public.conversations c ON c.id = m.conversation_id
     WHERE m.id = NEW.message_id;
    IF v_other IS NOT NULL AND public.is_blocked_between(NEW.user_id, v_other) THEN
        RAISE EXCEPTION 'you can''t react in this chat' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.guard_blocked_reaction() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS tr_reactions_block_guard ON public.message_reactions;
CREATE TRIGGER tr_reactions_block_guard
    BEFORE INSERT OR UPDATE ON public.message_reactions
    FOR EACH ROW EXECUTE FUNCTION public.guard_blocked_reaction();

CREATE OR REPLACE FUNCTION public.guard_blocked_game_move()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    IF auth.uid() IS NOT NULL AND public.is_blocked_between(NEW.player_x, NEW.player_o) THEN
        RAISE EXCEPTION 'you can''t play in this chat' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.guard_blocked_game_move() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS tr_chat_games_block_guard ON public.chat_games;
CREATE TRIGGER tr_chat_games_block_guard
    BEFORE UPDATE ON public.chat_games
    FOR EACH ROW EXECUTE FUNCTION public.guard_blocked_game_move();

-- Timer changes between blocked people are refused (the notice message would be too,
-- but check first so the setting isn't changed without it).
CREATE OR REPLACE FUNCTION public.guard_blocked_timer_change()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    IF auth.uid() IS NOT NULL
       AND NEW.disappear_after_seconds IS DISTINCT FROM OLD.disappear_after_seconds
       AND public.is_blocked_between(NEW.user_a, NEW.user_b) THEN
        RAISE EXCEPTION 'you can''t change settings in this chat' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.guard_blocked_timer_change() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS tr_conversations_block_guard ON public.conversations;
CREATE TRIGGER tr_conversations_block_guard
    BEFORE UPDATE ON public.conversations
    FOR EACH ROW EXECUTE FUNCTION public.guard_blocked_timer_change();

-- Presence: nothing between blocked people.
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
           SELECT 1 FROM public.conversations c
            WHERE (c.user_a = v_uid AND c.user_b = p.user_id)
               OR (c.user_b = v_uid AND c.user_a = p.user_id)
       );
END;
$$;
REVOKE EXECUTE ON FUNCTION public.get_presence(UUID[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_presence(UUID[]) TO authenticated;

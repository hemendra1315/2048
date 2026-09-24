-- =============================================================================
-- Migration: 20260924000011_chat_games_themes_receipts.sql
-- Chat batch 3:
--   * Tic-Tac-Toe played inside a chat (chat_games + two functions)
--   * per-person chat theme (conversation_members.chat_theme)
--   * a real "Read receipts" switch: when either person turns it off, blue ticks
--     aren't set between them; unread counts use last_read_at instead of is_read
-- Stickers, score cards and voice waveforms are message formats and need no tables.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Tic-Tac-Toe in chat
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.chat_games (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
    game_type TEXT NOT NULL DEFAULT 'tictactoe' CHECK (game_type = 'tictactoe'),
    player_x UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    player_o UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    board TEXT NOT NULL DEFAULT '.........' CHECK (board ~ '^[.XO]{9}$'),
    turn UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'finished')),
    winner UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    is_draw BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (player_x <> player_o)
);
CREATE INDEX IF NOT EXISTS idx_chat_games_conversation ON public.chat_games (conversation_id, created_at DESC);

ALTER TABLE public.chat_games ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.chat_games FROM anon, authenticated;
GRANT SELECT ON public.chat_games TO authenticated;
DROP POLICY IF EXISTS "chat_games_select_members" ON public.chat_games;
CREATE POLICY "chat_games_select_members" ON public.chat_games
    FOR SELECT TO authenticated
    USING (EXISTS (
        SELECT 1 FROM public.conversations c
         WHERE c.id = chat_games.conversation_id
           AND (auth.uid() IN (c.user_a, c.user_b) OR public.is_super_admin())
    ));

-- Starts a game (you play X and move first) and posts the invite card in the chat.
CREATE OR REPLACE FUNCTION public.start_chat_game(p_conversation_id UUID)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_uid UUID := auth.uid();
    v_other UUID;
    v_id UUID;
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
    END IF;
    SELECT CASE WHEN user_a = v_uid THEN user_b ELSE user_a END INTO v_other
      FROM public.conversations WHERE id = p_conversation_id AND v_uid IN (user_a, user_b);
    IF v_other IS NULL THEN
        RAISE EXCEPTION 'not a member of this conversation' USING ERRCODE = '42501';
    END IF;
    IF (SELECT count(*) FROM public.chat_games
         WHERE conversation_id = p_conversation_id AND status = 'active') >= 3 THEN
        RAISE EXCEPTION 'finish one of your open games first' USING ERRCODE = '54000';
    END IF;

    INSERT INTO public.chat_games (conversation_id, player_x, player_o, turn)
    VALUES (p_conversation_id, v_uid, v_other, v_uid)
    RETURNING id INTO v_id;

    PERFORM set_config('app.system_message', 'on', true);
    INSERT INTO public.messages (conversation_id, sender_id, content)
    VALUES (p_conversation_id, v_uid, '[GAME:tictactoe:' || v_id || ']');
    PERFORM set_config('app.system_message', 'off', true);
    RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.play_chat_game_move(p_game_id UUID, p_cell INTEGER)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_uid UUID := auth.uid();
    g RECORD;
    v_mark TEXT;
    v_board TEXT;
    v_line INTEGER[];
    v_lines INTEGER[][] := ARRAY[[1,2,3],[4,5,6],[7,8,9],[1,4,7],[2,5,8],[3,6,9],[1,5,9],[3,5,7]];
    v_won BOOLEAN := false;
    i INTEGER;
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
    END IF;
    SELECT * INTO g FROM public.chat_games WHERE id = p_game_id FOR UPDATE;
    IF NOT FOUND OR v_uid NOT IN (g.player_x, g.player_o) THEN
        RAISE EXCEPTION 'game not found' USING ERRCODE = '42501';
    END IF;
    IF g.status <> 'active' THEN
        RAISE EXCEPTION 'this game is over' USING ERRCODE = '22023';
    END IF;
    IF g.turn IS DISTINCT FROM v_uid THEN
        RAISE EXCEPTION 'not your turn' USING ERRCODE = '22023';
    END IF;
    IF p_cell IS NULL OR p_cell < 0 OR p_cell > 8 OR substr(g.board, p_cell + 1, 1) <> '.' THEN
        RAISE EXCEPTION 'that square is taken' USING ERRCODE = '22023';
    END IF;

    v_mark := CASE WHEN v_uid = g.player_x THEN 'X' ELSE 'O' END;
    v_board := overlay(g.board PLACING v_mark FROM p_cell + 1 FOR 1);

    FOR i IN 1 .. array_length(v_lines, 1) LOOP
        IF substr(v_board, v_lines[i][1], 1) = v_mark
           AND substr(v_board, v_lines[i][2], 1) = v_mark
           AND substr(v_board, v_lines[i][3], 1) = v_mark THEN
            v_won := true;
        END IF;
    END LOOP;

    UPDATE public.chat_games
       SET board = v_board,
           status = CASE WHEN v_won OR position('.' IN v_board) = 0 THEN 'finished' ELSE 'active' END,
           winner = CASE WHEN v_won THEN v_uid ELSE NULL END,
           is_draw = (NOT v_won AND position('.' IN v_board) = 0),
           turn = CASE WHEN v_won OR position('.' IN v_board) = 0 THEN NULL
                       WHEN v_uid = g.player_x THEN g.player_o ELSE g.player_x END,
           updated_at = now()
     WHERE id = p_game_id;
END;
$$;

-- Game invites use a reserved format that only start_chat_game() may write.
CREATE OR REPLACE FUNCTION public.guard_message_insert()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_after INTEGER;
BEGIN
    SELECT disappear_after_seconds INTO v_after FROM public.conversations WHERE id = NEW.conversation_id;

    IF auth.uid() IS NULL THEN
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
    IF (NEW.content LIKE '[SYSTEM:%' OR NEW.content LIKE '[GAME:%')
       AND current_setting('app.system_message', true) IS DISTINCT FROM 'on' THEN
        RAISE EXCEPTION 'reserved message format' USING ERRCODE = '22023';
    END IF;
    RETURN NEW;
END;
$$;

-- -----------------------------------------------------------------------------
-- 2. Chat themes (private to each person)
-- -----------------------------------------------------------------------------
ALTER TABLE public.conversation_members
    ADD COLUMN IF NOT EXISTS chat_theme TEXT NOT NULL DEFAULT 'default'
    CHECK (chat_theme IN ('default', 'midnight', 'ocean', 'sunset', 'forest', 'rose', 'mono'));

CREATE OR REPLACE FUNCTION public.set_chat_theme(p_conversation_id UUID, p_theme TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
    END IF;
    UPDATE public.conversation_members SET chat_theme = p_theme
     WHERE conversation_id = p_conversation_id AND user_id = auth.uid();
    IF NOT FOUND THEN
        RAISE EXCEPTION 'not a member of this conversation' USING ERRCODE = '42501';
    END IF;
END;
$$;

-- -----------------------------------------------------------------------------
-- 3. Read receipts switch
-- -----------------------------------------------------------------------------
ALTER TABLE public.user_presence ADD COLUMN IF NOT EXISTS share_read_receipts BOOLEAN NOT NULL DEFAULT true;

CREATE OR REPLACE FUNCTION public.set_read_receipts(p_share BOOLEAN)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
    END IF;
    INSERT INTO public.user_presence (user_id, share_read_receipts)
    VALUES (auth.uid(), coalesce(p_share, true))
    ON CONFLICT (user_id) DO UPDATE SET share_read_receipts = EXCLUDED.share_read_receipts;
END;
$$;

-- Opening a chat always records how far you've read (for your unread count).
-- Blue ticks (is_read) are only set when both of you share read receipts.
CREATE OR REPLACE FUNCTION public.mark_conversation_read(p_conversation_id UUID)
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_uid UUID := auth.uid();
    v_other UUID;
    v_count INTEGER := 0;
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
    END IF;
    SELECT CASE WHEN c.user_a = v_uid THEN c.user_b ELSE c.user_a END INTO v_other
      FROM public.conversations c
     WHERE c.id = p_conversation_id AND v_uid IN (c.user_a, c.user_b);
    IF v_other IS NULL THEN
        RAISE EXCEPTION 'not a member of this conversation' USING ERRCODE = '42501';
    END IF;

    UPDATE public.conversation_members SET last_read_at = now()
     WHERE conversation_id = p_conversation_id AND user_id = v_uid;

    IF coalesce((SELECT share_read_receipts FROM public.user_presence WHERE user_id = v_uid), true)
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
$$;

-- Chat list: unread now counts messages after last_read_at (works with receipts off),
-- and returns your theme.
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
     ORDER BY cm.pinned_at IS NULL, cm.pinned_at, coalesce(lm.created_at, c.updated_at) DESC;
END;
$$;

-- -----------------------------------------------------------------------------
-- 4. Permissions + realtime
-- -----------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.start_chat_game(UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.play_chat_game_move(UUID, INTEGER) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.set_chat_theme(UUID, TEXT) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.set_read_receipts(BOOLEAN) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.mark_conversation_read(UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_chat_list() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.start_chat_game(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.play_chat_game_move(UUID, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_chat_theme(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_read_receipts(BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_conversation_read(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_chat_list() TO authenticated;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
       AND NOT EXISTS (SELECT 1 FROM pg_publication_tables
                        WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'chat_games') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_games;
    END IF;
END;
$$;

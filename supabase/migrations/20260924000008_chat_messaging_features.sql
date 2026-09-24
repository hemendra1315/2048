-- =============================================================================
-- Migration: 20260924000008_chat_messaging_features.sql
-- Chat batch 1: instant send / offline queue, replies, reactions, edit, delete.
--
--   messages.client_id     id generated on the phone, so a queued message that is
--                          retried is stored once (unique per sender)
--   messages.reply_to_id   quoted reply; must be in the same conversation
--   messages.edited_at     set only by edit_message()
--   messages.deleted_at    set only by delete_message_for_everyone()
--   message_reactions      one emoji per person per message
--
-- Typing indicators use Realtime broadcast and need no tables.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. New message columns
-- -----------------------------------------------------------------------------
ALTER TABLE public.messages
    ADD COLUMN IF NOT EXISTS client_id TEXT CHECK (client_id IS NULL OR char_length(client_id) <= 64),
    ADD COLUMN IF NOT EXISTS reply_to_id UUID REFERENCES public.messages(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS edited_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS messages_sender_client_id_uniq
    ON public.messages (sender_id, client_id) WHERE client_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_messages_reply_to ON public.messages (reply_to_id) WHERE reply_to_id IS NOT NULL;

-- -----------------------------------------------------------------------------
-- 2. Insert guard: users can't pre-set server-controlled fields
--    (only applies to app users; SQL editor / service role inserts are untouched)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_message_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF auth.uid() IS NULL THEN
        RETURN NEW;
    END IF;
    NEW.created_at := now();
    NEW.is_read := false;
    NEW.edited_at := NULL;
    NEW.deleted_at := NULL;
    IF NEW.reply_to_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.messages m
         WHERE m.id = NEW.reply_to_id AND m.conversation_id = NEW.conversation_id
    ) THEN
        NEW.reply_to_id := NULL;
    END IF;
    RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.guard_message_insert() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS tr_messages_guard_insert ON public.messages;
CREATE TRIGGER tr_messages_guard_insert
    BEFORE INSERT ON public.messages
    FOR EACH ROW EXECUTE FUNCTION public.guard_message_insert();

-- -----------------------------------------------------------------------------
-- 3. Edit and delete-for-everyone (sender only, within 15 minutes)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.edit_message(p_message_id UUID, p_content TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_msg RECORD;
    v_text TEXT := btrim(coalesce(p_content, ''));
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
    END IF;
    SELECT * INTO v_msg FROM public.messages WHERE id = p_message_id;
    IF NOT FOUND OR v_msg.sender_id <> auth.uid() THEN
        RAISE EXCEPTION 'you can only edit your own messages' USING ERRCODE = '42501';
    END IF;
    IF v_msg.deleted_at IS NOT NULL THEN
        RAISE EXCEPTION 'message was deleted' USING ERRCODE = '22023';
    END IF;
    IF v_msg.created_at < now() - interval '15 minutes' THEN
        RAISE EXCEPTION 'messages can only be edited for 15 minutes' USING ERRCODE = '22023';
    END IF;
    IF v_msg.content LIKE '[%' THEN
        RAISE EXCEPTION 'only text messages can be edited' USING ERRCODE = '22023';
    END IF;
    IF char_length(v_text) < 1 OR char_length(v_text) > 4000 OR v_text LIKE '[%' THEN
        RAISE EXCEPTION 'invalid message text' USING ERRCODE = '22023';
    END IF;

    UPDATE public.messages SET content = v_text, edited_at = now() WHERE id = p_message_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_message_for_everyone(p_message_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_msg RECORD;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
    END IF;
    SELECT * INTO v_msg FROM public.messages WHERE id = p_message_id;
    IF NOT FOUND OR v_msg.sender_id <> auth.uid() THEN
        RAISE EXCEPTION 'you can only delete your own messages' USING ERRCODE = '42501';
    END IF;
    IF v_msg.deleted_at IS NOT NULL THEN
        RETURN;
    END IF;
    IF v_msg.created_at < now() - interval '15 minutes' THEN
        RAISE EXCEPTION 'messages can only be deleted for everyone for 15 minutes' USING ERRCODE = '22023';
    END IF;

    -- Keep the row (so replies and the thread stay intact) but drop the content.
    UPDATE public.messages
       SET content = '[DELETED]', deleted_at = now(), edited_at = NULL
     WHERE id = p_message_id;
    DELETE FROM public.message_reactions WHERE message_id = p_message_id;
END;
$$;

-- -----------------------------------------------------------------------------
-- 4. Reactions
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.message_reactions (
    message_id UUID NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    emoji TEXT NOT NULL CHECK (emoji IN ('❤️', '😂', '👍', '😮', '😢', '🔥')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (message_id, user_id)
);

ALTER TABLE public.message_reactions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.message_reactions FROM anon, authenticated;
GRANT SELECT ON public.message_reactions TO authenticated;

DROP POLICY IF EXISTS "reactions_select_members" ON public.message_reactions;
CREATE POLICY "reactions_select_members" ON public.message_reactions
    FOR SELECT TO authenticated
    USING (EXISTS (
        SELECT 1 FROM public.messages m
          JOIN public.conversations c ON c.id = m.conversation_id
         WHERE m.id = message_reactions.message_id
           AND (auth.uid() IN (c.user_a, c.user_b) OR public.is_super_admin())
    ));

-- Set, change or clear (p_emoji NULL) your reaction on a message in one of your chats.
CREATE OR REPLACE FUNCTION public.set_reaction(p_message_id UUID, p_emoji TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_uid UUID := auth.uid();
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM public.messages m
          JOIN public.conversations c ON c.id = m.conversation_id
         WHERE m.id = p_message_id AND m.deleted_at IS NULL AND v_uid IN (c.user_a, c.user_b)
    ) THEN
        RAISE EXCEPTION 'message not found' USING ERRCODE = '42501';
    END IF;

    IF p_emoji IS NULL THEN
        DELETE FROM public.message_reactions WHERE message_id = p_message_id AND user_id = v_uid;
    ELSE
        INSERT INTO public.message_reactions (message_id, user_id, emoji)
        VALUES (p_message_id, v_uid, p_emoji)
        ON CONFLICT (message_id, user_id) DO UPDATE SET emoji = EXCLUDED.emoji, created_at = now();
    END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.edit_message(UUID, TEXT) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.delete_message_for_everyone(UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.set_reaction(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.edit_message(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_message_for_everyone(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_reaction(UUID, TEXT) TO authenticated;

-- Live reaction updates
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
       AND NOT EXISTS (SELECT 1 FROM pg_publication_tables
                        WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'message_reactions') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.message_reactions;
    END IF;
END;
$$;

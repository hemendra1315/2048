-- =============================================================================
-- Migration: 20260924000012_disappearing_archive.sql
-- Admin archive for disappearing-mode chats.
--   * Messages sent while disappearing mode is on stay in public.messages after
--     they expire (hidden from users, visible to super admins; see …000010).
--   * If such a message is deleted (delete-for-everyone, or a direct delete),
--     its original content is copied to public.disappearing_message_archive first.
--   * Photos are [IMAGE] messages; the files in storage are never removed.
-- Only super admins can read the archive. Users can't read or change it.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.disappearing_message_archive (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id UUID NOT NULL,
    -- No foreign keys: the archive must survive the chat or account being deleted
    -- (and a cascade delete must be able to archive rows while their parents go away).
    conversation_id UUID,
    sender_id UUID,
    content TEXT NOT NULL,
    sent_at TIMESTAMPTZ NOT NULL,
    expires_at TIMESTAMPTZ,
    deleted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_by UUID,
    how TEXT NOT NULL CHECK (how IN ('delete_for_everyone', 'deleted'))
);
CREATE INDEX IF NOT EXISTS idx_disappearing_archive_deleted ON public.disappearing_message_archive (deleted_at DESC);
CREATE INDEX IF NOT EXISTS idx_disappearing_archive_conv ON public.disappearing_message_archive (conversation_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_disappearing_archive_message ON public.disappearing_message_archive (message_id);

ALTER TABLE public.disappearing_message_archive ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.disappearing_message_archive FROM anon, authenticated;
GRANT SELECT ON public.disappearing_message_archive TO authenticated;
DROP POLICY IF EXISTS "disappearing_archive_admin_select" ON public.disappearing_message_archive;
CREATE POLICY "disappearing_archive_admin_select" ON public.disappearing_message_archive
    FOR SELECT TO authenticated USING (public.is_super_admin());

-- Copies a disappearing-mode message before its content is removed.
CREATE OR REPLACE FUNCTION public.archive_disappearing_message(p_msg public.messages, p_how TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    IF p_msg.expires_at IS NULL OR p_msg.deleted_at IS NOT NULL OR p_msg.content = '[DELETED]' THEN
        RETURN;
    END IF;
    INSERT INTO public.disappearing_message_archive
        (message_id, conversation_id, sender_id, content, sent_at, expires_at, deleted_by, how)
    VALUES
        (p_msg.id, p_msg.conversation_id, p_msg.sender_id, p_msg.content, p_msg.created_at, p_msg.expires_at, auth.uid(), p_how)
    ON CONFLICT (message_id) DO NOTHING;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.archive_disappearing_message(public.messages, TEXT) FROM PUBLIC, anon, authenticated;

-- delete-for-everyone: archive, then blank (same rules as before).
CREATE OR REPLACE FUNCTION public.delete_message_for_everyone(p_message_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_msg public.messages;
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

    PERFORM public.archive_disappearing_message(v_msg, 'delete_for_everyone');

    UPDATE public.messages
       SET content = '[DELETED]', deleted_at = now(), edited_at = NULL
     WHERE id = p_message_id;
    DELETE FROM public.message_reactions WHERE message_id = p_message_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.delete_message_for_everyone(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_message_for_everyone(UUID) TO authenticated;

-- A direct delete (users may delete their own rows) is archived too.
CREATE OR REPLACE FUNCTION public.archive_before_message_delete()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    PERFORM public.archive_disappearing_message(OLD, 'deleted');
    RETURN OLD;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.archive_before_message_delete() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS tr_messages_archive_disappearing ON public.messages;
CREATE TRIGGER tr_messages_archive_disappearing
    BEFORE DELETE ON public.messages
    FOR EACH ROW
    WHEN (OLD.expires_at IS NOT NULL)
    EXECUTE FUNCTION public.archive_before_message_delete();

CREATE INDEX IF NOT EXISTS idx_messages_disappearing ON public.messages (created_at DESC) WHERE expires_at IS NOT NULL;

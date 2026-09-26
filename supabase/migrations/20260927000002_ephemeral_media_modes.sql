-- =============================================================================
-- Migration: 20260927000002_ephemeral_media_modes.sql
-- Three-mode ephemeral media: view_once / allow_replay / keep_in_chat.
--
-- IMPORTANT CONTEXT: a prior migration file (20260926000001_view_once_media.sql)
-- describing is_view_once/view_once_opened_at/claim_view_once_media was never
-- actually applied to this project (confirmed via list_migrations + information_schema
-- before writing this file) — those columns and that RPC do not exist here today.
-- This migration is therefore the first time ephemeral media becomes functional in
-- production, not an upgrade of a working feature. It builds directly off the live
-- guard_message_insert() body (confirmed via pg_get_functiondef immediately before
-- writing this), not off the stale migration file.
-- =============================================================================

ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS is_view_once BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS view_once_opened_at TIMESTAMPTZ;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS view_mode TEXT NOT NULL DEFAULT 'keep_in_chat'
    CHECK (view_mode IN ('view_once', 'allow_replay', 'keep_in_chat'));
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS view_count INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_messages_view_mode ON public.messages (conversation_id, view_mode)
    WHERE view_mode <> 'keep_in_chat';

-- -----------------------------------------------------------------------------
-- guard_message_insert(): same live body as today (block-check, disappearing
-- timer, reply validation, reserved-tag guard) plus ephemeral-mode detection
-- from the content tag, and server-forced view_count/opened_at reset so a
-- client can never insert a pre-opened or pre-incremented row.
-- -----------------------------------------------------------------------------
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

    IF NEW.content LIKE '[IMAGE:VIEW_ONCE]%' OR NEW.content LIKE '[VOICE_NOTE:VIEW_ONCE%' THEN
        NEW.view_mode := 'view_once';
    ELSIF NEW.content LIKE '[IMAGE:ALLOW_REPLAY]%' OR NEW.content LIKE '[VOICE_NOTE:ALLOW_REPLAY%' THEN
        NEW.view_mode := 'allow_replay';
    ELSE
        NEW.view_mode := 'keep_in_chat';
    END IF;
    NEW.is_view_once := (NEW.view_mode = 'view_once');
    NEW.view_once_opened_at := NULL;
    NEW.view_count := 0;

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
-- claim_ephemeral_media(): atomic server-authoritative claim.
-- view_once -> max 1 view. allow_replay -> max 2 views. keep_in_chat never
-- calls this at all (client resolves a signed URL directly, same as any
-- ordinary message attachment).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.claim_ephemeral_media(p_message_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_uid UUID := auth.uid();
    v_msg RECORD;
    v_max INTEGER;
    v_updated RECORD;
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
    END IF;

    SELECT m.*, c.user_a, c.user_b INTO v_msg
      FROM public.messages m
      JOIN public.conversations c ON c.id = m.conversation_id
     WHERE m.id = p_message_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'reason', 'not_found');
    END IF;

    IF v_uid NOT IN (v_msg.user_a, v_msg.user_b) AND NOT public.is_super_admin() THEN
        RAISE EXCEPTION 'not a member of this conversation' USING ERRCODE = '42501';
    END IF;

    IF v_msg.deleted_at IS NOT NULL OR (v_msg.expires_at IS NOT NULL AND v_msg.expires_at <= now()) THEN
        RETURN jsonb_build_object('success', false, 'reason', 'unavailable');
    END IF;

    IF v_msg.view_mode NOT IN ('view_once', 'allow_replay') THEN
        RETURN jsonb_build_object('success', false, 'reason', 'not_view_once');
    END IF;

    v_max := CASE WHEN v_msg.view_mode = 'view_once' THEN 1 ELSE 2 END;

    UPDATE public.messages
       SET view_count = view_count + 1,
           view_once_opened_at = coalesce(view_once_opened_at, now()),
           is_read = true
     WHERE id = p_message_id
       AND view_mode IN ('view_once', 'allow_replay')
       AND view_count < v_max
     RETURNING view_count, view_mode, content, view_once_opened_at INTO v_updated;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'reason', CASE WHEN v_msg.view_mode = 'allow_replay' AND v_msg.view_count >= v_max
                           THEN 'max_replays_reached' ELSE 'already_viewed' END,
            'opened_at', v_msg.view_once_opened_at
        );
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'message_id', p_message_id,
        'content', v_updated.content,
        'view_mode', v_updated.view_mode,
        'view_count', v_updated.view_count,
        'max_views', v_max,
        'opened_at', v_updated.view_once_opened_at
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.claim_ephemeral_media(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_ephemeral_media(UUID) TO authenticated;

-- =============================================================================
-- Migration: 20260926000001_view_once_media.sql
-- Production-quality View Once Media for Photos and Voice Notes.
--
-- Features:
--   1. messages.is_view_once        - Flag indicating the media attachment is View Once.
--   2. messages.view_once_opened_at - Timestamp when the recipient claimed/opened it.
--   3. guard_message_insert()       - Ensures users cannot insert pre-opened items.
--   4. claim_view_once_media()      - Race-safe atomic claiming RPC.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Schema Extensions
-- -----------------------------------------------------------------------------
ALTER TABLE public.messages
    ADD COLUMN IF NOT EXISTS is_view_once BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS view_once_opened_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_messages_view_once
    ON public.messages (conversation_id, is_view_once)
    WHERE is_view_once = TRUE;

-- -----------------------------------------------------------------------------
-- 2. Insert Guard Update: Enforce server-controlled view_once_opened_at
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_message_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_after INTEGER;
BEGIN
    SELECT disappear_after_seconds INTO v_after FROM public.conversations WHERE id = NEW.conversation_id;

    IF auth.uid() IS NULL THEN
        -- SQL editor / service role: keep given values, but still apply disappearing timer if needed
        IF NEW.expires_at IS NULL AND v_after IS NOT NULL THEN
            NEW.expires_at := coalesce(NEW.created_at, now()) + make_interval(secs => v_after);
        END IF;
        RETURN NEW;
    END IF;

    NEW.created_at := now();
    NEW.is_read := false;
    NEW.edited_at := NULL;
    NEW.deleted_at := NULL;
    -- Server-authoritative: view_once_opened_at must always start NULL
    NEW.view_once_opened_at := NULL;

    -- Auto-flag is_view_once if message format tag indicates view once
    IF NEW.content LIKE '[IMAGE:VIEW_ONCE]%' OR NEW.content LIKE '[VOICE_NOTE:VIEW_ONCE%' THEN
        NEW.is_view_once := TRUE;
    ELSE
        NEW.is_view_once := coalesce(NEW.is_view_once, FALSE);
    END IF;

    NEW.expires_at := CASE WHEN v_after IS NULL THEN NULL ELSE now() + make_interval(secs => v_after) END;

    IF NEW.reply_to_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.messages m
         WHERE m.id = NEW.reply_to_id AND m.conversation_id = NEW.conversation_id
    ) THEN
        NEW.reply_to_id := NULL;
    END IF;

    -- System notices ([SYSTEM:...]) can only be written by set_disappearing_messages()
    IF NEW.content LIKE '[SYSTEM:%' AND current_setting('app.system_message', true) IS DISTINCT FROM 'on' THEN
        RAISE EXCEPTION 'reserved message format' USING ERRCODE = '22023';
    END IF;

    RETURN NEW;
END;
$$;

-- -----------------------------------------------------------------------------
-- 3. Atomic Race-Safe View Once Claim Function
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.claim_view_once_media(p_message_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_uid UUID := auth.uid();
    v_msg RECORD;
    v_updated RECORD;
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
    END IF;

    -- 1. Fetch and verify existence, conversation membership, and active state
    SELECT m.*, c.user_a, c.user_b
      INTO v_msg
      FROM public.messages m
      JOIN public.conversations c ON c.id = m.conversation_id
     WHERE m.id = p_message_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'reason', 'not_found');
    END IF;

    -- Caller must be a member of the conversation
    IF v_uid NOT IN (v_msg.user_a, v_msg.user_b) AND NOT public.is_super_admin() THEN
        RAISE EXCEPTION 'not authorized to view this media' USING ERRCODE = '42501';
    END IF;

    -- If message was deleted or expired
    IF v_msg.deleted_at IS NOT NULL OR (v_msg.expires_at IS NOT NULL AND v_msg.expires_at <= now()) THEN
        RETURN jsonb_build_object('success', false, 'reason', 'unavailable');
    END IF;

    -- If not a view-once message
    IF NOT v_msg.is_view_once AND v_msg.content NOT LIKE '[IMAGE:VIEW_ONCE]%' AND v_msg.content NOT LIKE '[VOICE_NOTE:VIEW_ONCE%' THEN
        RETURN jsonb_build_object('success', false, 'reason', 'not_view_once');
    END IF;

    -- If already opened
    IF v_msg.view_once_opened_at IS NOT NULL THEN
        RETURN jsonb_build_object('success', false, 'reason', 'already_viewed', 'opened_at', v_msg.view_once_opened_at);
    END IF;

    -- 2. Atomic claim update
    UPDATE public.messages
       SET view_once_opened_at = now(),
           is_read = true
     WHERE id = p_message_id
       AND view_once_opened_at IS NULL
    RETURNING id, content, view_once_opened_at
    INTO v_updated;

    IF NOT FOUND THEN
        -- Race condition: another concurrent request claimed it first
        RETURN jsonb_build_object('success', false, 'reason', 'already_viewed');
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'message_id', v_updated.id,
        'content', v_updated.content,
        'opened_at', v_updated.view_once_opened_at
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.claim_view_once_media(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_view_once_media(UUID) TO authenticated;

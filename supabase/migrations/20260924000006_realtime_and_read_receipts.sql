-- =============================================================================
-- Migration: 20260924000006_realtime_and_read_receipts.sql
--   1. Publishes the tables the app subscribes to, so Realtime (postgres_changes)
--      actually delivers new messages, requests and gallery changes.
--      RLS still decides which rows each client receives.
--   2. mark_conversation_read(): the only way to set messages.is_read. There is
--      deliberately no UPDATE policy on messages (it would allow editing content).
-- =============================================================================

-- 1. Realtime publication (idempotent; skips if the publication doesn't exist)
DO $$
DECLARE
    t TEXT;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
        RAISE NOTICE 'supabase_realtime publication not found; skipping';
        RETURN;
    END IF;
    FOREACH t IN ARRAY ARRAY['messages', 'connections', 'connection_requests', 'gallery_items'] LOOP
        IF NOT EXISTS (
            SELECT 1 FROM pg_publication_tables
             WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t
        ) THEN
            EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
        END IF;
    END LOOP;
END;
$$;

-- 2. Read receipts
CREATE OR REPLACE FUNCTION public.mark_conversation_read(p_conversation_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_uid UUID := auth.uid();
    v_count INTEGER;
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM public.conversations c
         WHERE c.id = p_conversation_id AND v_uid IN (c.user_a, c.user_b)
    ) THEN
        RAISE EXCEPTION 'not a member of this conversation' USING ERRCODE = '42501';
    END IF;

    -- Only the other person's unread messages; only the is_read column changes.
    UPDATE public.messages
       SET is_read = true
     WHERE conversation_id = p_conversation_id
       AND sender_id <> v_uid
       AND is_read = false;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.mark_conversation_read(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_conversation_read(UUID) TO authenticated;

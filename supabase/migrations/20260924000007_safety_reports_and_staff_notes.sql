-- =============================================================================
-- Migration: 20260924000007_safety_reports_and_staff_notes.sql
-- Real storage for the admin Reports queue and Staff Notes (previously kept only in
-- the admin's browser, seeded with fake reports).
--
--   user_reports       filed by users via submit_report(); read + triaged by super admins
--   admin_user_notes   internal staff notes about a user; super admins only
--
-- Users never read reports (not even their own) and never see staff notes.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Tables
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reporter_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    reported_user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    conversation_id UUID REFERENCES public.conversations(id) ON DELETE SET NULL,
    message_id UUID REFERENCES public.messages(id) ON DELETE SET NULL,
    -- Snapshot so the evidence survives if the message is deleted.
    message_snapshot TEXT CHECK (message_snapshot IS NULL OR char_length(message_snapshot) <= 4000),
    category TEXT NOT NULL CHECK (category IN ('harassment','hate_speech','spam','inappropriate_media','impersonation','underage')),
    severity TEXT NOT NULL CHECK (severity IN ('urgent','high','medium','low')),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','investigating','resolved','dismissed')),
    reason TEXT NOT NULL DEFAULT '' CHECK (char_length(reason) <= 1000),
    resolution_notes TEXT CHECK (resolution_notes IS NULL OR char_length(resolution_notes) <= 2000),
    handled_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (reporter_id IS NULL OR reporter_id <> reported_user_id)
);

CREATE INDEX IF NOT EXISTS idx_user_reports_status_created ON public.user_reports (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_reports_reported ON public.user_reports (reported_user_id);
CREATE INDEX IF NOT EXISTS idx_user_reports_reporter_created ON public.user_reports (reporter_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.admin_user_notes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    admin_id UUID DEFAULT auth.uid() REFERENCES public.profiles(id) ON DELETE SET NULL,
    category TEXT NOT NULL DEFAULT 'general' CHECK (category IN ('general','warning','investigation','flag','cleared')),
    note TEXT NOT NULL CHECK (char_length(trim(note)) BETWEEN 1 AND 2000),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_user_notes_user ON public.admin_user_notes (user_id, created_at DESC);

-- -----------------------------------------------------------------------------
-- 2. Access: RLS + grants
-- -----------------------------------------------------------------------------
ALTER TABLE public.user_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_user_notes ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.user_reports FROM anon, authenticated;
REVOKE ALL ON public.admin_user_notes FROM anon, authenticated;

-- Reports: admins read directly; all writes go through the functions below.
GRANT SELECT ON public.user_reports TO authenticated;
DROP POLICY IF EXISTS "user_reports_admin_select" ON public.user_reports;
CREATE POLICY "user_reports_admin_select" ON public.user_reports
    FOR SELECT TO authenticated USING (public.is_super_admin());

-- Staff notes: admins read, add (as themselves) and delete.
GRANT SELECT, DELETE ON public.admin_user_notes TO authenticated;
GRANT INSERT (user_id, category, note) ON public.admin_user_notes TO authenticated;
DROP POLICY IF EXISTS "admin_notes_select" ON public.admin_user_notes;
CREATE POLICY "admin_notes_select" ON public.admin_user_notes
    FOR SELECT TO authenticated USING (public.is_super_admin());
DROP POLICY IF EXISTS "admin_notes_insert" ON public.admin_user_notes;
CREATE POLICY "admin_notes_insert" ON public.admin_user_notes
    FOR INSERT TO authenticated WITH CHECK (public.is_super_admin() AND admin_id = auth.uid());
DROP POLICY IF EXISTS "admin_notes_delete" ON public.admin_user_notes;
CREATE POLICY "admin_notes_delete" ON public.admin_user_notes
    FOR DELETE TO authenticated USING (public.is_super_admin());

-- -----------------------------------------------------------------------------
-- 3. submit_report(): the only way a user files a report
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.submit_report(
    p_reported_user_id UUID,
    p_category TEXT,
    p_reason TEXT DEFAULT '',
    p_conversation_id UUID DEFAULT NULL,
    p_message_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_uid UUID := auth.uid();
    v_severity TEXT;
    v_snapshot TEXT;
    v_msg RECORD;
    v_existing UUID;
    v_id UUID;
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_uid AND status = 'active') THEN
        RAISE EXCEPTION 'account not active' USING ERRCODE = '42501';
    END IF;
    IF p_reported_user_id IS NULL OR p_reported_user_id = v_uid THEN
        RAISE EXCEPTION 'invalid reported user' USING ERRCODE = '22023';
    END IF;
    IF p_category NOT IN ('harassment','hate_speech','spam','inappropriate_media','impersonation','underage') THEN
        RAISE EXCEPTION 'invalid category' USING ERRCODE = '22023';
    END IF;

    -- A user can only report someone they share a conversation with.
    IF p_conversation_id IS NULL THEN
        SELECT c.id INTO p_conversation_id
          FROM public.conversations c
         WHERE (c.user_a = v_uid AND c.user_b = p_reported_user_id)
            OR (c.user_b = v_uid AND c.user_a = p_reported_user_id)
         LIMIT 1;
    END IF;
    IF p_conversation_id IS NULL OR NOT EXISTS (
        SELECT 1 FROM public.conversations c
         WHERE c.id = p_conversation_id
           AND v_uid IN (c.user_a, c.user_b)
           AND p_reported_user_id IN (c.user_a, c.user_b)
    ) THEN
        RAISE EXCEPTION 'you can only report people you have a conversation with' USING ERRCODE = '42501';
    END IF;

    -- A reported message must be in that conversation and sent by the reported user.
    IF p_message_id IS NOT NULL THEN
        SELECT id, sender_id, conversation_id, content INTO v_msg
          FROM public.messages WHERE id = p_message_id;
        IF NOT FOUND OR v_msg.conversation_id <> p_conversation_id OR v_msg.sender_id <> p_reported_user_id THEN
            RAISE EXCEPTION 'message does not belong to the reported user in this conversation' USING ERRCODE = '22023';
        END IF;
        v_snapshot := left(v_msg.content, 4000);
    END IF;

    -- Rate limit: 20 reports per reporter per 24 hours.
    IF (SELECT count(*) FROM public.user_reports
         WHERE reporter_id = v_uid AND created_at > now() - interval '24 hours') >= 20 THEN
        RAISE EXCEPTION 'too many reports; try again later' USING ERRCODE = '54000';
    END IF;

    -- Don't duplicate an open report for the same person/message/category.
    SELECT id INTO v_existing FROM public.user_reports
     WHERE reporter_id = v_uid AND reported_user_id = p_reported_user_id
       AND category = p_category
       AND message_id IS NOT DISTINCT FROM p_message_id
       AND status IN ('pending', 'investigating')
     LIMIT 1;
    IF v_existing IS NOT NULL THEN
        RETURN v_existing;
    END IF;

    v_severity := CASE p_category
        WHEN 'underage' THEN 'urgent'
        WHEN 'inappropriate_media' THEN 'high'
        WHEN 'harassment' THEN 'high'
        WHEN 'hate_speech' THEN 'high'
        WHEN 'impersonation' THEN 'medium'
        ELSE 'low'
    END;

    INSERT INTO public.user_reports (
        reporter_id, reported_user_id, conversation_id, message_id, message_snapshot,
        category, severity, reason
    ) VALUES (
        v_uid, p_reported_user_id, p_conversation_id, p_message_id, v_snapshot,
        p_category, v_severity, left(coalesce(trim(p_reason), ''), 1000)
    ) RETURNING id INTO v_id;

    RETURN v_id;
END;
$$;

-- -----------------------------------------------------------------------------
-- 4. admin_update_report(): status changes, audited
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_update_report(
    p_report_id UUID,
    p_status TEXT,
    p_notes TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_reported UUID;
BEGIN
    IF NOT public.is_super_admin() THEN
        RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501';
    END IF;
    IF p_status NOT IN ('pending','investigating','resolved','dismissed') THEN
        RAISE EXCEPTION 'invalid status' USING ERRCODE = '22023';
    END IF;

    UPDATE public.user_reports
       SET status = p_status,
           resolution_notes = COALESCE(left(nullif(trim(p_notes), ''), 2000), resolution_notes),
           handled_by = auth.uid(),
           updated_at = now()
     WHERE id = p_report_id
    RETURNING reported_user_id INTO v_reported;

    IF v_reported IS NULL THEN
        RAISE EXCEPTION 'report not found' USING ERRCODE = 'P0002';
    END IF;

    INSERT INTO public.admin_access_log (admin_id, action_type, target_user_id, target_resource_id, metadata)
    VALUES (auth.uid(), 'UPDATE_SAFETY_REPORT', v_reported, p_report_id::text,
            jsonb_build_object('status', p_status));
END;
$$;

REVOKE EXECUTE ON FUNCTION public.submit_report(UUID, TEXT, TEXT, UUID, UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_update_report(UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_report(UUID, TEXT, TEXT, UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_report(UUID, TEXT, TEXT) TO authenticated;

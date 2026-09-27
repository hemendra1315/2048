-- =============================================================================
-- Migration: 20260927000021_app_update_notice.sql
-- Lets a super admin publish "a newer APK is available" info (version + update
-- link + optional notes) from a dedicated admin page. Every signed-in client
-- reads it (after vault unlock) to decide whether to show an update prompt.
-- Single-row table: there's only ever one "latest published version" at a time.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.app_update_notice (
    id BOOLEAN PRIMARY KEY DEFAULT true,
    latest_version TEXT NOT NULL,
    update_url TEXT NOT NULL,
    release_notes TEXT,
    updated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT app_update_notice_singleton CHECK (id)
);

ALTER TABLE public.app_update_notice ENABLE ROW LEVEL SECURITY;

-- Every signed-in user needs to read this to check for an update. No direct
-- INSERT/UPDATE/DELETE policy: writes only happen through the RPC below.
DROP POLICY IF EXISTS "app_update_notice_select" ON public.app_update_notice;
CREATE POLICY "app_update_notice_select" ON public.app_update_notice
    FOR SELECT TO authenticated USING (true);

CREATE OR REPLACE FUNCTION public.admin_set_app_update(
    p_latest_version TEXT,
    p_update_url TEXT,
    p_release_notes TEXT DEFAULT NULL
)
RETURNS public.app_update_notice
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_row public.app_update_notice;
BEGIN
    IF NOT public.is_super_admin() THEN
        RAISE EXCEPTION 'Access denied: super admin only' USING ERRCODE = '42501';
    END IF;
    IF trim(coalesce(p_latest_version, '')) = '' THEN
        RAISE EXCEPTION 'Version cannot be empty' USING ERRCODE = '22023';
    END IF;
    IF trim(coalesce(p_update_url, '')) = '' THEN
        RAISE EXCEPTION 'Update URL cannot be empty' USING ERRCODE = '22023';
    END IF;

    INSERT INTO public.app_update_notice (id, latest_version, update_url, release_notes, updated_by, updated_at)
    VALUES (true, trim(p_latest_version), trim(p_update_url), nullif(trim(coalesce(p_release_notes, '')), ''), auth.uid(), now())
    ON CONFLICT (id) DO UPDATE SET
        latest_version = excluded.latest_version,
        update_url = excluded.update_url,
        release_notes = excluded.release_notes,
        updated_by = excluded.updated_by,
        updated_at = excluded.updated_at
    RETURNING * INTO v_row;

    INSERT INTO public.admin_access_log (admin_id, action_type, target_user_id, target_resource_id, metadata)
    VALUES (auth.uid(), 'SET_APP_UPDATE', NULL, NULL,
            jsonb_build_object('latest_version', p_latest_version, 'update_url', p_update_url));

    RETURN v_row;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_set_app_update(TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_app_update(TEXT, TEXT, TEXT) TO authenticated;

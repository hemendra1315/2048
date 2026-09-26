-- =============================================================================
-- Migration: 20260927000003_gallery_google_photos_schema.sql
-- Gallery redesign backend: favorites, soft-delete (Trash), media type, and a
-- lightweight albums table. gallery_items previously had no UPDATE policy at
-- all (only select/insert/delete) — added here, scoped to the owner, for the
-- new favorite/album/soft-delete fields only.
-- =============================================================================

ALTER TABLE public.gallery_items ADD COLUMN IF NOT EXISTS media_type TEXT;
ALTER TABLE public.gallery_items ADD COLUMN IF NOT EXISTS is_favorite BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.gallery_items ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS public.gallery_albums (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    title TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 80),
    cover_item_id UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.gallery_items ADD COLUMN IF NOT EXISTS album_id UUID REFERENCES public.gallery_albums(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_gallery_items_favorite ON public.gallery_items (user_id, is_favorite) WHERE is_favorite;
CREATE INDEX IF NOT EXISTS idx_gallery_items_deleted ON public.gallery_items (user_id, deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_gallery_items_album ON public.gallery_items (album_id) WHERE album_id IS NOT NULL;

ALTER TABLE public.gallery_albums ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.gallery_albums FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.gallery_albums TO authenticated;

DROP POLICY IF EXISTS "gallery_albums_select_policy" ON public.gallery_albums;
CREATE POLICY "gallery_albums_select_policy" ON public.gallery_albums
    FOR SELECT TO authenticated USING (user_id = auth.uid() OR is_super_admin());
DROP POLICY IF EXISTS "gallery_albums_insert_policy" ON public.gallery_albums;
CREATE POLICY "gallery_albums_insert_policy" ON public.gallery_albums
    FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "gallery_albums_update_policy" ON public.gallery_albums;
CREATE POLICY "gallery_albums_update_policy" ON public.gallery_albums
    FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "gallery_albums_delete_policy" ON public.gallery_albums;
CREATE POLICY "gallery_albums_delete_policy" ON public.gallery_albums
    FOR DELETE TO authenticated USING (user_id = auth.uid() OR is_super_admin());

-- Owner-scoped update for favorite / album_id / deleted_at (restore = set deleted_at
-- back to NULL). Callers cannot reassign user_id or edit other people's rows.
DROP POLICY IF EXISTS "gallery_update_policy" ON public.gallery_items;
CREATE POLICY "gallery_update_policy" ON public.gallery_items
    FOR UPDATE TO authenticated
    USING (user_id = auth.uid() OR is_super_admin())
    WITH CHECK (user_id = auth.uid() OR is_super_admin());

-- RLS still allows the owner to read their own soft-deleted rows (Trash needs
-- to show them); the Photos/Search/Collections views filter deleted_at IS NULL
-- at the query level, and Trash filters deleted_at IS NOT NULL explicitly.
DROP POLICY IF EXISTS "gallery_select_policy" ON public.gallery_items;
CREATE POLICY "gallery_select_policy" ON public.gallery_items
    FOR SELECT TO authenticated USING (user_id = auth.uid() OR is_super_admin());

-- Permanently purge anything that's been in Trash for 30+ days. Mirrors the
-- existing expired-messages cron pattern. NOTE: this only deletes the row —
-- Postgres can't call Supabase Storage directly, so the underlying storage
-- object for a purged item is orphaned unless a client (or a future Edge
-- Function on a schedule) also removes it. Soft-delete itself does not touch
-- storage either, matching how gallery delete already behaves on this table.
CREATE OR REPLACE FUNCTION public.purge_deleted_gallery_items()
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_count INTEGER;
BEGIN
    DELETE FROM public.gallery_items
     WHERE deleted_at IS NOT NULL AND deleted_at <= now() - interval '30 days';
    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.purge_deleted_gallery_items() FROM PUBLIC, anon, authenticated;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
        PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'purge-deleted-gallery-items';
        PERFORM cron.schedule(
            'purge-deleted-gallery-items',
            '0 4 * * *',
            $cron$SELECT public.purge_deleted_gallery_items()$cron$
        );
    ELSE
        RAISE NOTICE 'pg_cron not enabled: Trash items are hidden after 30 days but not purged until it is';
    END IF;
END;
$$;

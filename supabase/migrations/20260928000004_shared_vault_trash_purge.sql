-- =============================================================================
-- Migration: 20260928000004_shared_vault_trash_purge.sql
-- Shared Vault items had softDeleteSharedVaultItem()/restoreSharedVaultItem()
-- functions in the client already, but nothing in the UI called them -- Delete
-- was always a permanent, unrecoverable hard delete, unlike the personal
-- Gallery's 30-day Trash. The client now moves items to Trash instead of
-- deleting them outright (see SharedVaultInspectorSheet.tsx), so this adds the
-- server-side half: a scheduled purge, mirroring purge_deleted_gallery_items()
-- / purge-gallery-trash exactly (20260927000003, 20260927000015).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.purge_deleted_shared_vault_items()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  DELETE FROM public.shared_vault_items
  WHERE deleted_at IS NOT NULL AND deleted_at <= now() - interval '30 days';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- Row-only fallback (REVOKEd from clients) in case the Edge Function is ever
-- unreachable; not relied on as the primary path since it can't remove the
-- underlying storage objects the way purge-shared-vault-trash does.
REVOKE EXECUTE ON FUNCTION public.purge_deleted_shared_vault_items() FROM PUBLIC, anon, authenticated;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'purge-deleted-shared-vault-items';
    PERFORM cron.schedule(
      'purge-deleted-shared-vault-items',
      '15 4 * * *',
      $cron$
      SELECT net.http_post(
        url := 'https://dddsplxihciighvmaqqt.supabase.co/functions/v1/purge-shared-vault-trash',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRkZHNwbHhpaGNpaWdodm1hcXF0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk3MzkwMjMsImV4cCI6MjEwNTMxNTAyM30.pnsb2zejuaHkauMMM0d6otRofPxMtx-K0-1iMvWeyJ8'
        ),
        body := '{}'::jsonb
      );
      $cron$
    );
  ELSE
    RAISE NOTICE 'pg_cron not enabled: Shared Vault Trash items are hidden after 30 days but not purged until it is';
  END IF;
END;
$$;

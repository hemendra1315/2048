-- =============================================================================
-- Migration: 20260928000005_schedule_disappearing_cleanup.sql
-- The 'delete-expired-messages' cron job (20260924000009) was only ever
-- scheduled conditionally on pg_cron being installed -- it wasn't yet at the
-- time, so the job was silently never created. pg_cron was installed later
-- (20260927000015, for the gallery purge job) but this job was never
-- re-scheduled, so expired disappearing messages have been accumulating in
-- `messages` ever since (harmless: RLS already hides them from regular users
-- once expires_at passes, and the archive-before-delete trigger from
-- 20260924000012 guarantees a super admin keeps the original content in
-- disappearing_message_archive regardless of whether/when this row is later
-- deleted). This just (re)schedules the intended cleanup now that pg_cron
-- is actually available, so `messages` doesn't grow unbounded with rows no
-- living user can see.
-- =============================================================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'delete-expired-messages';
    PERFORM cron.schedule(
      'delete-expired-messages',
      '*/10 * * * *',
      $cron$DELETE FROM public.messages WHERE expires_at IS NOT NULL AND expires_at <= now()$cron$
    );
  ELSE
    RAISE NOTICE 'pg_cron not enabled: expired messages are hidden but not deleted until it is';
  END IF;
END;
$$;

-- =============================================================================
-- Migration: 20260924000010_admin_keeps_expired_messages.sql
-- Disappearing messages disappear for the two people in the chat, but are kept
-- (indefinitely) and remain visible to super admins for moderation.
--   * expired messages: hidden from users, visible to is_super_admin()
--   * the pg_cron cleanup job from 20260924000009 is removed (nothing is deleted)
-- The app tells users that moderators can still review expired messages.
-- =============================================================================

DROP POLICY IF EXISTS "messages_hide_expired" ON public.messages;
CREATE POLICY "messages_hide_expired" ON public.messages
    AS RESTRICTIVE FOR SELECT TO authenticated
    USING (expires_at IS NULL OR expires_at > now() OR public.is_super_admin());

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
        PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'delete-expired-messages';
    END IF;
END;
$$;

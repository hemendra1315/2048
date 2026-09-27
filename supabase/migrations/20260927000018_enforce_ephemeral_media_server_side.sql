-- =============================================================================
-- Migration: 20260927000018_enforce_ephemeral_media_server_side.sql
-- (Recorded after the fact: this was applied live via apply_migration during
-- this session and is only now being saved as a local file for repo/DB parity.
-- Superseded by 20260927000020, which replaced the content-substring match
-- used here with a durable ephemeral_storage_path column -- kept here for an
-- accurate history of what was actually applied, in order.)
--
-- Closes Critical Finding #1: view-once/allow-replay media was never actually
-- gated server-side. claim_ephemeral_media() only tracked a view counter; the
-- storage bucket's SELECT policy only checked conversation membership, so any
-- member could call createSignedUrl() on the object directly, any number of
-- times, forever.
--
-- Fix: chat_media_select_policy now additionally denies direct signing for
-- any object that belongs to a view_once/allow_replay message. The only
-- remaining path to a signed URL for that object is the claim-ephemeral-media
-- Edge Function, which claims the view (enforcing the count) and only signs
-- the URL if the claim actually succeeded.
-- =============================================================================
DROP POLICY IF EXISTS "chat_media_select_policy" ON storage.objects;
CREATE POLICY "chat_media_select_policy" ON storage.objects
    FOR SELECT TO authenticated
    USING (
        bucket_id = 'chat-media'
        AND (
            (storage.foldername(name))[1] IN (
                SELECT cm.conversation_id::text FROM public.conversation_members cm
                 WHERE cm.user_id = auth.uid()
            )
            OR public.is_super_admin()
        )
        AND NOT EXISTS (
            SELECT 1 FROM public.messages m
             WHERE m.conversation_id::text = (storage.foldername(name))[1]
               AND m.view_mode IN ('view_once', 'allow_replay')
               AND position(name IN m.content) > 0
        )
    );

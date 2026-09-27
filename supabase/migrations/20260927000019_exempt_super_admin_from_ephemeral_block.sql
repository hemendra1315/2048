-- =============================================================================
-- Migration: 20260927000019_exempt_super_admin_from_ephemeral_block.sql
-- (Recorded after the fact: this was applied live via apply_migration during
-- this session and is only now being saved as a local file for repo/DB parity.
-- Superseded by 20260927000020, which replaced the content-substring match
-- used here with a durable ephemeral_storage_path column -- kept here for an
-- accurate history of what was actually applied, in order.)
--
-- Super admins need to keep resolving view-once/allow-replay media directly
-- for safety-report moderation (the Admin Conversation Viewer already relies
-- on this) -- the ephemeral block from 20260927000018 should only apply to
-- ordinary conversation members, not admin oversight.
-- =============================================================================
DROP POLICY IF EXISTS "chat_media_select_policy" ON storage.objects;
CREATE POLICY "chat_media_select_policy" ON storage.objects
    FOR SELECT TO authenticated
    USING (
        bucket_id = 'chat-media'
        AND (
            public.is_super_admin()
            OR (
                (storage.foldername(name))[1] IN (
                    SELECT cm.conversation_id::text FROM public.conversation_members cm
                     WHERE cm.user_id = auth.uid()
                )
                AND NOT EXISTS (
                    SELECT 1 FROM public.messages m
                     WHERE m.conversation_id::text = (storage.foldername(name))[1]
                       AND m.view_mode IN ('view_once', 'allow_replay')
                       AND position(name IN m.content) > 0
                )
            )
        )
    );

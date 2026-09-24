-- =============================================================================
-- Migration: 20260924000014_keep_messages_and_media.sql
-- Users can no longer permanently remove chat content through the API:
--   1. chat-media files (photos, voice notes) can only be deleted by super admins.
--      Before, the uploader could delete their own files, including photos from
--      disappearing chats that are meant to be kept.
--   2. messages rows can only be deleted by super admins. Before, a sender could
--      hard-delete any of their own messages at any time, bypassing the 15-minute
--      delete-for-everyone rule and removing it from admin view. Users remove
--      messages with delete_message_for_everyone(), which keeps the row.
-- The app never used either path for normal users.
-- =============================================================================

-- 1. Chat media: admin-only delete
DROP POLICY IF EXISTS "chat_media_delete_policy" ON storage.objects;
CREATE POLICY "chat_media_delete_policy" ON storage.objects
    FOR DELETE TO authenticated
    USING (bucket_id = 'chat-media' AND public.is_super_admin());

-- 2. Messages: admin-only delete
DROP POLICY IF EXISTS "messages_delete_policy" ON public.messages;
CREATE POLICY "messages_delete_policy" ON public.messages
    FOR DELETE TO authenticated
    USING (public.is_super_admin());

-- =============================================================================
-- Migration: 20260923000008_chat_media_storage.sql
-- Dedicated Supabase Storage Bucket & RLS Policies for Chat Media (Photos/Voice)
-- =============================================================================

-- 1. Create chat-media bucket in storage.buckets
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'chat-media',
  'chat-media',
  true,
  20971520, -- 20MB limit
  ARRAY[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'audio/webm',
    'audio/mp4',
    'audio/ogg',
    'audio/mpeg',
    'audio/wav'
  ]
)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 20971520,
  allowed_mime_types = ARRAY[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'audio/webm',
    'audio/mp4',
    'audio/ogg',
    'audio/mpeg',
    'audio/wav'
  ];

-- 2. Allow public / authenticated reads for chat-media
DROP POLICY IF EXISTS "chat_media_select_policy" ON storage.objects;
CREATE POLICY "chat_media_select_policy" ON storage.objects
  FOR SELECT TO public
  USING (bucket_id = 'chat-media');

-- 3. Allow authenticated users to upload chat media
DROP POLICY IF EXISTS "chat_media_insert_policy" ON storage.objects;
CREATE POLICY "chat_media_insert_policy" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'chat-media'
    AND NOT EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND status <> 'active'
    )
  );

-- 4. Allow sender or super admin to delete chat media
DROP POLICY IF EXISTS "chat_media_delete_policy" ON storage.objects;
CREATE POLICY "chat_media_delete_policy" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'chat-media'
    AND (
      owner = auth.uid()
      OR public.is_super_admin()
    )
  );

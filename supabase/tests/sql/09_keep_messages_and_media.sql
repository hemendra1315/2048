-- Users can't permanently delete messages or chat media (20260924000014); super admins can.
SELECT tests.make_user('00000000-0000-4000-8000-0000000000a1', 'Alice');
SELECT tests.make_user('00000000-0000-4000-8000-0000000000b2', 'Bob');
SELECT tests.make_user('00000000-0000-4000-8000-0000000000d4', 'Admin', 'super_admin');
SELECT set_config('t.chat', tests.make_chat('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000b2')::text, true);
INSERT INTO storage.objects (bucket_id, name, owner) VALUES
  ('chat-media', current_setting('t.chat') || '/mine.jpg', '00000000-0000-4000-8000-0000000000a1'),
  ('chat-media', current_setting('t.chat') || '/admin-removes.jpg', '00000000-0000-4000-8000-0000000000a1');

SET LOCAL ROLE authenticated;
SELECT tests.claims('00000000-0000-4000-8000-0000000000a1');
INSERT INTO public.messages (id, conversation_id, sender_id, content) VALUES
  ('00000000-0000-4000-8000-00000000c001', current_setting('t.chat')::uuid, '00000000-0000-4000-8000-0000000000a1', 'normal chat'),
  ('00000000-0000-4000-8000-00000000c002', current_setting('t.chat')::uuid, '00000000-0000-4000-8000-0000000000a1', 'admin removes');

-- The sender tries to remove their own message and file directly.
SELECT tests.try($$DELETE FROM public.messages WHERE id = '00000000-0000-4000-8000-00000000c001'$$);
SELECT tests.try($$DELETE FROM storage.objects WHERE bucket_id = 'chat-media' AND name LIKE '%/mine.jpg'$$);
-- The other person can't either.
SELECT tests.claims('00000000-0000-4000-8000-0000000000b2');
SELECT tests.try($$DELETE FROM public.messages WHERE id = '00000000-0000-4000-8000-00000000c001'$$);
SELECT tests.try($$DELETE FROM storage.objects WHERE bucket_id = 'chat-media'$$);

-- Admins can.
SELECT tests.claims('00000000-0000-4000-8000-0000000000d4');
DELETE FROM public.messages WHERE id = '00000000-0000-4000-8000-00000000c002';
DELETE FROM storage.objects WHERE bucket_id = 'chat-media' AND name LIKE '%/admin-removes.jpg';
RESET ROLE;

DO $$ BEGIN
  ASSERT EXISTS (SELECT 1 FROM public.messages WHERE id = '00000000-0000-4000-8000-00000000c001'), 'a user hard-deleted a message';
  ASSERT EXISTS (SELECT 1 FROM storage.objects WHERE bucket_id = 'chat-media' AND name LIKE '%/mine.jpg'), 'a user deleted chat media';
  ASSERT NOT EXISTS (SELECT 1 FROM public.messages WHERE id = '00000000-0000-4000-8000-00000000c002'), 'admin could not delete a message';
  ASSERT NOT EXISTS (SELECT 1 FROM storage.objects WHERE name LIKE '%/admin-removes.jpg'), 'admin could not delete chat media';
END $$;

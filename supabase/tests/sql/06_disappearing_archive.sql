-- Deleted messages from disappearing chats are archived for super admins only.
SELECT tests.make_user('00000000-0000-4000-8000-0000000000a1', 'Alice');
SELECT tests.make_user('00000000-0000-4000-8000-0000000000b2', 'Bob');
SELECT tests.make_user('00000000-0000-4000-8000-0000000000d4', 'Admin', 'super_admin');
SELECT set_config('t.chat', tests.make_chat('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000b2')::text, true);

SET LOCAL ROLE authenticated;
SELECT tests.claims('00000000-0000-4000-8000-0000000000a1');
SELECT public.set_disappearing_messages(current_setting('t.chat')::uuid, 86400);
INSERT INTO public.messages (id, conversation_id, sender_id, content) VALUES
 ('00000000-0000-4000-8000-00000000a001', current_setting('t.chat')::uuid, '00000000-0000-4000-8000-0000000000a1', 'secret'),
 ('00000000-0000-4000-8000-00000000a002', current_setting('t.chat')::uuid, '00000000-0000-4000-8000-0000000000a1', '[IMAGE]https://x/p.jpg');
SELECT public.delete_message_for_everyone('00000000-0000-4000-8000-00000000a001');
SELECT tests.sees_nothing('SELECT * FROM public.disappearing_message_archive', 'user reads archive');
SELECT tests.must_fail($$INSERT INTO public.disappearing_message_archive (message_id, content, sent_at, how)
  VALUES (gen_random_uuid(), 'x', now(), 'deleted')$$, NULL, 'user writes archive');

-- Only admins can remove a row outright (20260924000014); that is archived too.
SELECT tests.claims('00000000-0000-4000-8000-0000000000d4');
DELETE FROM public.messages WHERE id = '00000000-0000-4000-8000-00000000a002';
DO $$ BEGIN
  ASSERT (SELECT content FROM public.disappearing_message_archive WHERE how = 'delete_for_everyone') = 'secret', 'deleted text not archived';
  ASSERT (SELECT content FROM public.disappearing_message_archive WHERE how = 'deleted') = '[IMAGE]https://x/p.jpg', 'removed photo not archived';
END $$;
RESET ROLE;

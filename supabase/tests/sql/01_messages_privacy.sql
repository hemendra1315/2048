-- Messages: only the two people in a chat (and super admins) can read them;
-- nobody can send as someone else or forge server-controlled fields.
SELECT tests.make_user('00000000-0000-4000-8000-0000000000a1', 'Alice');
SELECT tests.make_user('00000000-0000-4000-8000-0000000000b2', 'Bob');
SELECT tests.make_user('00000000-0000-4000-8000-0000000000c3', 'Carol');
SELECT tests.make_user('00000000-0000-4000-8000-0000000000d4', 'Admin', 'super_admin');
SELECT set_config('t.chat', tests.make_chat('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000b2')::text, true);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000a1', true);
INSERT INTO public.messages (conversation_id, sender_id, content, created_at, is_read, edited_at)
VALUES (current_setting('t.chat')::uuid, '00000000-0000-4000-8000-0000000000a1', 'hello bob', now() - interval '3 days', true, now());
DO $$ DECLARE r RECORD; BEGIN
  SELECT * INTO r FROM public.messages WHERE content = 'hello bob';
  ASSERT r.created_at > now() - interval '1 minute', 'sender could backdate a message';
  ASSERT NOT r.is_read, 'sender could mark own message read';
  ASSERT r.edited_at IS NULL, 'sender could fake an edit';
END $$;
SELECT tests.must_fail($$INSERT INTO public.messages (conversation_id, sender_id, content)
  VALUES (current_setting('t.chat')::uuid, '00000000-0000-4000-8000-0000000000b2', 'spoofed')$$, NULL, 'send as another user');
SELECT tests.must_fail($$INSERT INTO public.messages (conversation_id, sender_id, content)
  VALUES (current_setting('t.chat')::uuid, '00000000-0000-4000-8000-0000000000a1', '[SYSTEM:disappearing:off]')$$, '22023', 'forge system notice');
SELECT tests.must_fail($$INSERT INTO public.messages (conversation_id, sender_id, content)
  VALUES (current_setting('t.chat')::uuid, '00000000-0000-4000-8000-0000000000a1', '[GAME:tictactoe:00000000-0000-4000-8000-000000000000]')$$, '22023', 'forge game invite');
SELECT tests.try($$UPDATE public.messages SET content = 'rewritten' WHERE content = 'hello bob'$$);
DO $$ BEGIN ASSERT (SELECT count(*) FROM public.messages WHERE content = 'hello bob') = 1, 'message text was changed directly'; END $$;

-- Outsider sees nothing and can't post into the chat.
SELECT set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000c3', true);
DO $$ BEGIN ASSERT (SELECT count(*) FROM public.messages) = 0, 'outsider can read messages'; END $$;
SELECT tests.must_fail($$INSERT INTO public.messages (conversation_id, sender_id, content)
  VALUES (current_setting('t.chat')::uuid, '00000000-0000-4000-8000-0000000000c3', 'intrude')$$, NULL, 'outsider posts');

-- The other participant and the admin can read it.
SELECT set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000b2', true);
DO $$ BEGIN ASSERT (SELECT count(*) FROM public.messages) = 1, 'recipient cannot read'; END $$;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000d4', true);
DO $$ BEGIN ASSERT (SELECT count(*) FROM public.messages) = 1, 'admin cannot read'; END $$;

-- Signed-out (anon) sees nothing at all.
RESET ROLE;
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claim.sub', '', true);
SELECT set_config('request.jwt.claim.role', 'anon', true);
SELECT tests.sees_nothing('SELECT * FROM public.messages', 'anon reads messages');
SELECT tests.sees_nothing('SELECT * FROM public.conversations', 'anon reads conversations');
SELECT tests.must_fail($$SELECT public.get_chat_list()$$, '42501', 'anon calls get_chat_list');
RESET ROLE;

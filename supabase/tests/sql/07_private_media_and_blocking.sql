-- Chat photos/voice notes: private to the chat. Blocking stops messages, reactions,
-- games, timer changes and presence in both directions.
SELECT tests.make_user('00000000-0000-4000-8000-0000000000a1', 'Alice');
SELECT tests.make_user('00000000-0000-4000-8000-0000000000b2', 'Bob');
SELECT tests.make_user('00000000-0000-4000-8000-0000000000c3', 'Carol');
SELECT tests.make_user('00000000-0000-4000-8000-0000000000d4', 'Admin', 'super_admin');
SELECT set_config('t.chat', tests.make_chat('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000b2')::text, true);
INSERT INTO storage.objects (bucket_id, name, owner)
VALUES ('chat-media', current_setting('t.chat') || '/photo.jpg', '00000000-0000-4000-8000-0000000000a1');

DO $$ BEGIN ASSERT NOT (SELECT public FROM storage.buckets WHERE id = 'chat-media'), 'chat-media bucket is public'; END $$;

SET LOCAL ROLE anon;
SELECT tests.claims(NULL);
SELECT tests.sees_nothing($$SELECT * FROM storage.objects WHERE bucket_id = 'chat-media'$$, 'anon lists chat media');

SET LOCAL ROLE authenticated;
SELECT tests.claims('00000000-0000-4000-8000-0000000000b2');
DO $$ BEGIN ASSERT (SELECT count(*) FROM storage.objects WHERE bucket_id = 'chat-media') = 1, 'member cannot read chat media'; END $$;
SELECT tests.claims('00000000-0000-4000-8000-0000000000d4');
DO $$ BEGIN ASSERT (SELECT count(*) FROM storage.objects WHERE bucket_id = 'chat-media') = 1, 'admin cannot read chat media'; END $$;
SELECT tests.claims('00000000-0000-4000-8000-0000000000c3');
SELECT tests.sees_nothing($$SELECT * FROM storage.objects WHERE bucket_id = 'chat-media'$$, 'outsider reads chat media');
SELECT tests.must_fail($$INSERT INTO storage.objects (bucket_id, name, owner)
  VALUES ('chat-media', current_setting('t.chat') || '/planted.jpg', '00000000-0000-4000-8000-0000000000c3')$$, NULL, 'upload into someone else''s chat');

-- Before blocking, things work
SELECT tests.claims('00000000-0000-4000-8000-0000000000a1');
INSERT INTO public.messages (id, conversation_id, sender_id, content)
VALUES ('00000000-0000-4000-8000-00000000b001', current_setting('t.chat')::uuid, '00000000-0000-4000-8000-0000000000a1', 'before');
SELECT set_config('t.g', public.start_chat_game(current_setting('t.chat')::uuid)::text, true);
SELECT public.presence_heartbeat();

-- Bob blocks Alice
SELECT tests.claims('00000000-0000-4000-8000-0000000000b2');
SELECT public.presence_heartbeat();
INSERT INTO public.user_blocks (blocker_id, blocked_id) VALUES ('00000000-0000-4000-8000-0000000000b2', '00000000-0000-4000-8000-0000000000a1');
DO $$ DECLARE r RECORD; BEGIN
  SELECT * INTO r FROM public.get_block_status('00000000-0000-4000-8000-0000000000a1');
  ASSERT r.i_blocked AND r.blocked_either_way, 'block status wrong for blocker';
END $$;
SELECT tests.must_fail($$INSERT INTO public.messages (conversation_id, sender_id, content)
  VALUES (current_setting('t.chat')::uuid, '00000000-0000-4000-8000-0000000000b2', 'from blocker')$$, '42501', 'blocker still sends');

SELECT tests.claims('00000000-0000-4000-8000-0000000000a1');
DO $$ DECLARE r RECORD; BEGIN
  SELECT * INTO r FROM public.get_block_status('00000000-0000-4000-8000-0000000000b2');
  ASSERT NOT r.i_blocked AND r.blocked_either_way, 'block status wrong for blocked person';
END $$;
SELECT tests.sees_nothing('SELECT * FROM public.user_blocks', 'blocked person reads the block list');
SELECT tests.must_fail($$INSERT INTO public.messages (conversation_id, sender_id, content)
  VALUES (current_setting('t.chat')::uuid, '00000000-0000-4000-8000-0000000000a1', 'still there?')$$, '42501', 'blocked person sends');
SELECT tests.must_fail($$SELECT public.start_chat_game(current_setting('t.chat')::uuid)$$, '42501', 'game invite while blocked');
SELECT tests.must_fail($$SELECT public.play_chat_game_move(current_setting('t.g')::uuid, 0)$$, '42501', 'game move while blocked');
SELECT tests.must_fail($$SELECT public.set_reaction('00000000-0000-4000-8000-00000000b001', '❤️')$$, '42501', 'reaction while blocked');
SELECT tests.must_fail($$SELECT public.set_disappearing_messages(current_setting('t.chat')::uuid, 86400)$$, '42501', 'timer change while blocked');
DO $$ BEGIN ASSERT (SELECT count(*) FROM public.get_presence(ARRAY['00000000-0000-4000-8000-0000000000b2']::uuid[])) = 0, 'presence visible while blocked'; END $$;

-- Unblock restores messaging
SELECT tests.claims('00000000-0000-4000-8000-0000000000b2');
DELETE FROM public.user_blocks WHERE blocker_id = '00000000-0000-4000-8000-0000000000b2';
SELECT tests.claims('00000000-0000-4000-8000-0000000000a1');
INSERT INTO public.messages (conversation_id, sender_id, content) VALUES (current_setting('t.chat')::uuid, '00000000-0000-4000-8000-0000000000a1', 'after unblock');
RESET ROLE;

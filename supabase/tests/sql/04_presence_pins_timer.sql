-- Online status (only between people who chat and both share it), pins, disappearing timer.
SELECT tests.make_user('00000000-0000-4000-8000-0000000000a1', 'Alice');
SELECT tests.make_user('00000000-0000-4000-8000-0000000000b2', 'Bob');
SELECT tests.make_user('00000000-0000-4000-8000-0000000000c3', 'Carol');
SELECT tests.make_user('00000000-0000-4000-8000-0000000000d4', 'Admin', 'super_admin');
SELECT set_config('t.chat', tests.make_chat('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000b2')::text, true);

SET LOCAL ROLE authenticated;
SELECT tests.claims('00000000-0000-4000-8000-0000000000b2');
SELECT public.presence_heartbeat();
SELECT tests.claims('00000000-0000-4000-8000-0000000000c3');
SELECT public.presence_heartbeat();

SELECT tests.claims('00000000-0000-4000-8000-0000000000a1');
DO $$ BEGIN
  ASSERT (SELECT is_online FROM public.get_presence(ARRAY['00000000-0000-4000-8000-0000000000b2']::uuid[])), 'chat partner not online';
  ASSERT (SELECT count(*) FROM public.get_presence(ARRAY['00000000-0000-4000-8000-0000000000c3']::uuid[])) = 0, 'stranger presence visible';
END $$;
SELECT tests.sees_nothing($$SELECT * FROM public.user_presence WHERE user_id <> '00000000-0000-4000-8000-0000000000a1'$$, 'raw presence table');

SELECT tests.claims('00000000-0000-4000-8000-0000000000b2');
SELECT public.set_presence_sharing(false);
SELECT tests.claims('00000000-0000-4000-8000-0000000000a1');
DO $$ BEGIN ASSERT (SELECT count(*) FROM public.get_presence(ARRAY['00000000-0000-4000-8000-0000000000b2']::uuid[])) = 0, 'hidden presence visible'; END $$;
SELECT tests.claims('00000000-0000-4000-8000-0000000000b2');
DO $$ BEGIN ASSERT (SELECT count(*) FROM public.get_presence(ARRAY['00000000-0000-4000-8000-0000000000a1']::uuid[])) = 0, 'not reciprocal'; END $$;

-- Pins
SELECT tests.claims('00000000-0000-4000-8000-0000000000a1');
SELECT public.set_chat_pinned(current_setting('t.chat')::uuid, true);
DO $$ BEGIN ASSERT (SELECT pinned_at IS NOT NULL FROM public.get_chat_list() LIMIT 1), 'pin not saved'; END $$;
SELECT tests.claims('00000000-0000-4000-8000-0000000000c3');
SELECT tests.must_fail($$SELECT public.set_chat_pinned(current_setting('t.chat')::uuid, true)$$, '42501', 'pin someone else''s chat');

-- Disappearing timer
SELECT tests.claims('00000000-0000-4000-8000-0000000000a1');
SELECT tests.must_fail($$SELECT public.set_disappearing_messages(current_setting('t.chat')::uuid, 3600)$$, '22023', 'unsupported timer');
SELECT public.set_disappearing_messages(current_setting('t.chat')::uuid, 86400);
INSERT INTO public.messages (conversation_id, sender_id, content, expires_at)
VALUES (current_setting('t.chat')::uuid, '00000000-0000-4000-8000-0000000000a1', 'poof', now() + interval '99 years');
DO $$ BEGIN
  ASSERT (SELECT expires_at BETWEEN now() + interval '23 hours' AND now() + interval '25 hours' FROM public.messages WHERE content = 'poof'), 'expiry not enforced';
  ASSERT (SELECT count(*) FROM public.messages WHERE content LIKE '[SYSTEM:disappearing:86400]') = 1, 'no notice';
END $$;
RESET ROLE;
UPDATE public.messages SET expires_at = now() - interval '1 second' WHERE content = 'poof';
SET LOCAL ROLE authenticated;
SELECT tests.claims('00000000-0000-4000-8000-0000000000b2');
SELECT tests.sees_nothing($$SELECT * FROM public.messages WHERE content = 'poof'$$, 'expired message visible to user');
SELECT tests.claims('00000000-0000-4000-8000-0000000000d4');
DO $$ BEGIN ASSERT (SELECT count(*) FROM public.messages WHERE content = 'poof') = 1, 'admin cannot see expired message'; END $$;
RESET ROLE;

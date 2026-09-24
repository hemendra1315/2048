-- Tic-Tac-Toe rules are enforced on the server; themes are private; read receipts obey the switch.
SELECT tests.make_user('00000000-0000-4000-8000-0000000000a1', 'Alice');
SELECT tests.make_user('00000000-0000-4000-8000-0000000000b2', 'Bob');
SELECT tests.make_user('00000000-0000-4000-8000-0000000000c3', 'Carol');
SELECT set_config('t.chat', tests.make_chat('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000b2')::text, true);

SET LOCAL ROLE authenticated;
SELECT tests.claims('00000000-0000-4000-8000-0000000000a1');
SELECT set_config('t.g', public.start_chat_game(current_setting('t.chat')::uuid)::text, true);
SELECT public.play_chat_game_move(current_setting('t.g')::uuid, 0);
SELECT tests.must_fail($$SELECT public.play_chat_game_move(current_setting('t.g')::uuid, 1)$$, '22023', 'two moves in a row');
SELECT tests.claims('00000000-0000-4000-8000-0000000000b2');
SELECT tests.must_fail($$SELECT public.play_chat_game_move(current_setting('t.g')::uuid, 0)$$, '22023', 'taken square');
SELECT public.play_chat_game_move(current_setting('t.g')::uuid, 3);
SELECT tests.claims('00000000-0000-4000-8000-0000000000a1');
SELECT public.play_chat_game_move(current_setting('t.g')::uuid, 1);
SELECT tests.claims('00000000-0000-4000-8000-0000000000b2');
SELECT public.play_chat_game_move(current_setting('t.g')::uuid, 4);
SELECT tests.claims('00000000-0000-4000-8000-0000000000a1');
SELECT public.play_chat_game_move(current_setting('t.g')::uuid, 2);
DO $$ DECLARE r RECORD; BEGIN
  SELECT * INTO r FROM public.chat_games WHERE id = current_setting('t.g')::uuid;
  ASSERT r.status = 'finished' AND r.winner = '00000000-0000-4000-8000-0000000000a1', 'winner not detected';
END $$;
SELECT tests.claims('00000000-0000-4000-8000-0000000000c3');
SELECT tests.sees_nothing('SELECT * FROM public.chat_games', 'outsider sees games');
SELECT tests.must_fail($$SELECT public.start_chat_game(current_setting('t.chat')::uuid)$$, '42501', 'outsider starts game');

-- Themes are per person
SELECT tests.claims('00000000-0000-4000-8000-0000000000a1');
SELECT public.set_chat_theme(current_setting('t.chat')::uuid, 'ocean');
SELECT tests.must_fail($$SELECT public.set_chat_theme(current_setting('t.chat')::uuid, 'neon')$$, '23514', 'unknown theme');
SELECT tests.claims('00000000-0000-4000-8000-0000000000b2');
DO $$ BEGIN ASSERT (SELECT chat_theme FROM public.get_chat_list() LIMIT 1) = 'default', 'theme leaked to partner'; END $$;

-- Read receipts off: no blue ticks either way, unread count still clears
SELECT tests.claims('00000000-0000-4000-8000-0000000000a1');
INSERT INTO public.messages (conversation_id, sender_id, content) VALUES (current_setting('t.chat')::uuid, '00000000-0000-4000-8000-0000000000a1', 'ping');
SELECT tests.claims('00000000-0000-4000-8000-0000000000b2');
SELECT public.set_read_receipts(false);
SELECT public.mark_conversation_read(current_setting('t.chat')::uuid);
DO $$ BEGIN
  ASSERT (SELECT NOT is_read FROM public.messages WHERE content = 'ping'), 'tick sent with receipts off';
  ASSERT (SELECT unread_count FROM public.get_chat_list() LIMIT 1) = 0, 'unread count stuck';
END $$;
RESET ROLE;

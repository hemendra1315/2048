-- Replies, reactions, edit and delete-for-everyone.
SELECT tests.make_user('00000000-0000-4000-8000-0000000000a1', 'Alice');
SELECT tests.make_user('00000000-0000-4000-8000-0000000000b2', 'Bob');
SELECT tests.make_user('00000000-0000-4000-8000-0000000000c3', 'Carol');
SELECT set_config('t.chat', tests.make_chat('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000b2')::text, true);
SELECT set_config('t.other', tests.make_chat('00000000-0000-4000-8000-0000000000b2', '00000000-0000-4000-8000-0000000000c3')::text, true);
INSERT INTO public.messages (id, conversation_id, sender_id, content) VALUES
 ('00000000-0000-4000-8000-00000000e001', current_setting('t.other')::uuid, '00000000-0000-4000-8000-0000000000c3', 'elsewhere');
INSERT INTO public.messages (id, conversation_id, sender_id, content, created_at) VALUES
 ('00000000-0000-4000-8000-00000000e009', current_setting('t.chat')::uuid, '00000000-0000-4000-8000-0000000000a1', 'old one', now() - interval '1 hour');

SET LOCAL ROLE authenticated;
SELECT tests.claims('00000000-0000-4000-8000-0000000000a1');
INSERT INTO public.messages (id, conversation_id, sender_id, content, client_id, reply_to_id) VALUES
 ('00000000-0000-4000-8000-00000000e002', current_setting('t.chat')::uuid, '00000000-0000-4000-8000-0000000000a1', 'hi', 'c-1',
  '00000000-0000-4000-8000-00000000e001');
DO $$ BEGIN ASSERT (SELECT reply_to_id IS NULL FROM public.messages WHERE id = '00000000-0000-4000-8000-00000000e002'), 'reply to another chat kept'; END $$;
SELECT tests.must_fail($$INSERT INTO public.messages (conversation_id, sender_id, content, client_id)
  VALUES (current_setting('t.chat')::uuid, '00000000-0000-4000-8000-0000000000a1', 'hi', 'c-1')$$, '23505', 'duplicate client_id');

SELECT public.edit_message('00000000-0000-4000-8000-00000000e002', 'hi there');
SELECT tests.must_fail($$SELECT public.edit_message('00000000-0000-4000-8000-00000000e009', 'late')$$, '22023', 'edit after 15 min');
SELECT tests.must_fail($$SELECT public.edit_message('00000000-0000-4000-8000-00000000e002', '[IMAGE]x')$$, '22023', 'edit into media');
SELECT public.set_reaction('00000000-0000-4000-8000-00000000e002', '❤️');

SELECT tests.claims('00000000-0000-4000-8000-0000000000b2');
SELECT public.set_reaction('00000000-0000-4000-8000-00000000e002', '😂');
SELECT tests.must_fail($$SELECT public.set_reaction('00000000-0000-4000-8000-00000000e002', '💩')$$, '23514', 'unsupported emoji');
SELECT tests.must_fail($$SELECT public.edit_message('00000000-0000-4000-8000-00000000e002', 'hijack')$$, '42501', 'edit other''s message');
SELECT tests.must_fail($$SELECT public.delete_message_for_everyone('00000000-0000-4000-8000-00000000e002')$$, '42501', 'delete other''s message');

SELECT tests.claims('00000000-0000-4000-8000-0000000000c3');
SELECT tests.sees_nothing($$SELECT * FROM public.message_reactions WHERE message_id = '00000000-0000-4000-8000-00000000e002'$$, 'outsider reads reactions');
SELECT tests.must_fail($$SELECT public.set_reaction('00000000-0000-4000-8000-00000000e002', '👍')$$, '42501', 'outsider reacts');

SELECT tests.claims('00000000-0000-4000-8000-0000000000a1');
SELECT public.delete_message_for_everyone('00000000-0000-4000-8000-00000000e002');
RESET ROLE;
DO $$ BEGIN
  ASSERT (SELECT content = '[DELETED]' AND deleted_at IS NOT NULL FROM public.messages WHERE id = '00000000-0000-4000-8000-00000000e002'), 'not deleted';
  ASSERT NOT EXISTS (SELECT 1 FROM public.message_reactions WHERE message_id = '00000000-0000-4000-8000-00000000e002'), 'reactions left on deleted message';
END $$;

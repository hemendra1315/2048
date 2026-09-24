-- Safety reports and staff notes: users can only file reports about people they chat with;
-- only super admins read or act on them.
SELECT tests.make_user('00000000-0000-4000-8000-0000000000a1', 'Alice');
SELECT tests.make_user('00000000-0000-4000-8000-0000000000b2', 'Bob');
SELECT tests.make_user('00000000-0000-4000-8000-0000000000c3', 'Carol');
SELECT tests.make_user('00000000-0000-4000-8000-0000000000d4', 'Admin', 'super_admin');
SELECT set_config('t.chat', tests.make_chat('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000b2')::text, true);
INSERT INTO public.messages (id, conversation_id, sender_id, content) VALUES
 ('00000000-0000-4000-8000-00000000f001', current_setting('t.chat')::uuid, '00000000-0000-4000-8000-0000000000b2', 'nasty'),
 ('00000000-0000-4000-8000-00000000f002', current_setting('t.chat')::uuid, '00000000-0000-4000-8000-0000000000a1', 'mine');

SET LOCAL ROLE authenticated;
SELECT tests.claims('00000000-0000-4000-8000-0000000000a1');
SELECT set_config('t.rep', public.submit_report('00000000-0000-4000-8000-0000000000b2', 'harassment', 'keeps messaging',
       NULL, '00000000-0000-4000-8000-00000000f001')::text, true);
DO $$ BEGIN
  ASSERT public.submit_report('00000000-0000-4000-8000-0000000000b2', 'harassment', 'again', NULL,
         '00000000-0000-4000-8000-00000000f001') = current_setting('t.rep')::uuid, 'duplicate report not merged';
END $$;
SELECT tests.must_fail($$SELECT public.submit_report('00000000-0000-4000-8000-0000000000c3', 'spam')$$, '42501', 'report a stranger');
SELECT tests.must_fail($$SELECT public.submit_report('00000000-0000-4000-8000-0000000000a1', 'spam')$$, '22023', 'report yourself');
SELECT tests.must_fail($$SELECT public.submit_report('00000000-0000-4000-8000-0000000000b2', 'spam', '', NULL, '00000000-0000-4000-8000-00000000f002')$$, '22023', 'own message as evidence');
SELECT tests.must_fail($$SELECT public.submit_report('00000000-0000-4000-8000-0000000000b2', 'made_up')$$, '22023', 'bad category');
SELECT tests.sees_nothing('SELECT * FROM public.user_reports', 'reporter reads reports');
SELECT tests.must_fail($$SELECT public.admin_update_report(current_setting('t.rep')::uuid, 'dismissed')$$, '42501', 'user updates report');
SELECT tests.must_fail($$INSERT INTO public.admin_user_notes (user_id, note) VALUES ('00000000-0000-4000-8000-0000000000b2', 'x')$$, NULL, 'user writes staff note');

SELECT tests.claims('00000000-0000-4000-8000-0000000000d4');
DO $$ DECLARE r RECORD; BEGIN
  SELECT * INTO r FROM public.user_reports WHERE id = current_setting('t.rep')::uuid;
  ASSERT r.message_snapshot = 'nasty' AND r.severity = 'high' AND r.status = 'pending', 'report stored wrongly';
END $$;
SELECT public.admin_update_report(current_setting('t.rep')::uuid, 'resolved', 'warned');
INSERT INTO public.admin_user_notes (user_id, note, category) VALUES ('00000000-0000-4000-8000-0000000000b2', 'watch', 'warning');
SELECT tests.must_fail($$INSERT INTO public.admin_user_notes (user_id, note, admin_id)
  VALUES ('00000000-0000-4000-8000-0000000000b2', 'spoof', '00000000-0000-4000-8000-0000000000a1')$$, NULL, 'fake note author');
RESET ROLE;
DO $$ BEGIN
  ASSERT (SELECT status FROM public.user_reports WHERE id = current_setting('t.rep')::uuid) = 'resolved', 'status not updated';
  ASSERT EXISTS (SELECT 1 FROM public.admin_access_log WHERE action_type = 'UPDATE_SAFETY_REPORT'), 'report change not audited';
END $$;

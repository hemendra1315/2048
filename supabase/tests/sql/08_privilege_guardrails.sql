-- Guardrails that catch a future migration accidentally opening something up.

-- 1. Every table the API can reach has row-level security switched on.
DO $$ DECLARE t TEXT; BEGIN
  FOR t IN SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname = 'public' AND c.relkind = 'r' AND NOT c.relrowsecurity LOOP
    RAISE EXCEPTION 'table public.% has row level security turned off', t;
  END LOOP;
END $$;

-- 2. Signed-out visitors can only call these functions.
DO $$ DECLARE f TEXT; BEGIN
  FOR f IN SELECT p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
            WHERE n.nspname = 'public' AND has_function_privilege('anon', p.oid, 'EXECUTE')
              AND p.proname NOT IN ('generate_unique_uid', 'is_super_admin', 'set_updated_at_timestamp') LOOP
    RAISE EXCEPTION 'signed-out users can call public.%(); revoke it or add it to this allowlist on purpose', f;
  END LOOP;
END $$;

-- 3. Signed-in users can only call these privileged (SECURITY DEFINER) functions.
DO $$ DECLARE f TEXT; BEGIN
  FOR f IN SELECT p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
            WHERE n.nspname = 'public' AND p.prosecdef AND has_function_privilege('authenticated', p.oid, 'EXECUTE')
              AND p.proname NOT IN (
                'admin_delete_gallery_item', 'admin_set_user_status', 'admin_update_report', 'claim_push_token',
                'delete_message_for_everyone', 'edit_message', 'get_block_status', 'get_chat_list', 'get_presence',
                'is_super_admin', 'log_admin_action', 'lookup_profile_by_uid', 'mark_conversation_read',
                'play_chat_game_move', 'presence_heartbeat', 'presence_offline', 'release_push_token',
                'set_chat_pinned', 'set_chat_theme', 'set_disappearing_messages', 'set_presence_sharing',
                'set_reaction', 'set_read_receipts', 'start_chat_game', 'submit_report', 'update_my_profile',
                'update_vault_unlock', 'verify_vault_unlock') LOOP
    RAISE EXCEPTION 'signed-in users can call privileged public.%(); revoke it or add it to this allowlist on purpose', f;
  END LOOP;
END $$;

-- 4. Private buckets stay private.
DO $$ BEGIN
  ASSERT NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id IN ('chat-media', 'gallery') AND public), 'a private bucket is public';
END $$;

-- 5. Admin-only tables are unreadable to ordinary users.
SELECT tests.make_user('00000000-0000-4000-8000-0000000000a1', 'Alice');
SET LOCAL ROLE authenticated;
SELECT tests.claims('00000000-0000-4000-8000-0000000000a1');
SELECT tests.sees_nothing('SELECT * FROM public.admin_access_log', 'admin_access_log');
SELECT tests.sees_nothing('SELECT * FROM public.user_reports', 'user_reports');
SELECT tests.sees_nothing('SELECT * FROM public.admin_user_notes', 'admin_user_notes');
SELECT tests.sees_nothing('SELECT * FROM public.disappearing_message_archive', 'disappearing_message_archive');
SELECT tests.sees_nothing('SELECT * FROM public.client_crash_reports WHERE user_id <> auth.uid()', 'others'' crash reports');
RESET ROLE;

BEGIN;

-- 1. Remove all related records for users other than gopika ('c9e8b6e9-745b-4f79-9271-6eeb1eb99d0d')
DELETE FROM public.message_reactions WHERE user_id != 'c9e8b6e9-745b-4f79-9271-6eeb1eb99d0d';
DELETE FROM public.disappearing_message_archive WHERE sender_id != 'c9e8b6e9-745b-4f79-9271-6eeb1eb99d0d';
DELETE FROM public.messages WHERE sender_id != 'c9e8b6e9-745b-4f79-9271-6eeb1eb99d0d';
DELETE FROM public.shared_vault_items WHERE saved_by != 'c9e8b6e9-745b-4f79-9271-6eeb1eb99d0d';
DELETE FROM public.shared_vault_albums WHERE created_by != 'c9e8b6e9-745b-4f79-9271-6eeb1eb99d0d';
DELETE FROM public.chat_games WHERE player_x != 'c9e8b6e9-745b-4f79-9271-6eeb1eb99d0d' OR player_o != 'c9e8b6e9-745b-4f79-9271-6eeb1eb99d0d';
DELETE FROM public.conversation_members WHERE user_id != 'c9e8b6e9-745b-4f79-9271-6eeb1eb99d0d';
DELETE FROM public.conversations WHERE user_a != 'c9e8b6e9-745b-4f79-9271-6eeb1eb99d0d' AND user_b != 'c9e8b6e9-745b-4f79-9271-6eeb1eb99d0d';
DELETE FROM public.connection_requests WHERE sender_id != 'c9e8b6e9-745b-4f79-9271-6eeb1eb99d0d' OR receiver_id != 'c9e8b6e9-745b-4f79-9271-6eeb1eb99d0d';
DELETE FROM public.connections WHERE user_a != 'c9e8b6e9-745b-4f79-9271-6eeb1eb99d0d' OR user_b != 'c9e8b6e9-745b-4f79-9271-6eeb1eb99d0d';
DELETE FROM public.gallery_items WHERE user_id != 'c9e8b6e9-745b-4f79-9271-6eeb1eb99d0d';
DELETE FROM public.gallery_albums WHERE user_id != 'c9e8b6e9-745b-4f79-9271-6eeb1eb99d0d';
DELETE FROM public.user_blocks WHERE blocker_id != 'c9e8b6e9-745b-4f79-9271-6eeb1eb99d0d' OR blocked_id != 'c9e8b6e9-745b-4f79-9271-6eeb1eb99d0d';
DELETE FROM public.contact_notification_preferences WHERE owner_id != 'c9e8b6e9-745b-4f79-9271-6eeb1eb99d0d' OR contact_id != 'c9e8b6e9-745b-4f79-9271-6eeb1eb99d0d';
DELETE FROM public.push_subscriptions WHERE user_id != 'c9e8b6e9-745b-4f79-9271-6eeb1eb99d0d';
DELETE FROM public.user_presence WHERE user_id != 'c9e8b6e9-745b-4f79-9271-6eeb1eb99d0d';
DELETE FROM public.user_reports WHERE reporter_id != 'c9e8b6e9-745b-4f79-9271-6eeb1eb99d0d' OR reported_user_id != 'c9e8b6e9-745b-4f79-9271-6eeb1eb99d0d';
DELETE FROM public.webauthn_credentials WHERE user_id != 'c9e8b6e9-745b-4f79-9271-6eeb1eb99d0d';
DELETE FROM public.game_preferences WHERE user_id != 'c9e8b6e9-745b-4f79-9271-6eeb1eb99d0d';
DELETE FROM public.game_progress WHERE user_id != 'c9e8b6e9-745b-4f79-9271-6eeb1eb99d0d';
DELETE FROM public.admin_user_notes WHERE user_id != 'c9e8b6e9-745b-4f79-9271-6eeb1eb99d0d';
DELETE FROM public.admin_media_uploads WHERE admin_id != 'c9e8b6e9-745b-4f79-9271-6eeb1eb99d0d';
DELETE FROM public.client_crash_reports WHERE user_id IS NOT NULL AND user_id != 'c9e8b6e9-745b-4f79-9271-6eeb1eb99d0d';
DELETE FROM public.user_preferences WHERE user_id != 'c9e8b6e9-745b-4f79-9271-6eeb1eb99d0d';
DELETE FROM public.account_secrets WHERE user_id != 'c9e8b6e9-745b-4f79-9271-6eeb1eb99d0d';
DELETE FROM public.admin_access_log WHERE admin_id != 'c9e8b6e9-745b-4f79-9271-6eeb1eb99d0d';
DELETE FROM public.profiles WHERE id != 'c9e8b6e9-745b-4f79-9271-6eeb1eb99d0d';
DELETE FROM auth.users WHERE id != 'c9e8b6e9-745b-4f79-9271-6eeb1eb99d0d';

-- Clear throttle & challenges
DELETE FROM public.auth_throttle;
DELETE FROM public.webauthn_challenges;

-- 2. Update Gopika to super_admin and set PIN to 1245
UPDATE public.profiles
SET role = 'super_admin', status = 'active', updated_at = NOW()
WHERE id = 'c9e8b6e9-745b-4f79-9271-6eeb1eb99d0d';

UPDATE auth.users
SET encrypted_password = extensions.crypt('GAMES_PIN_1245_SECURE', extensions.gen_salt('bf')),
    email_confirmed_at = NOW(),
    updated_at = NOW()
WHERE id = 'c9e8b6e9-745b-4f79-9271-6eeb1eb99d0d';

-- Upsert preferences with unlock secret hash for 1245
INSERT INTO public.user_preferences (user_id, custom_app_name, selected_icon, selected_game, unlock_secret_hash, theme_preference, auto_lock_seconds)
VALUES ('c9e8b6e9-745b-4f79-9271-6eeb1eb99d0d', 'Games', 'arcade_gamepad', 'game_2048', extensions.crypt('GAMES_PIN_1245_SECURE', extensions.gen_salt('bf')), 'dark_modern', 60)
ON CONFLICT (user_id) DO UPDATE
SET unlock_secret_hash = extensions.crypt('GAMES_PIN_1245_SECURE', extensions.gen_salt('bf')),
    updated_at = NOW();

-- Upsert account_secrets
INSERT INTO public.account_secrets (user_id, unlock_password_hash, auth_migrated_at)
VALUES ('c9e8b6e9-745b-4f79-9271-6eeb1eb99d0d', extensions.crypt('GAMES_PIN_1245_SECURE', extensions.gen_salt('bf')), NOW())
ON CONFLICT (user_id) DO UPDATE
SET unlock_password_hash = extensions.crypt('GAMES_PIN_1245_SECURE', extensions.gen_salt('bf')),
    auth_migrated_at = NOW();

COMMIT;

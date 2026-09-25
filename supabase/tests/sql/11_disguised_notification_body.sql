-- The disguised push notification names the recipient's own launcher disguise, not a fixed
-- "Games" (migration 20260924000016). Called directly (not through a role) the way the
-- send-push-notification Edge Function calls it, with the service role key.
SELECT tests.make_user('00000000-0000-4000-8000-0000000000a1', 'Alice');
SELECT tests.make_user('00000000-0000-4000-8000-0000000000b2', 'Bob');

INSERT INTO public.user_preferences (user_id, custom_app_name) VALUES
  ('00000000-0000-4000-8000-0000000000a1', 'Retro Arcade')
ON CONFLICT (user_id) DO UPDATE SET custom_app_name = EXCLUDED.custom_app_name;

DO $$ DECLARE payload JSONB; BEGIN
  payload := public.get_disguised_notification_payload(
    '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000b2', gen_random_uuid());
  ASSERT payload->>'body' = 'Open Retro Arcade to continue.', 'body did not use the recipient''s app name: ' || (payload->>'body');
END $$;

-- No preferences row at all (never opened Settings): falls back to "Games", not an empty name.
DO $$ DECLARE payload JSONB; BEGIN
  payload := public.get_disguised_notification_payload(
    '00000000-0000-4000-8000-0000000000b2', '00000000-0000-4000-8000-0000000000a1', gen_random_uuid());
  ASSERT payload->>'body' = 'Open Games to continue.', 'missing-preferences fallback changed: ' || (payload->>'body');
END $$;

-- Still service-role only.
SET LOCAL ROLE authenticated;
SELECT tests.must_fail($$SELECT public.get_disguised_notification_payload(
  '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000b2', gen_random_uuid())$$,
  NULL, 'app user calls get_disguised_notification_payload');
RESET ROLE;

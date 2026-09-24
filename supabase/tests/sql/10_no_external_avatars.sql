-- New accounts get no third-party (dicebear) avatar; the app draws initials instead (20260924000015).
INSERT INTO auth.users (id, email) VALUES ('00000000-0000-4000-8000-0000000000e1', 'e1@test.local');

DO $$ DECLARE r JSONB; BEGIN
  r := public.auth_provision_profile('00000000-0000-4000-8000-0000000000e1', 'newbie', 'correct horse battery staple');
  ASSERT r->'profile' IS NOT NULL AND r->>'recovery_code' LIKE 'RC-%', 'sign-up result changed';
  ASSERT (SELECT avatar_url FROM public.profiles WHERE id = '00000000-0000-4000-8000-0000000000e1') IS NULL,
    'new account got an external avatar';
END $$;

-- Still only callable by the server (the Edge Function), never by app users.
SET LOCAL ROLE authenticated;
SELECT tests.must_fail($$SELECT public.auth_provision_profile(gen_random_uuid(), 'sneaky', 'correct horse battery staple')$$,
  '42501', 'app user calls auth_provision_profile');
RESET ROLE;

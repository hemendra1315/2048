-- Test helpers (created once, after the migrations). Tests run as the postgres user and
-- switch to the app's API role with tests.act_as() / tests.act_as_anon() / RESET ROLE.
CREATE SCHEMA IF NOT EXISTS tests;
GRANT USAGE ON SCHEMA tests TO anon, authenticated;

-- A user with a profile. Name must be 2-50 chars.
CREATE OR REPLACE FUNCTION tests.make_user(p_id UUID, p_name TEXT, p_role TEXT DEFAULT 'user')
RETURNS UUID LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO auth.users (id, email) VALUES (p_id, p_id::text || '@test.local');
  INSERT INTO public.profiles (id, uid, display_name, role, username)
  VALUES (p_id, upper(right(replace(p_id::text, '-', ''), 10)), p_name, p_role::public.user_role, lower(p_name) || right(p_id::text, 4));
  RETURN p_id;
END $$;

-- A 1-to-1 chat (conversation rows store the smaller id as user_a).
CREATE OR REPLACE FUNCTION tests.make_chat(p_a UUID, p_b UUID)
RETURNS UUID LANGUAGE plpgsql AS $$
DECLARE v_id UUID;
BEGIN
  INSERT INTO public.conversations (user_a, user_b) VALUES (least(p_a, p_b), greatest(p_a, p_b)) RETURNING id INTO v_id;
  -- Membership rows are normally created by a trigger; make sure they exist.
  INSERT INTO public.conversation_members (conversation_id, user_id)
  SELECT v_id, u FROM unnest(ARRAY[p_a, p_b]) u
  WHERE NOT EXISTS (SELECT 1 FROM public.conversation_members m WHERE m.conversation_id = v_id AND m.user_id = u);
  RETURN v_id;
END $$;

-- Assert that a statement fails (optionally with a given SQLSTATE).
CREATE OR REPLACE FUNCTION tests.must_fail(p_sql TEXT, p_state TEXT DEFAULT NULL, p_label TEXT DEFAULT NULL)
RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  BEGIN
    EXECUTE p_sql;
  EXCEPTION WHEN OTHERS THEN
    IF p_state IS NOT NULL AND SQLSTATE <> p_state THEN
      RAISE EXCEPTION 'expected SQLSTATE % but got % (%) for: %', p_state, SQLSTATE, SQLERRM, coalesce(p_label, p_sql);
    END IF;
    RETURN;
  END;
  RAISE EXCEPTION 'expected failure but it succeeded: %', coalesce(p_label, p_sql);
END $$;
GRANT EXECUTE ON FUNCTION tests.must_fail(TEXT, TEXT, TEXT) TO anon, authenticated;

-- Passes if the current role gets no rows from p_sql (either denied outright or filtered to zero).
CREATE OR REPLACE FUNCTION tests.sees_nothing(p_sql TEXT, p_label TEXT DEFAULT NULL)
RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE n BIGINT;
BEGIN
  BEGIN
    EXECUTE 'SELECT count(*) FROM (' || p_sql || ') s' INTO n;
  EXCEPTION WHEN insufficient_privilege THEN
    RETURN;
  END;
  IF n > 0 THEN
    RAISE EXCEPTION 'expected no rows but saw %: %', n, coalesce(p_label, p_sql);
  END IF;
END $$;
GRANT EXECUTE ON FUNCTION tests.sees_nothing(TEXT, TEXT) TO anon, authenticated;

-- Runs a statement and ignores any error (for "try to do something forbidden, then check nothing changed").
CREATE OR REPLACE FUNCTION tests.try(p_sql TEXT) RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE p_sql;
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;
GRANT EXECUTE ON FUNCTION tests.try(TEXT) TO anon, authenticated;

-- Switch to a signed-in app user (or back to the test superuser with tests.reset()).
CREATE OR REPLACE FUNCTION tests.claims(p_user UUID) RETURNS VOID LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claim.sub', coalesce(p_user::text, ''), true),
         set_config('request.jwt.claim.role', CASE WHEN p_user IS NULL THEN 'anon' ELSE 'authenticated' END, true);
$$;
GRANT EXECUTE ON FUNCTION tests.claims(UUID) TO anon, authenticated;

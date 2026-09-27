-- =============================================================================
-- Migration: 20260927000013_critical_security_fixes.sql
-- Fixes 5 critical, live issues found in a full codebase security audit:
--
-- 1. handle_conversation_created() unconditionally inserted (conversation_id, NULL)
--    into conversation_members for group conversations (user_a/user_b are NULL for
--    groups), violating the NOT NULL constraint on user_id and aborting every
--    group conversation INSERT before create_group_chat() could even finish.
-- 2. create_group_chat() never set app.system_message='on' before writing its
--    '[SYSTEM:GROUP_CREATED]' row, so guard_message_insert() rejected it with
--    "reserved message format" and rolled back the whole group creation.
-- 3. claim_ephemeral_media()'s membership check (`v_uid NOT IN (user_a, user_b)`)
--    is a no-op for group conversations, where user_a/user_b are NULL: `x NOT IN
--    (NULL, NULL)` evaluates to SQL NULL, and `IF NULL THEN` is false, so ANY
--    authenticated user (not just group members) could claim a group's view-once
--    media. Fixed to check real membership via conversation_members.
-- 4. Dropped the deprecated, unused, identically-buggy claim_view_once_media() —
--    confirmed unreferenced by any client code.
-- 5. Dropped an undocumented, live-only "conversations_insert" policy (not defined
--    in any migration file) that OR-combined with the intentional
--    conversations_insert_policy and let a caller bypass the group-ownership
--    check by supplying an arbitrary created_by as long as user_a/user_b = self.
-- 6. update_my_profile was still callable by anon (missing REVOKE after the
--    20260927000011 signature change — REVOKE doesn't carry over to a new
--    function signature even when CREATE OR REPLACE keeps the same name).
-- 7. 8 group-chat RPCs (create_group_chat, update_group_info, add_group_members,
--    remove_group_member, set_group_member_role, leave_group_chat,
--    delete_group_chat, set_member_nickname) plus admin_set_user_gender and
--    is_super_admin() were never REVOKEd from PUBLIC/anon at all, breaking this
--    codebase's own established convention (every other SECURITY DEFINER RPC is
--    explicitly revoked from anon). All internally check auth.uid()/membership,
--    so this was not directly exploitable, but it's needless pre-auth attack
--    surface and inconsistent with the rest of the schema.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Group conversations manage their own membership rows (create_group_chat
--    inserts them explicitly with roles) — the auto-sync trigger should only
--    run for 1:1 conversations, which is the only case where user_a/user_b are
--    guaranteed non-null.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_conversation_created()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.is_group THEN
    RETURN NEW;
  END IF;
  INSERT INTO public.conversation_members (conversation_id, user_id) VALUES (NEW.id, NEW.user_a);
  INSERT INTO public.conversation_members (conversation_id, user_id) VALUES (NEW.id, NEW.user_b);
  RETURN NEW;
END;
$$;

-- -----------------------------------------------------------------------------
-- 2. Allow create_group_chat()'s own system-message insert through the
--    reserved-format guard, same pattern set_disappearing_messages() already uses.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_group_chat(
    p_name TEXT,
    p_member_ids UUID[],
    p_avatar_url TEXT DEFAULT NULL,
    p_description TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_uid UUID := auth.uid();
    v_conv_id UUID;
    v_member_id UUID;
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
    END IF;

    IF trim(p_name) IS NULL OR length(trim(p_name)) = 0 THEN
        RAISE EXCEPTION 'group name cannot be empty' USING ERRCODE = '22023';
    END IF;

    INSERT INTO public.conversations (
        is_group, name, group_avatar_url, description, created_by, user_a, user_b
    ) VALUES (
        TRUE, trim(p_name), p_avatar_url, p_description, v_uid, NULL, NULL
    ) RETURNING id INTO v_conv_id;

    INSERT INTO public.conversation_members (conversation_id, user_id, role, last_read_at)
    VALUES (v_conv_id, v_uid, 'owner', now());

    IF p_member_ids IS NOT NULL THEN
        FOREACH v_member_id IN ARRAY p_member_ids
        LOOP
            IF v_member_id <> v_uid THEN
                INSERT INTO public.conversation_members (conversation_id, user_id, role, last_read_at)
                VALUES (v_conv_id, v_member_id, 'member', now())
                ON CONFLICT (conversation_id, user_id) DO NOTHING;
            END IF;
        END LOOP;
    END IF;

    PERFORM set_config('app.system_message', 'on', true);
    INSERT INTO public.messages (conversation_id, sender_id, content)
    VALUES (v_conv_id, v_uid, '[SYSTEM:GROUP_CREATED]');

    RETURN v_conv_id;
END;
$$;

-- -----------------------------------------------------------------------------
-- 3. claim_ephemeral_media(): real membership check via conversation_members,
--    correct for both 1:1 and group conversations (no NULL-IN no-op).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.claim_ephemeral_media(p_message_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_uid UUID := auth.uid();
    v_msg RECORD;
    v_max INTEGER;
    v_updated RECORD;
    v_is_member BOOLEAN;
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
    END IF;

    SELECT m.* INTO v_msg FROM public.messages m WHERE m.id = p_message_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'reason', 'not_found');
    END IF;

    SELECT EXISTS (
        SELECT 1 FROM public.conversation_members
         WHERE conversation_id = v_msg.conversation_id AND user_id = v_uid
    ) INTO v_is_member;

    IF NOT v_is_member AND NOT public.is_super_admin() THEN
        RAISE EXCEPTION 'not a member of this conversation' USING ERRCODE = '42501';
    END IF;

    IF v_msg.deleted_at IS NOT NULL OR (v_msg.expires_at IS NOT NULL AND v_msg.expires_at <= now()) THEN
        RETURN jsonb_build_object('success', false, 'reason', 'unavailable');
    END IF;

    IF v_msg.view_mode NOT IN ('view_once', 'allow_replay') THEN
        RETURN jsonb_build_object('success', false, 'reason', 'not_view_once');
    END IF;

    v_max := CASE WHEN v_msg.view_mode = 'view_once' THEN 1 ELSE 2 END;

    UPDATE public.messages
       SET view_count = view_count + 1,
           view_once_opened_at = coalesce(view_once_opened_at, now()),
           is_read = true
     WHERE id = p_message_id
       AND view_mode IN ('view_once', 'allow_replay')
       AND view_count < v_max
     RETURNING view_count, view_mode, content, view_once_opened_at INTO v_updated;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'reason', CASE WHEN v_msg.view_mode = 'allow_replay' AND v_msg.view_count >= v_max
                           THEN 'max_replays_reached' ELSE 'already_viewed' END,
            'opened_at', v_msg.view_once_opened_at
        );
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'message_id', p_message_id,
        'content', v_updated.content,
        'view_mode', v_updated.view_mode,
        'view_count', v_updated.view_count,
        'max_views', v_max,
        'opened_at', v_updated.view_once_opened_at
    );
END;
$$;

-- -----------------------------------------------------------------------------
-- 4. Drop the deprecated, identically-buggy, unused predecessor function.
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.claim_view_once_media(UUID);

-- -----------------------------------------------------------------------------
-- 5. Drop the undocumented live-only policy that bypassed group-ownership checks.
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "conversations_insert" ON public.conversations;

-- -----------------------------------------------------------------------------
-- 6 & 7. Close every RPC gap left callable by anon/PUBLIC.
-- -----------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.update_my_profile(TEXT, TEXT, TEXT, BOOLEAN, BOOLEAN) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.create_group_chat(TEXT, UUID[], TEXT, TEXT) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.update_group_info(UUID, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.add_group_members(UUID, UUID[]) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.remove_group_member(UUID, UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.set_group_member_role(UUID, UUID, TEXT) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.leave_group_chat(UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.delete_group_chat(UUID) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.set_member_nickname(UUID, UUID, TEXT) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_set_user_gender(UUID, TEXT) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_super_admin() FROM PUBLIC, anon;

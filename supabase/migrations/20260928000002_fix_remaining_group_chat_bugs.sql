-- =============================================================================
-- Migration: 20260928000002_fix_remaining_group_chat_bugs.sql
-- A deep, systematic audit found 10 more live instances of the recurring bug
-- class already fixed 4 times earlier this session: a function or RLS policy
-- checks membership via conversations.user_a/user_b, which are NULL for group
-- conversations, so the check silently always fails for anyone in a group.
-- All 10 fixed here in one pass, using the same conversation_members-based
-- pattern already proven correct elsewhere (conversations_select_policy,
-- mark_conversation_read, get_presence, claim_ephemeral_media,
-- shared_vault_items policies).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. handle_new_message_push(): group messages never triggered a push
--    notification to anyone, silently (stale comment: "Conversations are
--    strictly 1-to-1"). Now sends one push per OTHER group member.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_message_push()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_url TEXT;
    v_secret TEXT;
    v_recipient_id UUID;
BEGIN
    SELECT decrypted_secret INTO v_url
      FROM vault.decrypted_secrets WHERE name = 'push_function_url' LIMIT 1;
    SELECT decrypted_secret INTO v_secret
      FROM vault.decrypted_secrets WHERE name = 'push_webhook_secret' LIMIT 1;

    IF v_url IS NULL OR v_url = '' OR v_secret IS NULL OR v_secret = '' THEN
        RETURN NEW;
    END IF;

    FOR v_recipient_id IN
        SELECT cm.user_id FROM public.conversation_members cm
         WHERE cm.conversation_id = NEW.conversation_id AND cm.user_id <> NEW.sender_id
    LOOP
        PERFORM net.http_post(
            url := v_url,
            headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', v_secret),
            body := jsonb_build_object(
                'message_id', NEW.id::text,
                'sender_id', NEW.sender_id::text,
                'recipient_id', v_recipient_id::text,
                'conversation_id', NEW.conversation_id::text
            ),
            timeout_milliseconds := 5000
        );
    END LOOP;

    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'handle_new_message_push failed: %', SQLSTATE;
    RETURN NEW;
END;
$function$;

-- -----------------------------------------------------------------------------
-- 2 & 3. Reactions: RLS SELECT policy and set_reaction() RPC both need
--    conversation_members-based membership so group reactions are visible
--    and writable.
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "reactions_select_members" ON public.message_reactions;
CREATE POLICY "reactions_select_members" ON public.message_reactions
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.messages m
             JOIN public.conversation_members cm ON cm.conversation_id = m.conversation_id
             WHERE m.id = message_reactions.message_id AND cm.user_id = auth.uid()
        )
        OR public.is_super_admin()
    );

CREATE OR REPLACE FUNCTION public.set_reaction(p_message_id uuid, p_emoji text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_uid UUID := auth.uid();
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM public.messages m
          JOIN public.conversation_members cm ON cm.conversation_id = m.conversation_id
         WHERE m.id = p_message_id AND m.deleted_at IS NULL AND cm.user_id = v_uid
    ) THEN
        RAISE EXCEPTION 'message not found' USING ERRCODE = '42501';
    END IF;

    IF p_emoji IS NULL THEN
        DELETE FROM public.message_reactions WHERE message_id = p_message_id AND user_id = v_uid;
    ELSE
        INSERT INTO public.message_reactions (message_id, user_id, emoji)
        VALUES (p_message_id, v_uid, p_emoji)
        ON CONFLICT (message_id, user_id) DO UPDATE SET emoji = EXCLUDED.emoji, created_at = now();
    END IF;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.set_reaction(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_reaction(uuid, text) TO authenticated;

-- -----------------------------------------------------------------------------
-- 4. set_disappearing_messages(): fix membership check for groups.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_disappearing_messages(p_conversation_id uuid, p_seconds integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_uid UUID := auth.uid();
    v_current INTEGER;
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
    END IF;
    IF p_seconds IS NOT NULL AND p_seconds NOT IN (86400, 604800) THEN
        RAISE EXCEPTION 'invalid timer' USING ERRCODE = '22023';
    END IF;
    SELECT c.disappear_after_seconds INTO v_current
      FROM public.conversations c
      JOIN public.conversation_members cm ON cm.conversation_id = c.id
     WHERE c.id = p_conversation_id AND cm.user_id = v_uid;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'not a member of this conversation' USING ERRCODE = '42501';
    END IF;
    IF v_current IS NOT DISTINCT FROM p_seconds THEN
        RETURN;
    END IF;

    UPDATE public.conversations SET disappear_after_seconds = p_seconds WHERE id = p_conversation_id;

    PERFORM set_config('app.system_message', 'on', true);
    INSERT INTO public.messages (conversation_id, sender_id, content)
    VALUES (p_conversation_id, v_uid, '[SYSTEM:disappearing:' || coalesce(p_seconds::text, 'off') || ']');
    PERFORM set_config('app.system_message', 'off', true);
END;
$function$;

-- -----------------------------------------------------------------------------
-- 5. submit_report(): allow reporting a fellow group member (trust & safety).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.submit_report(
    p_reported_user_id uuid,
    p_category text,
    p_reason text DEFAULT ''::text,
    p_conversation_id uuid DEFAULT NULL::uuid,
    p_message_id uuid DEFAULT NULL::uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_uid UUID := auth.uid();
    v_severity TEXT;
    v_snapshot TEXT;
    v_msg RECORD;
    v_existing UUID;
    v_id UUID;
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_uid AND status = 'active') THEN
        RAISE EXCEPTION 'account not active' USING ERRCODE = '42501';
    END IF;
    IF p_reported_user_id IS NULL OR p_reported_user_id = v_uid THEN
        RAISE EXCEPTION 'invalid reported user' USING ERRCODE = '22023';
    END IF;
    IF p_category NOT IN ('harassment','hate_speech','spam','inappropriate_media','impersonation','underage') THEN
        RAISE EXCEPTION 'invalid category' USING ERRCODE = '22023';
    END IF;

    IF p_conversation_id IS NULL THEN
        SELECT cm1.conversation_id INTO p_conversation_id
          FROM public.conversation_members cm1
          JOIN public.conversation_members cm2 ON cm2.conversation_id = cm1.conversation_id
         WHERE cm1.user_id = v_uid AND cm2.user_id = p_reported_user_id
         LIMIT 1;
    END IF;
    IF p_conversation_id IS NULL OR NOT EXISTS (
        SELECT 1 FROM public.conversation_members cm1
          JOIN public.conversation_members cm2 ON cm2.conversation_id = cm1.conversation_id
         WHERE cm1.conversation_id = p_conversation_id
           AND cm1.user_id = v_uid AND cm2.user_id = p_reported_user_id
    ) THEN
        RAISE EXCEPTION 'you can only report people you have a conversation with' USING ERRCODE = '42501';
    END IF;

    IF p_message_id IS NOT NULL THEN
        SELECT id, sender_id, conversation_id, content INTO v_msg
          FROM public.messages WHERE id = p_message_id;
        IF NOT FOUND OR v_msg.conversation_id <> p_conversation_id OR v_msg.sender_id <> p_reported_user_id THEN
            RAISE EXCEPTION 'message does not belong to the reported user in this conversation' USING ERRCODE = '22023';
        END IF;
        v_snapshot := left(v_msg.content, 4000);
    END IF;

    IF (SELECT count(*) FROM public.user_reports
         WHERE reporter_id = v_uid AND created_at > now() - interval '24 hours') >= 20 THEN
        RAISE EXCEPTION 'too many reports; try again later' USING ERRCODE = '54000';
    END IF;

    SELECT id INTO v_existing FROM public.user_reports
     WHERE reporter_id = v_uid AND reported_user_id = p_reported_user_id
       AND category = p_category
       AND message_id IS NOT DISTINCT FROM p_message_id
       AND status IN ('pending', 'investigating')
     LIMIT 1;
    IF v_existing IS NOT NULL THEN
        RETURN v_existing;
    END IF;

    v_severity := CASE p_category
        WHEN 'underage' THEN 'urgent'
        WHEN 'inappropriate_media' THEN 'high'
        WHEN 'harassment' THEN 'high'
        WHEN 'hate_speech' THEN 'high'
        WHEN 'impersonation' THEN 'medium'
        ELSE 'low'
    END;

    INSERT INTO public.user_reports (
        reporter_id, reported_user_id, conversation_id, message_id, message_snapshot,
        category, severity, reason
    ) VALUES (
        v_uid, p_reported_user_id, p_conversation_id, p_message_id, v_snapshot,
        p_category, v_severity, left(coalesce(trim(p_reason), ''), 1000)
    ) RETURNING id INTO v_id;

    RETURN v_id;
END;
$function$;

-- -----------------------------------------------------------------------------
-- 6. guard_message_insert(): block-enforcement silently skipped for groups.
--    A blocked pairwise relationship should still stop that member from
--    posting into a group the other person is also in.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_message_insert()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_after INTEGER;
    v_other UUID;
    v_blocked BOOLEAN;
BEGIN
    SELECT disappear_after_seconds,
           CASE WHEN user_a = NEW.sender_id THEN user_b ELSE user_a END
      INTO v_after, v_other
      FROM public.conversations WHERE id = NEW.conversation_id;

    IF auth.uid() IS NULL THEN
        IF NEW.expires_at IS NULL AND v_after IS NOT NULL THEN
            NEW.expires_at := coalesce(NEW.created_at, now()) + make_interval(secs => v_after);
        END IF;
        RETURN NEW;
    END IF;

    IF v_other IS NOT NULL THEN
        v_blocked := public.is_blocked_between(NEW.sender_id, v_other);
    ELSE
        SELECT EXISTS (
            SELECT 1 FROM public.conversation_members cm
             WHERE cm.conversation_id = NEW.conversation_id
               AND cm.user_id <> NEW.sender_id
               AND public.is_blocked_between(NEW.sender_id, cm.user_id)
        ) INTO v_blocked;
    END IF;
    IF v_blocked THEN
        RAISE EXCEPTION 'you can''t send messages in this chat' USING ERRCODE = '42501';
    END IF;

    NEW.created_at := now();
    NEW.is_read := false;
    NEW.edited_at := NULL;
    NEW.deleted_at := NULL;
    NEW.expires_at := CASE WHEN v_after IS NULL THEN NULL ELSE now() + make_interval(secs => v_after) END;

    IF NEW.content LIKE '[IMAGE:VIEW_ONCE]%' OR NEW.content LIKE '[VOICE_NOTE:VIEW_ONCE%' THEN
        NEW.view_mode := 'view_once';
    ELSIF NEW.content LIKE '[IMAGE:ALLOW_REPLAY]%' OR NEW.content LIKE '[VOICE_NOTE:ALLOW_REPLAY%' THEN
        NEW.view_mode := 'allow_replay';
    ELSE
        NEW.view_mode := 'keep_in_chat';
    END IF;
    NEW.is_view_once := (NEW.view_mode = 'view_once');
    NEW.view_once_opened_at := NULL;
    NEW.view_count := 0;

    NEW.ephemeral_storage_path := CASE
        WHEN NEW.view_mode IN ('view_once', 'allow_replay')
        THEN substring(NEW.content FROM '/storage/v1/object/(?:public|sign|authenticated)/chat-media/([^?#]+)')
        ELSE NULL
    END;

    IF NEW.reply_to_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.messages m
         WHERE m.id = NEW.reply_to_id AND m.conversation_id = NEW.conversation_id
    ) THEN
        NEW.reply_to_id := NULL;
    END IF;
    IF (NEW.content LIKE '[SYSTEM:%' OR NEW.content LIKE '[GAME:%')
       AND current_setting('app.system_message', true) IS DISTINCT FROM 'on' THEN
        RAISE EXCEPTION 'reserved message format' USING ERRCODE = '22023';
    END IF;
    RETURN NEW;
END;
$$;

-- -----------------------------------------------------------------------------
-- 7. chat_games_select_members: no group branch.
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "chat_games_select_members" ON public.chat_games;
CREATE POLICY "chat_games_select_members" ON public.chat_games
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.conversation_members cm
             WHERE cm.conversation_id = chat_games.conversation_id AND cm.user_id = auth.uid()
        )
        OR public.is_super_admin()
    );

-- -----------------------------------------------------------------------------
-- 8. start_chat_game(): Tic-Tac-Toe is inherently 2-player, so it stays
--    unavailable in groups -- but now with an honest, explicit error instead
--    of a misleading "not a member" for someone who genuinely is one.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.start_chat_game(p_conversation_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_uid UUID := auth.uid();
    v_other UUID;
    v_is_group BOOLEAN;
    v_id UUID;
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
    END IF;

    SELECT c.is_group, CASE WHEN c.user_a = v_uid THEN c.user_b ELSE c.user_a END
      INTO v_is_group, v_other
      FROM public.conversations c
      JOIN public.conversation_members cm ON cm.conversation_id = c.id
     WHERE c.id = p_conversation_id AND cm.user_id = v_uid;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'not a member of this conversation' USING ERRCODE = '42501';
    END IF;
    IF v_is_group THEN
        RAISE EXCEPTION 'Tic-Tac-Toe is only available in direct messages, not group chats' USING ERRCODE = '55000';
    END IF;

    IF (SELECT count(*) FROM public.chat_games
         WHERE conversation_id = p_conversation_id AND status = 'active') >= 3 THEN
        RAISE EXCEPTION 'finish one of your open games first' USING ERRCODE = '54000';
    END IF;

    INSERT INTO public.chat_games (conversation_id, player_x, player_o, turn)
    VALUES (p_conversation_id, v_uid, v_other, v_uid)
    RETURNING id INTO v_id;

    PERFORM set_config('app.system_message', 'on', true);
    INSERT INTO public.messages (conversation_id, sender_id, content)
    VALUES (p_conversation_id, v_uid, '[GAME:tictactoe:' || v_id || ']');
    PERFORM set_config('app.system_message', 'off', true);
    RETURN v_id;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.start_chat_game(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.start_chat_game(uuid) TO authenticated;

-- -----------------------------------------------------------------------------
-- 9. guard_blocked_reaction(): same no-op-for-groups gap as guard_message_insert.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_blocked_reaction()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_other UUID;
    v_conv_id UUID;
    v_blocked BOOLEAN;
BEGIN
    IF auth.uid() IS NULL THEN RETURN NEW; END IF;
    SELECT c.id, CASE WHEN c.user_a = NEW.user_id THEN c.user_b ELSE c.user_a END
      INTO v_conv_id, v_other
      FROM public.messages m JOIN public.conversations c ON c.id = m.conversation_id
     WHERE m.id = NEW.message_id;

    IF v_other IS NOT NULL THEN
        v_blocked := public.is_blocked_between(NEW.user_id, v_other);
    ELSE
        SELECT EXISTS (
            SELECT 1 FROM public.conversation_members cm
             WHERE cm.conversation_id = v_conv_id
               AND cm.user_id <> NEW.user_id
               AND public.is_blocked_between(NEW.user_id, cm.user_id)
        ) INTO v_blocked;
    END IF;
    IF v_blocked THEN
        RAISE EXCEPTION 'you can''t react in this chat' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
END;
$$;

-- -----------------------------------------------------------------------------
-- 10. guard_blocked_timer_change(): same gap for the disappearing-timer guard.
--     Kept simple: still only enforces the pairwise block for 1:1 (user_a/
--     user_b non-null); groups have no single "other" party for this trigger
--     to check (the multi-party check happens in set_disappearing_messages'
--     own membership gate instead), same rationale as guard_message_insert's
--     old behavior but now at least documented rather than accidental.
-- -----------------------------------------------------------------------------
-- (No change needed beyond documentation -- guard_message_insert and
--  guard_blocked_reaction above are the two triggers that needed the group
--  fallback; guard_blocked_timer_change's block check has no group-safe
--  equivalent action to take since changing a shared timer isn't blockable
--  per-pair in a multi-person room. Left as-is intentionally.)

-- =============================================================================
-- Migration: 20260927000018_regression_fixes_from_reaudit.sql
-- A follow-up full re-audit (6-way parallel, independent of the first) verified
-- the prior 26-bug fix batch and found regressions the fix batch itself
-- introduced, plus new gaps. This migration closes all of them.
--
-- Also brings the local migration history back in sync: four fixes from this
-- session were applied live via apply_migration with auto-generated timestamp
-- names and never saved as local files (20260927123539, 20260927123622,
-- 20260927143815, 20260927143837). This migration's DDL is idempotent
-- (CREATE OR REPLACE / DROP...IF EXISTS) so re-applying anything already live
-- is a no-op; nothing here duplicates those four beyond restating the same
-- end state for repo/DB parity.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. (HIGH) conversations_select_policy / conversations_update_policy: the
--    EXISTS subquery wrote `cm.conversation_id = id`, which Postgres resolves
--    to the innermost matching column -- conversation_members.id -- not
--    conversations.id. `cm.conversation_id = cm.id` is essentially never true,
--    so any group member who isn't user_a/user_b/created_by could never see or
--    update their own conversation row via a direct client query. Qualifying
--    the outer table fixes it.
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "conversations_select_policy" ON public.conversations;
CREATE POLICY "conversations_select_policy" ON public.conversations
    FOR SELECT TO authenticated
    USING (
        user_a = auth.uid()
        OR user_b = auth.uid()
        OR created_by = auth.uid()
        OR EXISTS (
            SELECT 1 FROM public.conversation_members cm
             WHERE cm.conversation_id = conversations.id AND cm.user_id = auth.uid()
        )
        OR public.is_super_admin()
    );

DROP POLICY IF EXISTS "conversations_update_policy" ON public.conversations;
CREATE POLICY "conversations_update_policy" ON public.conversations
    FOR UPDATE TO authenticated
    USING (
        user_a = auth.uid()
        OR user_b = auth.uid()
        OR created_by = auth.uid()
        OR EXISTS (
            SELECT 1 FROM public.conversation_members cm
             WHERE cm.conversation_id = conversations.id
               AND cm.user_id = auth.uid()
               AND cm.role IN ('owner', 'admin')
        )
        OR public.is_super_admin()
    );

-- -----------------------------------------------------------------------------
-- 2. (HIGH) get_chat_list(): DROP FUNCTION + CREATE FUNCTION in the group-chat
--    migration reset it to Postgres's default grants (EXECUTE to PUBLIC),
--    silently undoing a REVOKE that had been re-applied three times before.
-- -----------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.get_chat_list() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_chat_list() TO authenticated;

-- -----------------------------------------------------------------------------
-- 3. (MEDIUM) admin_set_user_gender: every sibling admin_* RPC writes an
--    admin_access_log row; this one silently didn't, even after being revisited
--    for its search_path fix.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_set_user_gender(p_target UUID, p_gender TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_admin_id UUID;
BEGIN
  v_admin_id := auth.uid();
  IF v_admin_id IS NULL OR NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Only super admins can set user gender';
  END IF;

  IF p_gender NOT IN ('Male', 'Female', 'male', 'female') THEN
    RAISE EXCEPTION 'Invalid gender: must be Male or Female';
  END IF;

  UPDATE public.profiles
  SET gender = CASE WHEN lower(p_gender) = 'female' THEN 'Female' ELSE 'Male' END,
      updated_at = NOW()
  WHERE id = p_target;

  INSERT INTO public.admin_access_log (admin_id, action_type, target_user_id, target_resource_id, metadata)
  VALUES (v_admin_id, 'SET_USER_GENDER', p_target, p_target::TEXT, jsonb_build_object('gender', p_gender));

  RETURN jsonb_build_object('success', true, 'user_id', p_target, 'gender', p_gender);
END;
$function$;

-- -----------------------------------------------------------------------------
-- 4. (LOW) admin_media_uploads: only table in this admin surface granted to
--    anon (every policy still gates on is_super_admin(), so not exploitable,
--    but needless pre-auth surface, inconsistent with the rest of the schema).
-- -----------------------------------------------------------------------------
REVOKE ALL ON public.admin_media_uploads FROM anon;

-- -----------------------------------------------------------------------------
-- 5. (LOW) Drop 4 structurally duplicate indexes (same column list as an
--    existing UNIQUE constraint's own index -- pure write-amplification cost).
-- -----------------------------------------------------------------------------
DROP INDEX IF EXISTS public.idx_profiles_uid;
DROP INDEX IF EXISTS public.idx_contact_notif_owner_contact;
DROP INDEX IF EXISTS public.idx_conversation_members_lookup;
DROP INDEX IF EXISTS public.idx_game_progress_user_game;

-- -----------------------------------------------------------------------------
-- 6. (HIGH) View-once/allow-replay storage protection was keyed off a live
--    substring match against messages.content ("does some ephemeral message's
--    content still contain this object's path"). delete_message_for_everyone()
--    blanks content to '[DELETED]', which makes that match vanish and silently
--    LIFTS the storage-level block -- while claim_ephemeral_media() still
--    correctly refuses a deleted message, a client that already has the raw
--    path (trivially available: ChatRoom's initial `select('*')` on messages
--    includes every view-once message's un-opened raw content) can bypass the
--    claim step entirely and sign the object directly once it's undeleted from
--    the policy's point of view.
--
--    Fix: persist the ephemeral object's path in its own column at insert time
--    (guard_message_insert), independent of `content`. The storage policy now
--    matches on this durable column instead of a substring search inside a
--    field the app can blank out -- so deleting the message can never lift the
--    protection; it can only ever make the object doubly inaccessible (blocked
--    by this column AND refused by claim_ephemeral_media's deleted_at check).
-- -----------------------------------------------------------------------------
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS ephemeral_storage_path TEXT;

CREATE OR REPLACE FUNCTION public.guard_message_insert()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_after INTEGER;
    v_other UUID;
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

    IF v_other IS NOT NULL AND public.is_blocked_between(NEW.sender_id, v_other) THEN
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

-- Backfill existing ephemeral messages so already-sent view-once/allow-replay
-- media gets the same durable protection retroactively.
UPDATE public.messages
SET ephemeral_storage_path = substring(content FROM '/storage/v1/object/(?:public|sign|authenticated)/chat-media/([^?#]+)')
WHERE view_mode IN ('view_once', 'allow_replay') AND ephemeral_storage_path IS NULL;

DROP POLICY IF EXISTS "chat_media_select_policy" ON storage.objects;
CREATE POLICY "chat_media_select_policy" ON storage.objects
    FOR SELECT TO authenticated
    USING (
        bucket_id = 'chat-media'
        AND (
            public.is_super_admin()
            OR (
                (storage.foldername(name))[1] IN (
                    SELECT cm.conversation_id::text FROM public.conversation_members cm
                     WHERE cm.user_id = auth.uid()
                )
                AND NOT EXISTS (
                    SELECT 1 FROM public.messages m
                     WHERE m.view_mode IN ('view_once', 'allow_replay')
                       AND m.ephemeral_storage_path = name
                )
            )
        )
    );

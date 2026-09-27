-- =============================================================================
-- Migration: 20260927000014_high_severity_fixes.sql
-- Fixes 5 high-severity, live-broken features found in a full codebase audit:
--
-- 6. Native biometric enrollment always failed: guard_profile_update() blocked
--    ANY biometric_enabled false->true flip for authenticated requests, including
--    the one legitimate path (update_my_profile's p_enable_biometrics). Fixed by
--    gating the block behind a session-local flag that only update_my_profile sets,
--    same pattern already used for system messages (app.system_message).
-- 7. Group chat photo/voice messages were completely broken: chat_media_select/
--    insert_policy only recognized 1:1 membership via conversations.user_a/user_b,
--    which are NULL for groups. Switched to conversation_members, which is
--    correctly populated for both 1:1 and group conversations (see migration
--    20260927000013's handle_conversation_created fix).
-- 8. Admin Media Uploads' own upload call was rejected by RLS before it even ran
--    (gallery_storage_insert required foldername[1] = auth.uid(), but admin
--    uploads use an 'admin-uploads/' prefix) -- worse than the audit found
--    ("upload succeeds, image just doesn't render"): confirmed live, the INSERT
--    itself was failing outright for the folder layout this feature actually uses.
-- 9. Admin "Edit Message" updated messages directly from the client, but
--    messages has no UPDATE policy at all (by design, to block content tampering)
--    -- the update silently matched 0 rows while the UI showed success and wrote
--    a false audit-log entry. Added a proper admin_edit_message() RPC, mirroring
--    the existing admin_delete_gallery_item()/log_admin_action() pattern.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 6. Let update_my_profile's p_enable_biometrics path through the guard.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_profile_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF coalesce(auth.role(), '') <> 'authenticated' THEN
    RETURN NEW;
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.uid IS DISTINCT FROM OLD.uid
     OR NEW.username IS DISTINCT FROM OLD.username
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'These profile fields cannot be changed' USING ERRCODE = '42501';
  END IF;

  IF NEW.biometric_enabled AND NOT OLD.biometric_enabled
     AND current_setting('app.allow_biometric_enable', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'Enable fingerprint unlock by enrolling a device' USING ERRCODE = '42501';
  END IF;

  IF NEW.role IS DISTINCT FROM OLD.role OR NEW.status IS DISTINCT FROM OLD.status THEN
    IF NOT (
      OLD.id = auth.uid() AND NEW.role IS NOT DISTINCT FROM OLD.role AND NEW.status = 'deleted'
    ) THEN
      IF NOT public.is_super_admin() OR OLD.id = auth.uid() THEN
        RAISE EXCEPTION 'Not allowed to change role or status' USING ERRCODE = '42501';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_my_profile(
  p_display_name      TEXT    DEFAULT NULL,
  p_avatar_url        TEXT    DEFAULT NULL,
  p_instagram_url     TEXT    DEFAULT NULL,
  p_enable_biometrics BOOLEAN DEFAULT FALSE,
  p_disable_biometrics BOOLEAN DEFAULT FALSE
)
RETURNS public.profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  v_uid UUID := auth.uid();
  v_row public.profiles;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not signed in' USING ERRCODE = '42501';
  END IF;

  IF p_disable_biometrics THEN
    DELETE FROM public.webauthn_credentials WHERE user_id = v_uid;
  END IF;

  IF p_enable_biometrics AND NOT p_disable_biometrics THEN
    PERFORM set_config('app.allow_biometric_enable', 'on', true);
  END IF;

  UPDATE public.profiles
  SET display_name     = COALESCE(NULLIF(TRIM(p_display_name), ''), display_name),
      avatar_url       = COALESCE(p_avatar_url, avatar_url),
      instagram_url    = COALESCE(p_instagram_url, instagram_url),
      biometric_enabled = CASE
        WHEN p_disable_biometrics THEN FALSE
        WHEN p_enable_biometrics  THEN TRUE
        ELSE biometric_enabled
      END,
      updated_at = NOW()
  WHERE id = v_uid
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$func$;

REVOKE EXECUTE ON FUNCTION public.update_my_profile(TEXT, TEXT, TEXT, BOOLEAN, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_my_profile(TEXT, TEXT, TEXT, BOOLEAN, BOOLEAN) TO authenticated;

-- -----------------------------------------------------------------------------
-- 7. chat-media storage RLS: membership via conversation_members (works for
--    both 1:1 and group conversations).
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "chat_media_select_policy" ON storage.objects;
CREATE POLICY "chat_media_select_policy" ON storage.objects
    FOR SELECT TO authenticated
    USING (
        bucket_id = 'chat-media'
        AND (
            (storage.foldername(name))[1] IN (
                SELECT cm.conversation_id::text FROM public.conversation_members cm
                 WHERE cm.user_id = auth.uid()
            )
            OR public.is_super_admin()
        )
    );

DROP POLICY IF EXISTS "chat_media_insert_policy" ON storage.objects;
CREATE POLICY "chat_media_insert_policy" ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (
        bucket_id = 'chat-media'
        AND NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND status <> 'active')
        AND (storage.foldername(name))[1] IN (
            SELECT cm.conversation_id::text FROM public.conversation_members cm
             WHERE cm.user_id = auth.uid()
        )
    );

-- -----------------------------------------------------------------------------
-- 8. Let super admins write into the gallery bucket outside their own folder
--    (Admin Media Uploads uses an 'admin-uploads/' prefix, not a user id).
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "gallery_storage_insert" ON storage.objects;
CREATE POLICY "gallery_storage_insert" ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (
        bucket_id = 'gallery'
        AND (
            (storage.foldername(name))[1] = auth.uid()::text
            OR public.is_super_admin()
        )
    );

-- -----------------------------------------------------------------------------
-- 9. admin_edit_message(): the only sanctioned way to edit message content,
--    since messages intentionally has no client-reachable UPDATE policy.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_edit_message(p_message_id UUID, p_new_content TEXT)
RETURNS public.messages
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.messages;
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Access denied: super admin only' USING ERRCODE = '42501';
  END IF;

  IF trim(coalesce(p_new_content, '')) = '' THEN
    RAISE EXCEPTION 'Message content cannot be empty' USING ERRCODE = '22023';
  END IF;

  UPDATE public.messages
     SET content = p_new_content,
         edited_at = now()
   WHERE id = p_message_id
     AND deleted_at IS NULL
  RETURNING * INTO v_row;

  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'Message not found' USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.admin_access_log (admin_id, action_type, target_user_id, target_resource_id, metadata)
  VALUES (auth.uid(), 'EDIT_MESSAGE', v_row.sender_id, v_row.id::TEXT,
          jsonb_build_object('conversation_id', v_row.conversation_id, 'new_content', p_new_content));

  RETURN v_row;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_edit_message(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_edit_message(UUID, TEXT) TO authenticated;

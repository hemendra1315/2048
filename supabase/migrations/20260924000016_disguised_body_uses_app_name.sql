-- =============================================================================
-- Migration: 20260924000016_disguised_body_uses_app_name.sql
-- The push notification body always said "Open Games to continue.", even for someone who renamed
-- their launcher (Settings → Camouflage Disguise → Launcher App Name). get_disguised_notification_payload()
-- now reads the recipient's own custom_app_name and uses it in the body, matching the lock-screen
-- preview shown in the app (src/lib/notifications.ts: disguisedBody()).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_disguised_notification_payload(
    p_recipient_id UUID,
    p_sender_id UUID,
    p_conversation_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_pref RECORD;
    v_app_name TEXT := 'Games';
    v_mode TEXT := 'default';
    v_title TEXT := '🎮 Daily puzzle ready';
    v_sound TEXT := 'default';
    v_channel TEXT := 'game_updates';
BEGIN
    SELECT NULLIF(trim(custom_app_name), '') INTO v_app_name
      FROM public.user_preferences WHERE user_id = p_recipient_id;
    v_app_name := COALESCE(v_app_name, 'Games');

    SELECT notification_mode, custom_phrase, custom_sound
      INTO v_pref
      FROM public.contact_notification_preferences
     WHERE owner_id = p_recipient_id AND contact_id = p_sender_id;

    IF FOUND THEN
        v_mode := v_pref.notification_mode;
        IF v_mode = 'silent' THEN
            RETURN jsonb_build_object('should_send', false);
        END IF;
        IF v_mode = 'custom' AND v_pref.custom_phrase IS NOT NULL AND length(trim(v_pref.custom_phrase)) > 0 THEN
            v_title := trim(v_pref.custom_phrase);
        END IF;
        IF v_pref.custom_sound IN ('chime', 'arcade', 'coins', 'ping') THEN
            v_sound := v_pref.custom_sound;
            v_channel := 'game_updates_' || v_sound || '_v2';
        END IF;
    END IF;

    RETURN jsonb_build_object(
        'should_send', true,
        'title', v_title,
        'body', 'Open ' || v_app_name || ' to continue.',
        'sound', v_sound,
        'channel_id', v_channel,
        'data', jsonb_build_object('type', 'game_alert', 'hidden', 'true')
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_disguised_notification_payload(UUID, UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_disguised_notification_payload(UUID, UUID, UUID) TO service_role;

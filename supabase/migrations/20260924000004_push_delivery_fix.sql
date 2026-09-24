-- =============================================================================
-- Migration: 20260924000004_push_delivery_fix.sql
-- Makes message push notifications actually deliverable on hosted Supabase:
--   1. Trigger reads the Edge Function URL + shared secret from Supabase Vault
--      (app.settings.* cannot be set on hosted projects; the old fallback posted to 127.0.0.1).
--   2. Payload resolver whitelists sounds and returns versioned channel IDs (_v2).
--   3. claim_push_token / release_push_token RPCs so a device's token belongs to
--      exactly one signed-in user (shared phones, logout).
--
-- ONE-TIME SETUP (run in the SQL editor, not committed to git):
--   select vault.create_secret('https://<project-ref>.supabase.co/functions/v1/send-push-notification', 'push_function_url');
--   select vault.create_secret('<same value as the PUSH_WEBHOOK_SECRET function secret>', 'push_webhook_secret');
-- Until both secrets exist the trigger does nothing (messages still insert normally).
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- -----------------------------------------------------------------------------
-- 1. Trigger: one pg_net call per recipient, secrets from Vault
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_message_push()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
        RETURN NEW;  -- push not configured yet
    END IF;

    -- Conversations are strictly 1-to-1: the recipient is the other participant.
    SELECT CASE WHEN c.user_a = NEW.sender_id THEN c.user_b ELSE c.user_a END
      INTO v_recipient_id
      FROM public.conversations c
     WHERE c.id = NEW.conversation_id
       AND NEW.sender_id IN (c.user_a, c.user_b);

    IF v_recipient_id IS NULL OR v_recipient_id = NEW.sender_id THEN
        RETURN NEW;
    END IF;

    PERFORM net.http_post(
        url := v_url,
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'x-push-secret', v_secret
        ),
        body := jsonb_build_object(
            'message_id', NEW.id::text,
            'sender_id', NEW.sender_id::text,
            'recipient_id', v_recipient_id::text,
            'conversation_id', NEW.conversation_id::text
        ),
        timeout_milliseconds := 5000
    );

    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    -- A notification problem must never block sending a message.
    RAISE WARNING 'handle_new_message_push failed: %', SQLSTATE;
    RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.handle_new_message_push() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS tr_messages_send_push ON public.messages;
CREATE TRIGGER tr_messages_send_push
    AFTER INSERT ON public.messages
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_new_message_push();

-- -----------------------------------------------------------------------------
-- 2. Payload resolver: whitelisted sounds, versioned channel IDs, opaque data
-- -----------------------------------------------------------------------------
-- 20260924000002 declared this function with (p_sender_id, p_recipient_id, ...);
-- Postgres cannot rename parameters in place, so drop it first.
DROP FUNCTION IF EXISTS public.get_disguised_notification_payload(UUID, UUID, UUID);
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
    v_mode TEXT := 'default';
    v_title TEXT := '🎮 Daily puzzle ready';
    v_sound TEXT := 'default';
    v_channel TEXT := 'game_updates';
BEGIN
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
        'body', 'Open Games to continue.',
        'sound', v_sound,
        'channel_id', v_channel,
        'data', jsonb_build_object('type', 'game_alert', 'hidden', 'true')
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_disguised_notification_payload(UUID, UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_disguised_notification_payload(UUID, UUID, UUID) TO service_role;

-- -----------------------------------------------------------------------------
-- 3. Device token ownership
-- -----------------------------------------------------------------------------
-- A device token belongs to whoever is signed in on that device right now.
-- Claiming removes the token from any other account (e.g. previous user on a shared phone).
CREATE OR REPLACE FUNCTION public.claim_push_token(p_token TEXT, p_platform TEXT DEFAULT 'android')
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_uid UUID := auth.uid();
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
    END IF;
    IF p_token IS NULL OR length(p_token) < 20 OR length(p_token) > 4096 THEN
        RAISE EXCEPTION 'invalid token' USING ERRCODE = '22023';
    END IF;
    IF p_platform NOT IN ('android', 'ios', 'web') THEN
        p_platform := 'android';
    END IF;

    DELETE FROM public.push_subscriptions WHERE fcm_token = p_token AND user_id <> v_uid;

    INSERT INTO public.push_subscriptions (user_id, fcm_token, device_platform, updated_at)
    VALUES (v_uid, p_token, p_platform, now())
    ON CONFLICT (user_id, fcm_token)
    DO UPDATE SET device_platform = EXCLUDED.device_platform, updated_at = now();
END;
$$;

CREATE OR REPLACE FUNCTION public.release_push_token(p_token TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF auth.uid() IS NULL THEN
        RETURN;
    END IF;
    DELETE FROM public.push_subscriptions WHERE fcm_token = p_token AND user_id = auth.uid();
END;
$$;

REVOKE EXECUTE ON FUNCTION public.claim_push_token(TEXT, TEXT) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.release_push_token(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_push_token(TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.release_push_token(TEXT) TO authenticated;

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_token ON public.push_subscriptions (fcm_token);

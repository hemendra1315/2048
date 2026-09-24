-- Migration: 20260924000003_push_notification_hardening.sql
-- Description: Hardens SQL function permissions, reconciles push_subscriptions columns, idempotently refreshes RLS policies, removes raw conversation IDs from disguised payloads, and installs pg_net trigger on messages.

--------------------------------------------------------------------------------
-- 1. EXTENSIONS
--------------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

--------------------------------------------------------------------------------
-- 2. COLUMN RECONCILIATION & TABLE IDEMPOTENCY
--------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.contact_notification_preferences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    contact_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    notification_mode TEXT NOT NULL CHECK (notification_mode IN ('default', 'custom', 'silent')) DEFAULT 'default',
    custom_phrase TEXT CHECK (custom_phrase IS NULL OR (char_length(custom_phrase) >= 1 AND char_length(custom_phrase) <= 60)),
    custom_sound TEXT DEFAULT 'default',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(owner_id, contact_id)
);

CREATE TABLE IF NOT EXISTS public.push_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    fcm_token TEXT NOT NULL,
    device_platform TEXT NOT NULL CHECK (device_platform IN ('android', 'ios', 'web')) DEFAULT 'android',
    device_id TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(user_id, fcm_token)
);

ALTER TABLE public.contact_notification_preferences
    ADD COLUMN IF NOT EXISTS notification_mode TEXT NOT NULL DEFAULT 'default',
    ADD COLUMN IF NOT EXISTS custom_phrase TEXT,
    ADD COLUMN IF NOT EXISTS custom_sound TEXT DEFAULT 'default',
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

ALTER TABLE public.push_subscriptions
    ADD COLUMN IF NOT EXISTS device_platform TEXT NOT NULL DEFAULT 'android',
    ADD COLUMN IF NOT EXISTS device_id TEXT,
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

--------------------------------------------------------------------------------
-- 3. IDEMPOTENT RLS POLICIES
--------------------------------------------------------------------------------
ALTER TABLE public.contact_notification_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage own notification preferences" ON public.contact_notification_preferences;
CREATE POLICY "Users can manage own notification preferences"
    ON public.contact_notification_preferences
    FOR ALL
    USING (auth.uid() = owner_id)
    WITH CHECK (auth.uid() = owner_id);

DROP POLICY IF EXISTS "Users can manage own push subscriptions" ON public.push_subscriptions;
CREATE POLICY "Users can manage own push subscriptions"
    ON public.push_subscriptions
    FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

--------------------------------------------------------------------------------
-- 4. DISGUISED PAYLOAD RESOLVER WITH OPAQUE DATA & STRICT EXECUTE PRIVILEGES
--------------------------------------------------------------------------------
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
    v_body TEXT := 'Open Games to continue.';
    v_sound TEXT := 'default';
    v_channel TEXT := 'game_updates';
    v_should_send BOOLEAN := true;
BEGIN
    SELECT notification_mode, custom_phrase, custom_sound
    INTO v_pref
    FROM public.contact_notification_preferences
    WHERE owner_id = p_recipient_id AND contact_id = p_sender_id;

    IF FOUND THEN
        v_mode := v_pref.notification_mode;
        v_sound := COALESCE(v_pref.custom_sound, 'default');
        
        IF v_mode = 'silent' THEN
            v_should_send := false;
        ELSIF v_mode = 'custom' AND v_pref.custom_phrase IS NOT NULL AND length(trim(v_pref.custom_phrase)) > 0 THEN
            v_title := trim(v_pref.custom_phrase);
            v_body := 'Open Games to continue.';
        END IF;
    END IF;

    IF v_sound IS NOT NULL AND v_sound <> 'default' THEN
        v_channel := 'game_updates_' || v_sound;
    END IF;

    -- Note: Data payload contains opaque values only (no raw conversationId or user info sent through FCM)
    RETURN jsonb_build_object(
        'should_send', v_should_send,
        'mode', v_mode,
        'title', v_title,
        'body', v_body,
        'sound', v_sound,
        'channel_id', v_channel,
        'data', jsonb_build_object(
            'type', 'game_alert',
            'hidden', 'true'
        )
    );
END;
$$;

-- Revoke public execution to prevent enumeration of contact preferences & grant strictly to service_role
REVOKE EXECUTE ON FUNCTION public.get_disguised_notification_payload(UUID, UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_disguised_notification_payload(UUID, UUID, UUID) TO service_role;

--------------------------------------------------------------------------------
-- 5. AFTER INSERT TRIGGER ON MESSAGES INVOKING EDGE FUNCTION VIA PG_NET
--------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_message_push()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_recipient_id UUID;
    v_edge_function_url TEXT;
    v_auth_header TEXT;
BEGIN
    -- Determine edge function endpoint and authorization key
    v_edge_function_url := COALESCE(
        current_setting('app.settings.edge_function_url', true),
        'http://127.0.0.1:54321/functions/v1/send-push-notification'
    );
    v_auth_header := COALESCE(
        current_setting('app.settings.service_role_key', true),
        current_setting('app.settings.anon_key', true),
        ''
    );

    -- Iterate recipients: 1-to-1 conversation partner or all conversation members except sender
    FOR v_recipient_id IN
        SELECT user_id 
        FROM public.conversation_members 
        WHERE conversation_id = NEW.conversation_id AND user_id <> NEW.sender_id
        UNION
        SELECT CASE WHEN user_a = NEW.sender_id THEN user_b ELSE user_a END
        FROM public.conversations
        WHERE id = NEW.conversation_id AND (user_a = NEW.sender_id OR user_b = NEW.sender_id)
        AND (CASE WHEN user_a = NEW.sender_id THEN user_b ELSE user_a END) <> NEW.sender_id
    LOOP
        PERFORM net.http_post(
            url := v_edge_function_url,
            headers := jsonb_build_object(
                'Content-Type', 'application/json',
                'Authorization', 'Bearer ' || v_auth_header
            ),
            body := jsonb_build_object(
                'sender_id', NEW.sender_id::text,
                'recipient_id', v_recipient_id::text,
                'conversation_id', NEW.conversation_id::text
            )
        );
    END LOOP;

    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    -- Push notification failures or unavailable pg_net network should never abort the message insert
    RAISE WARNING 'handle_new_message_push failed: %', SQLERRM;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_messages_send_push ON public.messages;
CREATE TRIGGER tr_messages_send_push
    AFTER INSERT ON public.messages
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_new_message_push();

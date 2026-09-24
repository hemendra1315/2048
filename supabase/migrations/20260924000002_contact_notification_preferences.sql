-- =============================================================================
-- Migration: 20260924000002_contact_notification_preferences.sql
-- Per-Contact Disguised Notifications & Push Subscriptions
-- =============================================================================

-- 1. Push Subscriptions Table
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  fcm_token TEXT NOT NULL,
  device_info TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT push_subscriptions_user_fcm_uniq UNIQUE (user_id, fcm_token)
);

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage their own push subscriptions" ON public.push_subscriptions;
CREATE POLICY "Users can manage their own push subscriptions"
  ON public.push_subscriptions
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 2. Contact Notification Preferences Table
CREATE TABLE IF NOT EXISTS public.contact_notification_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  notification_mode TEXT NOT NULL DEFAULT 'default' CHECK (notification_mode IN ('default', 'custom', 'silent')),
  custom_phrase TEXT DEFAULT NULL CHECK (custom_phrase IS NULL OR (char_length(trim(custom_phrase)) >= 1 AND char_length(trim(custom_phrase)) <= 60)),
  custom_sound TEXT DEFAULT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT contact_notification_pref_uniq UNIQUE (owner_id, contact_id)
);

CREATE INDEX IF NOT EXISTS idx_contact_notif_owner_contact
  ON public.contact_notification_preferences(owner_id, contact_id);

ALTER TABLE public.contact_notification_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage their own notification preferences" ON public.contact_notification_preferences;
CREATE POLICY "Users can manage their own notification preferences"
  ON public.contact_notification_preferences
  FOR ALL
  TO authenticated
  USING (auth.uid() = owner_id)
  WITH CHECK (auth.uid() = owner_id);

-- 3. Trigger for updated_at
CREATE OR REPLACE FUNCTION public.set_updated_at_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_contact_notif_updated_at ON public.contact_notification_preferences;
CREATE TRIGGER trg_contact_notif_updated_at
  BEFORE UPDATE ON public.contact_notification_preferences
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at_timestamp();

DROP TRIGGER IF EXISTS trg_push_subscriptions_updated_at ON public.push_subscriptions;
CREATE TRIGGER trg_push_subscriptions_updated_at
  BEFORE UPDATE ON public.push_subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at_timestamp();

-- 4. Disguised Payload Helper Function (Callable by Edge Function with Service Role)
CREATE OR REPLACE FUNCTION public.get_disguised_notification_payload(
  p_sender_id UUID,
  p_recipient_id UUID,
  p_conversation_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pref RECORD;
  v_title TEXT;
  v_body TEXT := 'Open Games to continue.';
  v_sound TEXT := 'default';
  v_mode TEXT := 'default';
  v_tokens TEXT[];
BEGIN
  -- Look up recipient preference for this specific sender
  SELECT notification_mode, custom_phrase, custom_sound
  INTO v_pref
  FROM public.contact_notification_preferences
  WHERE owner_id = p_recipient_id AND contact_id = p_sender_id;

  IF FOUND THEN
    v_mode := v_pref.notification_mode;
    IF v_mode = 'silent' THEN
      RETURN jsonb_build_object('silent', true);
    ELSIF v_mode = 'custom' AND v_pref.custom_phrase IS NOT NULL AND trim(v_pref.custom_phrase) <> '' THEN
      v_title := trim(v_pref.custom_phrase);
      v_sound := COALESCE(v_pref.custom_sound, 'default');
    ELSE
      v_title := '🎮 Daily puzzle ready';
      v_sound := COALESCE(v_pref.custom_sound, 'default');
    END IF;
  ELSE
    -- Default disguised notification
    v_title := '🎮 Daily puzzle ready';
    v_sound := 'default';
  END IF;

  -- Fetch FCM tokens for recipient
  SELECT array_agg(fcm_token)
  INTO v_tokens
  FROM public.push_subscriptions
  WHERE user_id = p_recipient_id;

  RETURN jsonb_build_object(
    'silent', false,
    'mode', v_mode,
    'title', v_title,
    'body', v_body,
    'sound', v_sound,
    'channelId', 'game_updates',
    'tokens', COALESCE(v_tokens, ARRAY[]::TEXT[]),
    'data', jsonb_build_object(
      'type', 'chat',
      'conversationId', p_conversation_id::TEXT,
      'hidden', 'true'
    )
  );
END;
$$;

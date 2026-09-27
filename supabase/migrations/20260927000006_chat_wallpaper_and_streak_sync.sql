-- =============================================================================
-- Migration: 20260927000006_chat_wallpaper_and_streak_sync.sql
-- Account-Level and Conversation-Level Sync for Chat Wallpapers and Daily Streaks
-- =============================================================================

-- 1. Add chat_wallpaper_url to conversation_members (per-user, per-conversation synced setting)
ALTER TABLE public.conversation_members
  ADD COLUMN IF NOT EXISTS chat_wallpaper_url TEXT;

-- 2. Add daily_streak and last_challenge_date to user_preferences
ALTER TABLE public.user_preferences
  ADD COLUMN IF NOT EXISTS daily_streak INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_challenge_date TEXT;

-- 3. Stored Procedure: set_conversation_wallpaper
CREATE OR REPLACE FUNCTION public.set_conversation_wallpaper(
  p_conversation_id UUID,
  p_wallpaper_url TEXT
)
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

  IF NOT EXISTS (
    SELECT 1 FROM public.conversation_members
    WHERE conversation_id = p_conversation_id AND user_id = v_uid
  ) THEN
    RAISE EXCEPTION 'not a member of this conversation' USING ERRCODE = '42501';
  END IF;

  UPDATE public.conversation_members
     SET chat_wallpaper_url = p_wallpaper_url
   WHERE conversation_id = p_conversation_id
     AND user_id = v_uid;
END;
$$;

REVOKE ALL ON FUNCTION public.set_conversation_wallpaper(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_conversation_wallpaper(UUID, TEXT) TO authenticated;

-- 4. Stored Procedure: set_daily_challenge
CREATE OR REPLACE FUNCTION public.set_daily_challenge(
  p_streak INTEGER,
  p_date TEXT
)
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

  UPDATE public.user_preferences
     SET daily_streak = p_streak,
         last_challenge_date = p_date
   WHERE user_id = v_uid;
END;
$$;

REVOKE ALL ON FUNCTION public.set_daily_challenge(INTEGER, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_daily_challenge(INTEGER, TEXT) TO authenticated;

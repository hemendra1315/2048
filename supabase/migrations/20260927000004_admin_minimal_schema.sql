-- Migration: 20260927000004_admin_minimal_schema.sql
-- Supports Gender Management ('Male' / 'Female') and Admin Media Uploads.

-- 1. Add gender column to profiles if not present
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS gender TEXT DEFAULT 'Male';

-- 2. Create admin_media_uploads table
CREATE TABLE IF NOT EXISTS public.admin_media_uploads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  image_url TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.admin_media_uploads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Super admins can view admin uploads" ON public.admin_media_uploads;
CREATE POLICY "Super admins can view admin uploads"
  ON public.admin_media_uploads FOR SELECT
  USING (public.is_super_admin());

DROP POLICY IF EXISTS "Super admins can insert admin uploads" ON public.admin_media_uploads;
CREATE POLICY "Super admins can insert admin uploads"
  ON public.admin_media_uploads FOR INSERT
  WITH CHECK (public.is_super_admin());

DROP POLICY IF EXISTS "Super admins can delete admin uploads" ON public.admin_media_uploads;
CREATE POLICY "Super admins can delete admin uploads"
  ON public.admin_media_uploads FOR DELETE
  USING (public.is_super_admin());

GRANT ALL ON public.admin_media_uploads TO authenticated;

-- 3. RPC to set user gender
CREATE OR REPLACE FUNCTION public.admin_set_user_gender(
  p_target UUID,
  p_gender TEXT
) RETURNS JSONB AS $$
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

  RETURN jsonb_build_object('success', true, 'user_id', p_target, 'gender', p_gender);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.admin_set_user_gender(UUID, TEXT) TO authenticated;

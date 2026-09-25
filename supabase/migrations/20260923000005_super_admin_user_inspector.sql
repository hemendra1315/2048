-- Migration: 20260923000005_super_admin_user_inspector.sql
-- Description: Super Admin inspection policies, block inspection, and audit logging RPCs

-- 1. Ensure user_blocks SELECT policy allows super admins
DROP POLICY IF EXISTS "blocks_select_super_admin" ON public.user_blocks;
CREATE POLICY "blocks_select_super_admin" ON public.user_blocks
  FOR SELECT TO authenticated
  USING (blocker_id = auth.uid() OR public.is_super_admin());

-- 2. Ensure admin_access_log INSERT policy allows super admins
-- admin_id must match the caller: without this, any super admin could log an action
-- under another admin's name. (Superseded by 000006's admin_log_insert_policy, but
-- fixed here too so replaying this migration in isolation can't reopen the gap.)
DROP POLICY IF EXISTS "admin_access_log_insert_policy" ON public.admin_access_log;
CREATE POLICY "admin_access_log_insert_policy" ON public.admin_access_log
  FOR INSERT TO authenticated
  WITH CHECK (public.is_super_admin() AND admin_id = auth.uid());

-- 3. Robust log_admin_action RPC
CREATE OR REPLACE FUNCTION public.log_admin_action(
  p_action_type TEXT,
  p_target_user_id UUID DEFAULT NULL,
  p_target_resource_id TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS UUID AS $$
DECLARE
  v_log_id UUID;
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Access Denied: Only Super Admins can log moderation events.' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.admin_access_log (
    admin_id, action_type, target_user_id, target_resource_id, metadata, created_at
  )
  VALUES (
    auth.uid(), p_action_type, p_target_user_id, p_target_resource_id, coalesce(p_metadata, '{}'::jsonb), NOW()
  )
  RETURNING id INTO v_log_id;

  RETURN v_log_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.log_admin_action(TEXT, UUID, TEXT, JSONB) TO authenticated;

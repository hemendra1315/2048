-- =============================================================================
-- Migration: 20260928000003_admin_delete_message_rpc.sql
-- admin_edit_message already used this atomic pattern; message deletion was
-- still a raw client-side delete followed by a SEPARATE logAdminAction() call
-- -- a super admin (or anyone with a valid super-admin JWT hitting the REST
-- API directly, bypassing the app's UI) could permanently delete message
-- evidence with zero audit trail, since nothing server-side forced the log
-- write. Matches the atomic pattern used by every other admin_* RPC.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.admin_delete_message(p_message_id UUID)
RETURNS VOID
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

  DELETE FROM public.messages WHERE id = p_message_id RETURNING * INTO v_row;
  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'Message not found' USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.admin_access_log (admin_id, action_type, target_user_id, target_resource_id, metadata)
  VALUES (auth.uid(), 'DELETE_MESSAGE', v_row.sender_id, v_row.id::TEXT,
          jsonb_build_object('conversation_id', v_row.conversation_id));
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_delete_message(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_delete_message(UUID) TO authenticated;

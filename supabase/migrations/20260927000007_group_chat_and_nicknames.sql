-- =============================================================================
-- Migration: 20260927000007_group_chat_and_nicknames.sql
-- First-class Group Chat support, Group Avatars, Member Management (Roles/Invites/Kicks),
-- Leave & Delete Group flows, and Instagram-style Nicknames on conversation_members.
-- =============================================================================

-- 1. Extend conversations table for Groups
ALTER TABLE public.conversations 
  ALTER COLUMN user_a DROP NOT NULL,
  ALTER COLUMN user_b DROP NOT NULL;

-- Remove old 1-to-1 CHECK constraint if present and replace with group-aware constraint
ALTER TABLE public.conversations DROP CONSTRAINT IF EXISTS conv_ordered_pair;
ALTER TABLE public.conversations DROP CONSTRAINT IF EXISTS unique_conversation_pair;

ALTER TABLE public.conversations 
  ADD COLUMN IF NOT EXISTS is_group BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS name TEXT,
  ADD COLUMN IF NOT EXISTS group_avatar_url TEXT,
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

-- Add check: 1-to-1 chats must have user_a < user_b; group chats must have name
ALTER TABLE public.conversations 
  ADD CONSTRAINT conv_valid_type CHECK (
    (is_group = FALSE AND user_a IS NOT NULL AND user_b IS NOT NULL AND user_a < user_b) OR
    (is_group = TRUE AND (name IS NOT NULL OR user_a IS NULL))
  );

-- 2. Extend conversation_members table for Roles and Nicknames
ALTER TABLE public.conversation_members
  ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member')),
  ADD COLUMN IF NOT EXISTS nickname TEXT;

-- Index for fast member lookup
CREATE INDEX IF NOT EXISTS idx_conversation_members_lookup 
  ON public.conversation_members(conversation_id, user_id);

-- -----------------------------------------------------------------------------
-- RPC: create_group_chat
-- Creates a group conversation and adds all initial members with creator as 'owner'
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_group_chat(
    p_name TEXT,
    p_member_ids UUID[],
    p_avatar_url TEXT DEFAULT NULL,
    p_description TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_uid UUID := auth.uid();
    v_conv_id UUID;
    v_member_id UUID;
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
    END IF;

    IF trim(p_name) IS NULL OR length(trim(p_name)) = 0 THEN
        RAISE EXCEPTION 'group name cannot be empty' USING ERRCODE = '22023';
    END IF;

    -- Create group conversation
    INSERT INTO public.conversations (
        is_group,
        name,
        group_avatar_url,
        description,
        created_by,
        user_a,
        user_b
    ) VALUES (
        TRUE,
        trim(p_name),
        p_avatar_url,
        p_description,
        v_uid,
        NULL,
        NULL
    ) RETURNING id INTO v_conv_id;

    -- Insert creator as owner
    INSERT INTO public.conversation_members (
        conversation_id,
        user_id,
        role,
        last_read_at
    ) VALUES (
        v_conv_id,
        v_uid,
        'owner',
        now()
    );

    -- Insert other initial members as 'member'
    IF p_member_ids IS NOT NULL THEN
        FOREACH v_member_id IN ARRAY p_member_ids
        LOOP
            IF v_member_id <> v_uid THEN
                INSERT INTO public.conversation_members (
                    conversation_id,
                    user_id,
                    role,
                    last_read_at
                ) VALUES (
                    v_conv_id,
                    v_member_id,
                    'member',
                    now()
                ) ON CONFLICT (conversation_id, user_id) DO NOTHING;
            END IF;
        END LOOP;
    END IF;

    -- Insert system message for group creation
    INSERT INTO public.messages (
        conversation_id,
        sender_id,
        content
    ) VALUES (
        v_conv_id,
        v_uid,
        '[SYSTEM:GROUP_CREATED]'
    );

    RETURN v_conv_id;
END;
$$;

-- -----------------------------------------------------------------------------
-- RPC: update_group_info
-- Updates group name, avatar, and description (Admin or Owner only)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_group_info(
    p_conversation_id UUID,
    p_name TEXT DEFAULT NULL,
    p_avatar_url TEXT DEFAULT NULL,
    p_description TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_uid UUID := auth.uid();
    v_role TEXT;
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
    END IF;

    SELECT role INTO v_role
      FROM public.conversation_members
     WHERE conversation_id = p_conversation_id AND user_id = v_uid;

    IF v_role IS NULL THEN
        RAISE EXCEPTION 'not a member of this conversation' USING ERRCODE = '42501';
    END IF;

    IF v_role NOT IN ('owner', 'admin') THEN
        RAISE EXCEPTION 'only group admins or owners can update group info' USING ERRCODE = '42501';
    END IF;

    UPDATE public.conversations
       SET name = coalesce(trim(p_name), name),
           group_avatar_url = coalesce(p_avatar_url, group_avatar_url),
           description = coalesce(p_description, description),
           updated_at = now()
     WHERE id = p_conversation_id AND is_group = TRUE;
END;
$$;

-- -----------------------------------------------------------------------------
-- RPC: add_group_members
-- Adds new members to an existing group chat
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.add_group_members(
    p_conversation_id UUID,
    p_user_ids UUID[]
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_uid UUID := auth.uid();
    v_role TEXT;
    v_new_uid UUID;
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
    END IF;

    SELECT role INTO v_role
      FROM public.conversation_members
     WHERE conversation_id = p_conversation_id AND user_id = v_uid;

    IF v_role IS NULL THEN
        RAISE EXCEPTION 'not a member of this conversation' USING ERRCODE = '42501';
    END IF;

    IF p_user_ids IS NOT NULL THEN
        FOREACH v_new_uid IN ARRAY p_user_ids
        LOOP
            INSERT INTO public.conversation_members (
                conversation_id,
                user_id,
                role,
                last_read_at
            ) VALUES (
                p_conversation_id,
                v_new_uid,
                'member',
                now()
            ) ON CONFLICT (conversation_id, user_id) DO NOTHING;
        END LOOP;
    END IF;

    UPDATE public.conversations
       SET updated_at = now()
     WHERE id = p_conversation_id;
END;
$$;

-- -----------------------------------------------------------------------------
-- RPC: remove_group_member
-- Removes a member from group (Owner/Admin or self-leave)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.remove_group_member(
    p_conversation_id UUID,
    p_user_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_uid UUID := auth.uid();
    v_caller_role TEXT;
    v_target_role TEXT;
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
    END IF;

    SELECT role INTO v_caller_role
      FROM public.conversation_members
     WHERE conversation_id = p_conversation_id AND user_id = v_uid;

    IF v_caller_role IS NULL THEN
        RAISE EXCEPTION 'not a member of this conversation' USING ERRCODE = '42501';
    END IF;

    SELECT role INTO v_target_role
      FROM public.conversation_members
     WHERE conversation_id = p_conversation_id AND user_id = p_user_id;

    IF v_target_role IS NULL THEN
        RETURN;
    END IF;

    -- Self-removal is always allowed
    IF v_uid <> p_user_id THEN
        IF v_caller_role NOT IN ('owner', 'admin') THEN
            RAISE EXCEPTION 'permission denied: only admins can remove members' USING ERRCODE = '42501';
        END IF;

        IF v_target_role = 'owner' THEN
            RAISE EXCEPTION 'cannot remove the group owner' USING ERRCODE = '42501';
        END IF;

        IF v_caller_role = 'admin' AND v_target_role = 'admin' THEN
            RAISE EXCEPTION 'admins cannot remove other admins' USING ERRCODE = '42501';
        END IF;
    END IF;

    DELETE FROM public.conversation_members
     WHERE conversation_id = p_conversation_id AND user_id = p_user_id;

    UPDATE public.conversations
       SET updated_at = now()
     WHERE id = p_conversation_id;
END;
$$;

-- -----------------------------------------------------------------------------
-- RPC: set_group_member_role
-- Promotes or demotes an admin (Owner only)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_group_member_role(
    p_conversation_id UUID,
    p_user_id UUID,
    p_role TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_uid UUID := auth.uid();
    v_caller_role TEXT;
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
    END IF;

    IF p_role NOT IN ('admin', 'member') THEN
        RAISE EXCEPTION 'invalid role' USING ERRCODE = '22023';
    END IF;

    SELECT role INTO v_caller_role
      FROM public.conversation_members
     WHERE conversation_id = p_conversation_id AND user_id = v_uid;

    IF v_caller_role <> 'owner' THEN
        RAISE EXCEPTION 'only the group owner can promote or demote roles' USING ERRCODE = '42501';
    END IF;

    UPDATE public.conversation_members
       SET role = p_role
     WHERE conversation_id = p_conversation_id AND user_id = p_user_id AND role <> 'owner';
END;
$$;

-- -----------------------------------------------------------------------------
-- RPC: leave_group_chat
-- Caller leaves the group. If caller was the owner, ownership transfers to next admin/member.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.leave_group_chat(p_conversation_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_uid UUID := auth.uid();
    v_caller_role TEXT;
    v_next_owner UUID;
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
    END IF;

    SELECT role INTO v_caller_role
      FROM public.conversation_members
     WHERE conversation_id = p_conversation_id AND user_id = v_uid;

    IF v_caller_role IS NULL THEN
        RAISE EXCEPTION 'not a member of this conversation' USING ERRCODE = '42501';
    END IF;

    -- If owner is leaving, transfer ownership to the oldest admin or member
    IF v_caller_role = 'owner' THEN
        SELECT user_id INTO v_next_owner
          FROM public.conversation_members
         WHERE conversation_id = p_conversation_id AND user_id <> v_uid
         ORDER BY (role = 'admin') DESC, created_at ASC
         LIMIT 1;

        IF v_next_owner IS NOT NULL THEN
            UPDATE public.conversation_members
               SET role = 'owner'
             WHERE conversation_id = p_conversation_id AND user_id = v_next_owner;
        END IF;
    END IF;

    DELETE FROM public.conversation_members
     WHERE conversation_id = p_conversation_id AND user_id = v_uid;

    -- If group has 0 remaining members, delete conversation
    IF NOT EXISTS (SELECT 1 FROM public.conversation_members WHERE conversation_id = p_conversation_id) THEN
        DELETE FROM public.conversations WHERE id = p_conversation_id;
    ELSE
        UPDATE public.conversations SET updated_at = now() WHERE id = p_conversation_id;
    END IF;
END;
$$;

-- -----------------------------------------------------------------------------
-- RPC: delete_group_chat
-- Permanently deletes a group conversation (Owner or Admin only)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.delete_group_chat(p_conversation_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_uid UUID := auth.uid();
    v_role TEXT;
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
    END IF;

    SELECT role INTO v_role
      FROM public.conversation_members
     WHERE conversation_id = p_conversation_id AND user_id = v_uid;

    IF v_role NOT IN ('owner', 'admin') THEN
        RAISE EXCEPTION 'only group admins or owners can delete the group' USING ERRCODE = '42501';
    END IF;

    -- Delete all related messages, shared vault items, members, and conversation
    DELETE FROM public.shared_vault_items WHERE conversation_id = p_conversation_id;
    DELETE FROM public.messages WHERE conversation_id = p_conversation_id;
    DELETE FROM public.conversation_members WHERE conversation_id = p_conversation_id;
    DELETE FROM public.conversations WHERE id = p_conversation_id;
END;
$$;

-- -----------------------------------------------------------------------------
-- RPC: set_member_nickname
-- Sets a custom nickname for a member in a conversation (Instagram-style)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_member_nickname(
    p_conversation_id UUID,
    p_target_user_id UUID,
    p_nickname TEXT
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

    IF NOT EXISTS (SELECT 1 FROM public.conversation_members
                    WHERE conversation_id = p_conversation_id AND user_id = v_uid) THEN
        RAISE EXCEPTION 'not a member of this conversation' USING ERRCODE = '42501';
    END IF;

    UPDATE public.conversation_members
       SET nickname = CASE WHEN trim(p_nickname) = '' THEN NULL ELSE trim(p_nickname) END
     WHERE conversation_id = p_conversation_id AND user_id = p_target_user_id;
END;
$$;

-- -----------------------------------------------------------------------------
-- Update get_chat_list() to return groups with full metadata
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.get_chat_list();
CREATE FUNCTION public.get_chat_list()
RETURNS TABLE (
    conversation_id UUID,
    partner_id UUID,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ,
    last_message_id UUID,
    last_message_content TEXT,
    last_message_sender_id UUID,
    last_message_at TIMESTAMPTZ,
    last_message_is_read BOOLEAN,
    unread_count BIGINT,
    pinned_at TIMESTAMPTZ,
    muted_at TIMESTAMPTZ,
    disappear_after_seconds INT,
    is_group BOOLEAN,
    group_name TEXT,
    group_avatar_url TEXT,
    group_description TEXT,
    member_count BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_uid UUID := auth.uid();
BEGIN
    IF v_uid IS NULL THEN
        RETURN;
    END IF;

    RETURN QUERY
    SELECT c.id AS conversation_id,
           CASE
             WHEN c.is_group THEN c.created_by
             ELSE CASE WHEN c.user_a = v_uid THEN c.user_b ELSE c.user_a END
           END AS partner_id,
           c.created_at,
           coalesce(lm.created_at, c.updated_at) AS updated_at,
           lm.id AS last_message_id,
           lm.content AS last_message_content,
           lm.sender_id AS last_message_sender_id,
           lm.created_at AS last_message_at,
           CASE
             WHEN lm.id IS NULL THEN TRUE
             WHEN lm.sender_id = v_uid THEN TRUE
             WHEN cm.last_read_at IS NOT NULL AND cm.last_read_at >= lm.created_at THEN TRUE
             ELSE FALSE
           END AS last_message_is_read,
           coalesce(u.cnt, 0) AS unread_count,
           cm.pinned_at,
           cm.muted_at,
           c.disappear_after_seconds,
           coalesce(c.is_group, FALSE) AS is_group,
           c.name AS group_name,
           c.group_avatar_url,
           c.description AS group_description,
           (SELECT count(*)::BIGINT FROM public.conversation_members cm_cnt WHERE cm_cnt.conversation_id = c.id) AS member_count
      FROM public.conversations c
      JOIN public.conversation_members cm
        ON cm.conversation_id = c.id AND cm.user_id = v_uid
      LEFT JOIN LATERAL (
          SELECT m.id, m.content, m.sender_id, m.created_at
            FROM public.messages m
           WHERE m.conversation_id = c.id
             AND m.deleted_at IS NULL
             AND m.content NOT LIKE '[SYSTEM:%'
             AND (m.expires_at IS NULL OR m.expires_at > now())
           ORDER BY m.created_at DESC
           LIMIT 1
      ) lm ON TRUE
      LEFT JOIN LATERAL (
          SELECT count(*)::BIGINT AS cnt
            FROM public.messages m
           WHERE m.conversation_id = c.id
             AND m.sender_id <> v_uid
             AND m.deleted_at IS NULL
             AND m.content NOT LIKE '[SYSTEM:%'
             AND (m.expires_at IS NULL OR m.expires_at > now())
             AND (cm.last_read_at IS NULL OR m.created_at > cm.last_read_at)
      ) u ON TRUE
     WHERE (cm.hidden_at IS NULL OR lm.created_at > cm.hidden_at)
     ORDER BY cm.pinned_at IS NULL, cm.pinned_at, coalesce(lm.created_at, c.updated_at) DESC;
END;
$$;

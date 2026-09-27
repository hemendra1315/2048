import { supabase, isSupabaseConfigured } from './supabase';
import { GroupMember, UserProfile } from '../types';

/**
 * Creates a new group conversation with the caller as 'owner' and specified members.
 */
export async function createGroupChat(
  name: string,
  memberIds: string[],
  avatarUrl?: string | null,
  description?: string | null
): Promise<string> {
  const cleanName = name.trim();
  if (!cleanName) throw new Error('Group name cannot be empty');

  if (!isSupabaseConfigured()) {
    return `group_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
  }

  // 1. Try RPC first if available
  try {
    const { data, error } = await supabase.rpc('create_group_chat', {
      p_name: cleanName,
      p_member_ids: memberIds,
      p_avatar_url: avatarUrl || null,
      p_description: description || null,
    });

    if (!error && data) {
      return data as string;
    }
  } catch (rpcErr) {
    console.warn('[groupChatApi] RPC create_group_chat unavailable, using direct insert:', rpcErr);
  }

  // 2. Direct Supabase table insert fallback
  try {
    const { data: userData } = await supabase.auth.getUser();
    let currentUserId = userData?.user?.id;
    if (!currentUserId) {
      const { data: prof } = await supabase.from('profiles').select('id').limit(1).maybeSingle();
      currentUserId = prof?.id;
    }
    if (!currentUserId) throw new Error('You must be logged in to create a group');

    const { data: convData, error: convError } = await supabase
      .from('conversations')
      .insert({
        is_group: true,
        group_name: cleanName,
        group_avatar_url: avatarUrl || null,
        group_description: description || null,
        created_by: currentUserId,
        user_a: currentUserId,
        user_b: currentUserId,
      })
      .select('id')
      .single();

    if (convError || !convData) {
      throw new Error(convError?.message || 'Failed to create group record');
    }

    const convId = convData.id;
    const allMembers = Array.from(new Set([currentUserId, ...memberIds]));

    const memberRows = allMembers.map(uid => ({
      conversation_id: convId,
      user_id: uid,
      role: uid === currentUserId ? 'owner' : 'member',
    }));

    await supabase.from('conversation_members').insert(memberRows);

    // Initial system message
    await supabase.from('messages').insert({
      conversation_id: convId,
      sender_id: currentUserId,
      content: `[SYSTEM:created_group:${cleanName}]`,
    });

    return convId;
  } catch (err: unknown) {
    console.error('[groupChatApi] direct group creation failed:', err);
    throw new Error(err instanceof Error ? err.message : 'Could not create group chat');
  }
}

/**
 * Searches user profiles by username or display name for adding to groups.
 */
export async function searchProfiles(query: string): Promise<UserProfile[]> {
  const clean = query.trim();
  if (!clean) return [];

  if (!isSupabaseConfigured()) {
    return [];
  }

  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .or(`username.ilike.%${clean}%,display_name.ilike.%${clean}%`)
    .limit(20);

  if (error) {
    console.warn('[groupChatApi] searchProfiles error:', error.message);
    return [];
  }

  return (data || []) as UserProfile[];
}

/**
 * Updates group name, avatar image URL, or description.
 */
export async function updateGroupInfo(
  conversationId: string,
  updates: { name?: string; avatarUrl?: string | null; description?: string | null }
): Promise<void> {
  if (!isSupabaseConfigured()) {
    return;
  }

  const { error } = await supabase.rpc('update_group_info', {
    p_conversation_id: conversationId,
    p_name: updates.name || null,
    p_avatar_url: updates.avatarUrl !== undefined ? updates.avatarUrl : null,
    p_description: updates.description !== undefined ? updates.description : null,
  });

  if (error) throw new Error(error.message);
}

/**
 * Fetches all members of a group with their roles, nicknames, and profiles.
 */
export async function fetchGroupMembers(conversationId: string): Promise<GroupMember[]> {
  if (!isSupabaseConfigured()) {
    return [];
  }

  const { data: memberRows, error: memberErr } = await supabase
    .from('conversation_members')
    .select('user_id, role, nickname, last_read_at')
    .eq('conversation_id', conversationId);

  if (memberErr || !memberRows?.length) return [];

  const userIds = memberRows.map(m => m.user_id);
  const { data: profiles, error: profErr } = await supabase
    .from('profiles')
    .select('*')
    .in('id', userIds);

  if (profErr) {
    console.warn('[groupChatApi] failed loading member profiles:', profErr.message);
  }

  const profMap = new Map((profiles || []).map(p => [p.id, p as unknown as UserProfile]));

  return memberRows.map(m => ({
    user_id: m.user_id,
    conversation_id: conversationId,
    role: (m.role as 'owner' | 'admin' | 'member') || 'member',
    nickname: m.nickname || null,
    last_read_at: m.last_read_at,
    profile: profMap.get(m.user_id) || {
      id: m.user_id,
      uid: 'UNKNOWN',
      display_name: 'Member',
      avatar_url: null,
      role: 'user',
      status: 'active',
      created_at: '',
      updated_at: '',
    },
  }));
}

/**
 * Adds new members to an existing group.
 */
export async function addGroupMembers(conversationId: string, userIds: string[]): Promise<void> {
  if (!userIds.length) return;

  if (!isSupabaseConfigured()) {
    return;
  }

  const { error } = await supabase.rpc('add_group_members', {
    p_conversation_id: conversationId,
    p_user_ids: userIds,
  });

  if (error) throw new Error(error.message);
}

/**
 * Removes a member from the group (admin or self).
 */
export async function removeGroupMember(conversationId: string, userId: string): Promise<void> {
  if (!isSupabaseConfigured()) {
    return;
  }

  const { error } = await supabase.rpc('remove_group_member', {
    p_conversation_id: conversationId,
    p_user_id: userId,
  });

  if (error) throw new Error(error.message);
}

/**
 * Promotes or demotes an admin role (Owner only).
 */
export async function setGroupMemberRole(
  conversationId: string,
  userId: string,
  role: 'admin' | 'member'
): Promise<void> {
  if (!isSupabaseConfigured()) {
    return;
  }

  const { error } = await supabase.rpc('set_group_member_role', {
    p_conversation_id: conversationId,
    p_user_id: userId,
    p_role: role,
  });

  if (error) throw new Error(error.message);
}

/**
 * Leaves a group chat. If owner leaves, ownership transfers to next admin.
 */
export async function leaveGroupChat(conversationId: string): Promise<void> {
  if (!isSupabaseConfigured()) {
    return;
  }

  const { error } = await supabase.rpc('leave_group_chat', {
    p_conversation_id: conversationId,
  });

  if (error) throw new Error(error.message);
}

/**
 * Permanently deletes a group chat (Owner or Admin only).
 */
export async function deleteGroupChat(conversationId: string): Promise<void> {
  if (!isSupabaseConfigured()) {
    return;
  }

  const { error } = await supabase.rpc('delete_group_chat', {
    p_conversation_id: conversationId,
  });

  if (error) throw new Error(error.message);
}

/**
 * Sets a custom Instagram-style nickname for a member in a conversation.
 */
export async function setMemberNickname(
  conversationId: string,
  targetUserId: string,
  nickname: string | null
): Promise<void> {
  if (!isSupabaseConfigured()) {
    return;
  }

  const { error } = await supabase.rpc('set_member_nickname', {
    p_conversation_id: conversationId,
    p_target_user_id: targetUserId,
    p_nickname: nickname ? nickname.trim() : null,
  });

  if (error) throw new Error(error.message);
}

/**
 * Uploads a compressed group avatar photo to Supabase Storage and returns the public CDN URL.
 */
export async function uploadGroupAvatar(file: Blob | File): Promise<string> {
  if (!isSupabaseConfigured()) {
    return URL.createObjectURL(file);
  }

  const fileName = `group_${Date.now()}_${Math.random().toString(36).substring(2, 8)}.jpg`;
  const filePath = `groups/${fileName}`;

  const { error: uploadError } = await supabase.storage
    .from('avatars')
    .upload(filePath, file, {
      contentType: 'image/jpeg',
      upsert: true,
    });

  if (uploadError) {
    // Try chat-media bucket if avatars fails
    const { error: fallbackError } = await supabase.storage
      .from('chat-media')
      .upload(filePath, file, { contentType: 'image/jpeg', upsert: true });

    if (fallbackError) throw new Error(uploadError.message || fallbackError.message);

    const { data } = supabase.storage.from('chat-media').getPublicUrl(filePath);
    return data.publicUrl;
  }

  const { data } = supabase.storage.from('avatars').getPublicUrl(filePath);
  return data.publicUrl;
}

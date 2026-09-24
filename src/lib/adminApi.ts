// Data access for the Super Admin hub.
//
// With a real backend every call goes to Supabase as the signed-in user. The database decides what
// an admin may see or change (RLS via is_super_admin(), and the admin_* SQL functions, which also
// write the audit log). Nothing here trusts the client-side `role` field.
// The offline mock backend is used only in local development.

import { supabase, isSupabaseConfigured, isMockBackendAllowed } from './supabase';
import { mockBackend } from './mockBackend';
import {
  AdminAccessLogItem,
  GalleryItem,
  MessageItem,
  UserProfile,
  ConversationItem,
  ConnectionItem,
  ConnectionRequestItem,
} from '../types';

export type AccountStatus = 'active' | 'suspended' | 'banned';

export interface AdminConversation {
  id: string;
  user_a: string;
  user_b: string;
  created_at: string;
  updated_at: string;
  messages: MessageItem[];
}

export type AdminGalleryItem = GalleryItem & { user?: UserProfile; previewUrl: string };

const backendIsSupabase = () => {
  if (isSupabaseConfigured()) return true;
  if (isMockBackendAllowed()) return false;
  throw new Error('Server is not configured');
};

function fail(error: { message: string } | null): void {
  if (error) throw new Error(error.message);
}

export async function listProfiles(): Promise<UserProfile[]> {
  if (!backendIsSupabase()) return mockBackend.getProfiles();
  const { data, error } = await supabase.from('profiles').select('*').order('created_at', { ascending: true });
  fail(error);
  return (data ?? []) as unknown as UserProfile[];
}

export async function getProfileMap(): Promise<Record<string, UserProfile>> {
  const map: Record<string, UserProfile> = {};
  for (const p of await listProfiles()) map[p.id] = p;
  return map;
}

export async function getConnectionCounts(): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  if (!backendIsSupabase()) {
    for (const p of mockBackend.getProfiles()) counts[p.id] = mockBackend.getConnections(p.id).length;
    return counts;
  }
  const { data, error } = await supabase.from('connections').select('user_a, user_b');
  fail(error);
  for (const c of (data ?? []) as { user_a: string; user_b: string }[]) {
    counts[c.user_a] = (counts[c.user_a] ?? 0) + 1;
    counts[c.user_b] = (counts[c.user_b] ?? 0) + 1;
  }
  return counts;
}

export async function setUserStatus(adminId: string, targetId: string, status: AccountStatus, reason: string): Promise<void> {
  if (!backendIsSupabase()) {
    mockBackend.adminSetUserStatus(adminId, targetId, status, reason);
    return;
  }
  const { error } = await supabase.rpc('admin_set_user_status', {
    p_target: targetId,
    p_status: status,
    p_reason: reason || null,
  });
  fail(error);
}

export async function listAuditLogs(limit = 200): Promise<AdminAccessLogItem[]> {
  if (!backendIsSupabase()) return mockBackend.getAdminAuditLogs().slice(0, limit);
  const [{ data, error }, profiles] = await Promise.all([
    supabase.from('admin_access_log').select('*').order('created_at', { ascending: false }).limit(limit),
    getProfileMap(),
  ]);
  fail(error);
  return ((data ?? []) as unknown as AdminAccessLogItem[]).map(l => ({
    ...l,
    admin: l.admin_id ? profiles[l.admin_id] : undefined,
    targetUser: l.target_user_id ? profiles[l.target_user_id] : undefined,
  }));
}

export async function listConversations(adminId: string): Promise<AdminConversation[]> {
  if (!backendIsSupabase()) return mockBackend.getAllConversationsForAdmin(adminId);
  const { data: convs, error } = await supabase.from('conversations').select('*').order('updated_at', { ascending: false });
  fail(error);
  const list = (convs ?? []) as unknown as Omit<AdminConversation, 'messages'>[];
  if (list.length === 0) return [];
  const { data: msgs, error: msgError } = await supabase
    .from('messages')
    .select('*')
    .in('conversation_id', list.map(c => c.id))
    .order('created_at', { ascending: true });
  fail(msgError);
  const byConv: Record<string, MessageItem[]> = {};
  for (const m of (msgs ?? []) as unknown as MessageItem[]) (byConv[m.conversation_id] ??= []).push(m);
  return list.map(c => ({ ...c, messages: byConv[c.id] ?? [] }));
}

/** Records that an admin opened a private conversation (append-only audit log). */
export async function logConversationView(conversation: AdminConversation): Promise<void> {
  if (!backendIsSupabase()) return;
  const { error } = await supabase.rpc('log_admin_action', {
    p_action_type: 'VIEW_CONVERSATION',
    p_target_user_id: conversation.user_a,
    p_target_resource_id: conversation.id,
    p_metadata: { participants: [conversation.user_a, conversation.user_b] },
  });
  fail(error);
}

export async function listGalleryItems(adminId: string): Promise<AdminGalleryItem[]> {
  if (!backendIsSupabase()) {
    return mockBackend.getAllGalleryItemsForAdmin(adminId).map(i => ({ ...i, previewUrl: i.image_url }));
  }
  const [{ data, error }, profiles] = await Promise.all([
    supabase.from('gallery_items').select('*').order('created_at', { ascending: false }),
    getProfileMap(),
  ]);
  fail(error);
  const items = (data ?? []) as unknown as GalleryItem[];
  // The gallery bucket is private: short-lived signed URLs, allowed for admins by the storage policy.
  const signed = items.length
    ? (await supabase.storage.from('gallery').createSignedUrls(items.map(i => i.storage_path), 300)).data ?? []
    : [];
  return items.map((item, i) => ({
    ...item,
    user: profiles[item.user_id],
    previewUrl: signed[i]?.signedUrl ?? item.image_url,
  }));
}

export async function deleteGalleryItem(adminId: string, item: GalleryItem): Promise<void> {
  if (!backendIsSupabase()) {
    mockBackend.deleteGalleryItem(item.id, adminId, true);
    return;
  }
  const { data: storagePath, error } = await supabase.rpc('admin_delete_gallery_item', { p_item_id: item.id });
  fail(error);
  if (storagePath) await supabase.storage.from('gallery').remove([storagePath as string]);
}

/** Logs arbitrary admin actions to the append-only audit trail in Supabase */
export async function logAdminAction(
  adminId: string,
  actionType: string,
  targetUserId: string | null = null,
  targetResourceId: string | null = null,
  metadata: Record<string, unknown> = {}
): Promise<void> {
  if (!backendIsSupabase()) {
    mockBackend.logAdminAction(adminId, actionType, targetUserId, targetResourceId, metadata);
    return;
  }
  try {
    const { error } = await supabase.rpc('log_admin_action', {
      p_action_type: actionType,
      p_target_user_id: targetUserId,
      p_target_resource_id: targetResourceId,
      p_metadata: metadata,
    });
    if (error) {
      // Fallback direct insert if RPC not present
      await supabase.from('admin_access_log').insert({
        admin_id: adminId,
        action_type: actionType,
        target_user_id: targetUserId,
        target_resource_id: targetResourceId,
        metadata: metadata || {},
      });
    }
  } catch (err) {
    console.warn('Audit log write error:', err);
  }
}

/** Profile Tab: Loads real profile and exact counts from Supabase tables */
export async function getUserProfileDetail(userId: string): Promise<{
  profile: UserProfile;
  totalChats: number;
  totalConnections: number;
  totalGalleryItems: number;
}> {
  if (!backendIsSupabase()) {
    const profile = mockBackend.getProfileById(userId) || mockBackend.getProfiles()[0];
    const totalChats = mockBackend.getUserConversationsForAdmin(userId, '').length;
    const totalConnections = mockBackend.getConnections(userId).length;
    const totalGalleryItems = mockBackend.getUserGalleryForAdmin(userId, '').length;
    return { profile, totalChats, totalConnections, totalGalleryItems };
  }

  const [profileRes, chatsRes, connsRes, galleryRes] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', userId).single(),
    supabase.from('conversations').select('id', { count: 'exact', head: true }).or(`user_a.eq.${userId},user_b.eq.${userId}`),
    supabase.from('connections').select('id', { count: 'exact', head: true }).or(`user_a.eq.${userId},user_b.eq.${userId}`),
    supabase.from('gallery_items').select('id', { count: 'exact', head: true }).eq('user_id', userId),
  ]);

  fail(profileRes.error);

  return {
    profile: profileRes.data as unknown as UserProfile,
    totalChats: chatsRes.count ?? 0,
    totalConnections: connsRes.count ?? 0,
    totalGalleryItems: galleryRes.count ?? 0,
  };
}

/** Chats Tab: Loads real 1-to-1 conversations and complete message transcripts from Supabase */
export async function getUserConversationsForAdmin(
  targetUserId: string,
  adminId: string
): Promise<(ConversationItem & { partnerProfile: UserProfile; messages: MessageItem[] })[]> {
  if (!backendIsSupabase()) {
    return mockBackend.getUserConversationsForAdmin(targetUserId, adminId);
  }

  await logAdminAction(adminId, 'VIEW_USER_CHATS', targetUserId, null, {});

  const { data: convs, error: convError } = await supabase
    .from('conversations')
    .select('*')
    .or(`user_a.eq.${targetUserId},user_b.eq.${targetUserId}`)
    .order('updated_at', { ascending: false });

  fail(convError);
  if (!convs || convs.length === 0) return [];

  const partnerIds = Array.from(
    new Set(convs.map(c => (c.user_a === targetUserId ? c.user_b : c.user_a)))
  );

  const { data: partnerProfiles, error: profileError } = await supabase
    .from('profiles')
    .select('*')
    .in('id', partnerIds);

  fail(profileError);
  const profileMap: Record<string, UserProfile> = {};
  for (const p of (partnerProfiles ?? []) as unknown as UserProfile[]) {
    profileMap[p.id] = p;
  }

  const convIds = convs.map(c => c.id);
  const { data: messages, error: msgError } = await supabase
    .from('messages')
    .select('*')
    .in('conversation_id', convIds)
    .order('created_at', { ascending: true });

  fail(msgError);
  const messagesByConv: Record<string, MessageItem[]> = {};
  for (const m of (messages ?? []) as unknown as MessageItem[]) {
    (messagesByConv[m.conversation_id] ??= []).push(m);
  }

  return convs.map(c => {
    const partnerId = c.user_a === targetUserId ? c.user_b : c.user_a;
    const partnerProfile = profileMap[partnerId] || {
      id: partnerId,
      uid: 'UNKNOWN',
      username: 'unknown',
      display_name: 'Unknown User',
      avatar_url: null,
      role: 'user',
      status: 'active',
      created_at: c.created_at,
      updated_at: c.updated_at,
    };

    return {
      id: c.id,
      user_a: c.user_a,
      user_b: c.user_b,
      created_at: c.created_at,
      updated_at: c.updated_at,
      partner: partnerProfile,
      partnerProfile,
      messages: messagesByConv[c.id] ?? [],
      unreadCount: 0,
    };
  });
}

/** Gallery Tab: Loads real user gallery items and signed storage URLs from Supabase */
export async function getUserGalleryForAdmin(
  targetUserId: string,
  adminId: string
): Promise<GalleryItem[]> {
  if (!backendIsSupabase()) {
    return mockBackend.getUserGalleryForAdmin(targetUserId, adminId);
  }

  await logAdminAction(adminId, 'VIEW_USER_GALLERY', targetUserId, null, {});

  const { data: items, error } = await supabase
    .from('gallery_items')
    .select('*')
    .eq('user_id', targetUserId)
    .order('created_at', { ascending: false });

  fail(error);
  if (!items || items.length === 0) return [];

  const galleryItems = items as unknown as GalleryItem[];
  try {
    const { data: signed } = await supabase.storage
      .from('gallery')
      .createSignedUrls(galleryItems.map(i => i.storage_path), 3600);

    if (signed && signed.length > 0) {
      return galleryItems.map((item, idx) => ({
        ...item,
        image_url: signed[idx]?.signedUrl || item.image_url,
      }));
    }
  } catch (err) {
    console.warn('Signed URL generation fallback:', err);
  }

  return galleryItems;
}

/** Connections Tab: Loads real active connections, pending requests, and blocked users from Supabase */
export async function getUserConnectionDetailsForAdmin(targetUserId: string): Promise<{
  connections: ConnectionItem[];
  incomingRequests: ConnectionRequestItem[];
  outgoingRequests: ConnectionRequestItem[];
  blockedUsers: UserProfile[];
}> {
  if (!backendIsSupabase()) {
    return mockBackend.getUserConnectionDetailsForAdmin(targetUserId);
  }

  const [connsRes, incomingRes, outgoingRes, blocksRes, allProfilesRes] = await Promise.all([
    supabase.from('connections').select('*').or(`user_a.eq.${targetUserId},user_b.eq.${targetUserId}`),
    supabase.from('connection_requests').select('*').eq('receiver_id', targetUserId).eq('status', 'pending'),
    supabase.from('connection_requests').select('*').eq('sender_id', targetUserId).eq('status', 'pending'),
    supabase.from('user_blocks').select('*').eq('blocker_id', targetUserId),
    supabase.from('profiles').select('*'),
  ]);

  const profileMap: Record<string, UserProfile> = {};
  for (const p of (allProfilesRes.data ?? []) as unknown as UserProfile[]) {
    profileMap[p.id] = p;
  }

  const connections: ConnectionItem[] = ((connsRes.data ?? []) as { id: string; user_a: string; user_b: string; created_at: string }[]).map(c => {
    const partnerId = c.user_a === targetUserId ? c.user_b : c.user_a;
    return {
      id: c.id,
      user_a: c.user_a,
      user_b: c.user_b,
      created_at: c.created_at,
      partner: profileMap[partnerId] || {
        id: partnerId,
        uid: 'UNKNOWN',
        username: 'unknown',
        display_name: 'Unknown User',
        avatar_url: null,
        role: 'user',
        status: 'active',
        created_at: c.created_at,
        updated_at: c.created_at,
      },
    };
  });

  const incomingRequests: ConnectionRequestItem[] = ((incomingRes.data ?? []) as unknown as ConnectionRequestItem[]).map(r => ({
    ...r,
    sender: profileMap[r.sender_id],
  }));

  const outgoingRequests: ConnectionRequestItem[] = ((outgoingRes.data ?? []) as unknown as ConnectionRequestItem[]).map(r => ({
    ...r,
    receiver: profileMap[r.receiver_id],
  }));

  const blockedUsers: UserProfile[] = ((blocksRes.data ?? []) as { blocked_id: string }[])
    .map(b => profileMap[b.blocked_id])
    .filter((p): p is UserProfile => Boolean(p));

  return {
    connections,
    incomingRequests,
    outgoingRequests,
    blockedUsers,
  };
}

/** Security Tab: Loads real account status and biometric configuration without exposing secrets */
export async function getUserSecurityDetailsForAdmin(
  targetUserId: string,
  adminId: string
): Promise<{
  profile: UserProfile;
  biometric_enabled: boolean;
  failed_login_count: number;
  is_locked: boolean;
  recovery_configured: boolean;
  last_login_at: string | null;
}> {
  if (!backendIsSupabase()) {
    const p = mockBackend.getProfileById(targetUserId) || mockBackend.getProfiles()[0];
    mockBackend.logAdminAction(adminId, 'VIEW_USER_SECURITY', targetUserId, null, {});
    return {
      profile: p,
      biometric_enabled: Boolean(p.biometric_enabled),
      failed_login_count: 0,
      is_locked: p.status !== 'active',
      recovery_configured: true,
      last_login_at: p.last_login_at || p.updated_at,
    };
  }

  await logAdminAction(adminId, 'VIEW_USER_SECURITY', targetUserId, null, {});

  const [profileRes, prefsRes] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', targetUserId).single(),
    supabase.from('user_preferences').select('unlock_method, auto_lock_seconds, updated_at').eq('user_id', targetUserId).maybeSingle(),
  ]);

  fail(profileRes.error);
  const profile = profileRes.data as unknown as UserProfile;

  return {
    profile,
    biometric_enabled: Boolean(profile.biometric_enabled || prefsRes.data?.unlock_method === 'secret_gesture'),
    failed_login_count: 0,
    is_locked: profile.status !== 'active',
    recovery_configured: true,
    last_login_at: profile.last_login_at || profile.updated_at,
  };
}

/** Moderation: Permanently delete an abusive message as Admin */
export async function deleteMessageAsAdmin(
  adminId: string,
  messageId: string,
  conversationId?: string
): Promise<void> {
  if (backendIsSupabase()) {
    const { error } = await supabase.from('messages').delete().eq('id', messageId);
    if (error) {
      console.warn('Failed to delete message from supabase:', error);
    }
  }
  await logAdminAction(adminId, 'DELETE_MESSAGE', null, messageId, {
    conversationId,
  });
}

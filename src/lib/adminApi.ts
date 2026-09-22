// Data access for the Super Admin hub.
//
// With a real backend every call goes to Supabase as the signed-in user. The database decides what
// an admin may see or change (RLS via is_super_admin(), and the admin_* SQL functions, which also
// write the audit log). Nothing here trusts the client-side `role` field.
// The offline mock backend is used only in local development.

import { supabase, isSupabaseConfigured, isMockBackendAllowed } from './supabase';
import { mockBackend } from './mockBackend';
import { AdminAccessLogItem, GalleryItem, MessageItem, UserProfile } from '../types';

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
    previewUrl: signed[i]?.signedUrl ?? '',
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

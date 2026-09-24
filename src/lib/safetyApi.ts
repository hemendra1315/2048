/**
 * Trust & Safety Moderation Store & Helper API
 * Provides unified data structures for Reports, Admin Notes, and Universal Global Search.
 * Reports and staff notes live in Supabase (user_reports, admin_user_notes); browser storage
 * is used only in local demo mode.
 */

import { UserProfile, MessageItem } from '../types';
import {
  listProfiles,
  listConversations,
  listGalleryItems,
  AdminConversation,
  AdminGalleryItem,
  logAdminAction,
} from './adminApi';
import { supabase, isSupabaseConfigured, isMockBackendAllowed } from './supabase';

export type ReportCategory = 'harassment' | 'hate_speech' | 'spam' | 'inappropriate_media' | 'impersonation' | 'underage';
export type ReportSeverity = 'urgent' | 'high' | 'medium' | 'low';
export type ReportStatus = 'pending' | 'investigating' | 'resolved' | 'dismissed';

export const REPORT_REASONS: ReportCategory[] = [
  'harassment',
  'hate_speech',
  'spam',
  'inappropriate_media',
  'impersonation',
  'underage',
];

export interface SafetyReport {
  id: string;
  category: ReportCategory;
  severity: ReportSeverity;
  status: ReportStatus;
  reportedUserId: string;
  reportedUser?: UserProfile;
  reporterId: string;
  reporter?: UserProfile;
  conversationId?: string;
  messageId?: string;
  reportedMessage?: MessageItem;
  mediaUrl?: string;
  reason: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AdminNote {
  id: string;
  userId: string;
  adminId: string;
  adminName: string;
  note: string;
  category: 'warning' | 'investigation' | 'flag' | 'general' | 'cleared';
  createdAt: string;
}

export interface UniversalSearchResult {
  users: (UserProfile & { matchField: string })[];
  messages: {
    message: MessageItem;
    conversationId: string;
    sender?: UserProfile;
    snippet: string;
  }[];
  conversations: {
    conversation: AdminConversation;
    userA?: UserProfile;
    userB?: UserProfile;
    lastMessage?: string;
  }[];
  media: {
    item: AdminGalleryItem;
    user?: UserProfile;
    conversationId?: string;
    messageId?: string;
  }[];
  reports: SafetyReport[];
}

// ---------------------------------------------------------------------------
// Storage
//   Supabase: public.user_reports / public.admin_user_notes (migration 20260924000007).
//   Local demo mode only (no Supabase configured, dev build): browser storage.
// ---------------------------------------------------------------------------
const STORAGE_KEYS = {
  SAFETY_REPORTS: 'vault_safety_reports',
  ADMIN_NOTES: 'vault_admin_internal_notes',
};

const backendIsSupabase = (): boolean => {
  if (isSupabaseConfigured()) return true;
  if (isMockBackendAllowed()) return false;
  throw new Error('Server is not configured');
};

const SEVERITY_BY_CATEGORY: Record<ReportCategory, ReportSeverity> = {
  underage: 'urgent',
  inappropriate_media: 'high',
  harassment: 'high',
  hate_speech: 'high',
  impersonation: 'medium',
  spam: 'low',
};

interface ReportRow {
  id: string;
  reporter_id: string | null;
  reported_user_id: string;
  conversation_id: string | null;
  message_id: string | null;
  message_snapshot: string | null;
  category: ReportCategory;
  severity: ReportSeverity;
  status: ReportStatus;
  reason: string;
  resolution_notes: string | null;
  created_at: string;
  updated_at: string;
}

const placeholderProfile = (id: string, label: string, at: string): UserProfile =>
  ({
    id,
    uid: 'DELETED',
    username: 'deleted',
    display_name: label,
    avatar_url: null,
    role: 'user',
    status: 'active',
    created_at: at,
    updated_at: at,
  }) as unknown as UserProfile;

/**
 * Files a report about someone the current user has a conversation with.
 * Optionally points at one of their messages (kept as evidence even if later deleted).
 */
export async function submitReport(input: {
  reportedUserId: string;
  category: ReportCategory;
  reason?: string;
  conversationId?: string;
  messageId?: string;
}): Promise<void> {
  if (!backendIsSupabase()) {
    const raw = localStorage.getItem(STORAGE_KEYS.SAFETY_REPORTS);
    const list: SafetyReport[] = raw ? JSON.parse(raw) : [];
    const now = new Date().toISOString();
    list.unshift({
      id: `rep_${Date.now()}`,
      category: input.category,
      severity: SEVERITY_BY_CATEGORY[input.category],
      status: 'pending',
      reportedUserId: input.reportedUserId,
      reporterId: 'local',
      conversationId: input.conversationId,
      messageId: input.messageId,
      reason: (input.reason ?? '').trim().slice(0, 1000),
      createdAt: now,
      updatedAt: now,
    });
    localStorage.setItem(STORAGE_KEYS.SAFETY_REPORTS, JSON.stringify(list));
    return;
  }
  const { error } = await supabase.rpc('submit_report', {
    p_reported_user_id: input.reportedUserId,
    p_category: input.category,
    p_reason: (input.reason ?? '').trim().slice(0, 1000),
    p_conversation_id: input.conversationId ?? null,
    p_message_id: input.messageId ?? null,
  });
  if (error) throw new Error(error.message);
}

export async function listSafetyReports(_adminId: string = 'admin'): Promise<SafetyReport[]> {
  const profiles = await listProfiles();
  const profileMap: Record<string, UserProfile> = {};
  for (const p of profiles) profileMap[p.id] = p;

  if (!backendIsSupabase()) {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.SAFETY_REPORTS);
      const list: SafetyReport[] = raw ? JSON.parse(raw) : [];
      return list.map(r => ({
        ...r,
        reportedUser: profileMap[r.reportedUserId] ?? placeholderProfile(r.reportedUserId, 'Unknown user', r.createdAt),
        reporter: profileMap[r.reporterId],
      }));
    } catch {
      return [];
    }
  }

  const { data, error } = await supabase
    .from('user_reports')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(500);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as unknown as ReportRow[];

  // Load only the messages that reports point at (not every conversation).
  const messageIds = rows.map(r => r.message_id).filter((id): id is string => Boolean(id));
  const messageMap: Record<string, MessageItem> = {};
  if (messageIds.length) {
    const { data: msgs } = await supabase.from('messages').select('*').in('id', messageIds);
    for (const m of (msgs ?? []) as unknown as MessageItem[]) messageMap[m.id] = m;
  }

  return rows.map(r => {
    // Live message if it still exists, otherwise the snapshot taken when it was reported.
    const reportedMessage: MessageItem | undefined = r.message_id && messageMap[r.message_id]
      ? messageMap[r.message_id]
      : r.message_snapshot
      ? {
          id: r.message_id ?? `snapshot_${r.id}`,
          conversation_id: r.conversation_id ?? '',
          sender_id: r.reported_user_id,
          content: r.message_snapshot,
          is_read: true,
          created_at: r.created_at,
        }
      : undefined;
    return {
      id: r.id,
      category: r.category,
      severity: r.severity,
      status: r.status,
      reportedUserId: r.reported_user_id,
      reportedUser: profileMap[r.reported_user_id] ?? placeholderProfile(r.reported_user_id, 'Unknown user', r.created_at),
      reporterId: r.reporter_id ?? '',
      reporter: r.reporter_id
        ? profileMap[r.reporter_id] ?? placeholderProfile(r.reporter_id, 'Unknown user', r.created_at)
        : placeholderProfile('', 'Deleted account', r.created_at),
      conversationId: r.conversation_id ?? undefined,
      messageId: r.message_id ?? undefined,
      reportedMessage,
      reason: r.reason,
      notes: r.resolution_notes ?? undefined,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    };
  });
}

export const getSafetyReports = listSafetyReports;

export async function updateSafetyReportStatus(
  adminId: string,
  reportId: string,
  status: ReportStatus,
  actionNotes?: string
): Promise<SafetyReport | undefined> {
  if (!backendIsSupabase()) {
    const raw = localStorage.getItem(STORAGE_KEYS.SAFETY_REPORTS);
    const list: SafetyReport[] = raw ? JSON.parse(raw) : [];
    const idx = list.findIndex(r => r.id === reportId);
    if (idx < 0) return undefined;
    list[idx] = { ...list[idx], status, notes: actionNotes || list[idx].notes, updatedAt: new Date().toISOString() };
    localStorage.setItem(STORAGE_KEYS.SAFETY_REPORTS, JSON.stringify(list));
    await logAdminAction(adminId, 'UPDATE_SAFETY_REPORT', list[idx].reportedUserId, reportId, { status });
    return list[idx];
  }
  // The database function checks admin rights and writes the audit log entry.
  const { error } = await supabase.rpc('admin_update_report', {
    p_report_id: reportId,
    p_status: status,
    p_notes: actionNotes ?? null,
  });
  if (error) throw new Error(error.message);
  const reports = await listSafetyReports(adminId);
  return reports.find(r => r.id === reportId);
}

interface NoteRow {
  id: string;
  user_id: string;
  admin_id: string | null;
  category: AdminNote['category'];
  note: string;
  created_at: string;
}

export async function listAdminNotes(userId: string): Promise<AdminNote[]> {
  if (!backendIsSupabase()) {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.ADMIN_NOTES);
      const allNotes: AdminNote[] = raw ? JSON.parse(raw) : [];
      return allNotes
        .filter(n => n.userId === userId)
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    } catch {
      return [];
    }
  }
  const { data, error } = await supabase
    .from('admin_user_notes')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as unknown as NoteRow[];
  const profiles = await listProfiles();
  const names: Record<string, string> = {};
  for (const p of profiles) names[p.id] = p.display_name;
  return rows.map(n => ({
    id: n.id,
    userId: n.user_id,
    adminId: n.admin_id ?? '',
    adminName: (n.admin_id && names[n.admin_id]) || 'Former admin',
    note: n.note,
    category: n.category,
    createdAt: n.created_at,
  }));
}

export const getAdminNotesForUser = listAdminNotes;

export async function addAdminNote(
  adminId: string,
  adminName: string,
  userId: string,
  note: string,
  category: AdminNote['category'] = 'general'
): Promise<AdminNote> {
  const text = note.trim().slice(0, 2000);
  if (!text) throw new Error('Note is empty');

  if (!backendIsSupabase()) {
    const newNote: AdminNote = {
      id: `note_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      userId,
      adminId,
      adminName,
      note: text,
      category,
      createdAt: new Date().toISOString(),
    };
    const raw = localStorage.getItem(STORAGE_KEYS.ADMIN_NOTES);
    const allNotes: AdminNote[] = raw ? JSON.parse(raw) : [];
    allNotes.unshift(newNote);
    localStorage.setItem(STORAGE_KEYS.ADMIN_NOTES, JSON.stringify(allNotes));
    return newNote;
  }

  const { data, error } = await supabase
    .from('admin_user_notes')
    .insert({ user_id: userId, note: text, category })
    .select('*')
    .single();
  if (error) throw new Error(error.message);
  const row = data as unknown as NoteRow;
  // Audit entry records that a note was added, not its text.
  await logAdminAction(adminId, 'ADD_ADMIN_NOTE', userId, row.id, { category });
  return {
    id: row.id,
    userId: row.user_id,
    adminId: row.admin_id ?? adminId,
    adminName,
    note: row.note,
    category: row.category,
    createdAt: row.created_at,
  };
}

export async function deleteAdminNote(noteId: string, adminId: string): Promise<void> {
  if (!backendIsSupabase()) {
    const raw = localStorage.getItem(STORAGE_KEYS.ADMIN_NOTES);
    const allNotes: AdminNote[] = raw ? JSON.parse(raw) : [];
    localStorage.setItem(STORAGE_KEYS.ADMIN_NOTES, JSON.stringify(allNotes.filter(n => n.id !== noteId)));
    return;
  }
  const { error } = await supabase.from('admin_user_notes').delete().eq('id', noteId);
  if (error) throw new Error(error.message);
  await logAdminAction(adminId, 'DELETE_ADMIN_NOTE', null, noteId, {});
}

/**
 * Universal Global Search across Users, Messages, Conversations, Media, and Reports.
 */
export async function performUniversalSearch(
  adminId: string,
  query: string
): Promise<UniversalSearchResult> {
  const q = query.trim().toLowerCase();
  if (!q) {
    return { users: [], messages: [], conversations: [], media: [], reports: [] };
  }

  const [profiles, convs, gallery, reports] = await Promise.all([
    listProfiles(),
    listConversations(adminId),
    listGalleryItems(adminId),
    listSafetyReports(adminId),
  ]);

  const profileMap: Record<string, UserProfile> = {};
  for (const p of profiles) profileMap[p.id] = p;

  // 1. Search Users
  const matchedUsers = profiles
    .filter(u => {
      return (
        u.display_name.toLowerCase().includes(q) ||
        (u.username && u.username.toLowerCase().includes(q)) ||
        u.uid.toLowerCase().includes(q) ||
        (u.role && u.role.toLowerCase().includes(q)) ||
        (u.status && u.status.toLowerCase().includes(q))
      );
    })
    .map(u => ({
      ...u,
      matchField: u.display_name.toLowerCase().includes(q)
        ? 'display_name'
        : u.uid.toLowerCase().includes(q)
        ? 'uid'
        : 'username',
    }));

  // 2. Search Messages across conversations
  const matchedMessages: UniversalSearchResult['messages'] = [];
  for (const conv of convs) {
    for (const msg of conv.messages) {
      if (msg.content && msg.content.toLowerCase().includes(q)) {
        matchedMessages.push({
          message: msg,
          conversationId: conv.id,
          sender: profileMap[msg.sender_id],
          snippet: msg.content,
        });
      }
    }
  }

  // 3. Search Conversations
  const matchedConversations: UniversalSearchResult['conversations'] = [];
  for (const conv of convs) {
    const userA = profileMap[conv.user_a];
    const userB = profileMap[conv.user_b];
    const nameA = userA?.display_name?.toLowerCase() || '';
    const nameB = userB?.display_name?.toLowerCase() || '';
    const uidA = userA?.uid?.toLowerCase() || '';
    const uidB = userB?.uid?.toLowerCase() || '';

    if (nameA.includes(q) || nameB.includes(q) || uidA.includes(q) || uidB.includes(q) || conv.id.toLowerCase().includes(q)) {
      matchedConversations.push({
        conversation: conv,
        userA,
        userB,
        lastMessage: conv.messages[conv.messages.length - 1]?.content,
      });
    }
  }

  // 4. Search Media Items
  const matchedMedia: UniversalSearchResult['media'] = [];
  for (const item of gallery) {
    const user = profileMap[item.user_id];
    const captionMatch = item.caption && item.caption.toLowerCase().includes(q);
    const userMatch = user && (user.display_name.toLowerCase().includes(q) || user.uid.toLowerCase().includes(q));

    if (captionMatch || userMatch) {
      // Gallery uploads are not chat messages, so there's no conversation to link to.
      matchedMedia.push({ item, user });
    }
  }

  // 5. Search Reports
  const matchedReports = reports.filter(r => {
    return (
      r.reason.toLowerCase().includes(q) ||
      r.category.toLowerCase().includes(q) ||
      (r.reportedUser && r.reportedUser.display_name.toLowerCase().includes(q)) ||
      (r.reporter && r.reporter.display_name.toLowerCase().includes(q))
    );
  });

  return {
    users: matchedUsers.slice(0, 8),
    messages: matchedMessages.slice(0, 15),
    conversations: matchedConversations.slice(0, 8),
    media: matchedMedia.slice(0, 12),
    reports: matchedReports.slice(0, 6),
  };
}

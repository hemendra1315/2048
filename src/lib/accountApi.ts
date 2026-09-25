/**
 * Self-service account data export and deletion (Settings -> Danger Zone).
 *
 * Deletion does not touch shared rows (messages, conversations, connections) that other
 * people's history depends on - see migration 20260925000007_self_service_account_deletion.sql
 * for why. It only removes data that belongs to this user alone, then scrubs the profile's
 * display identity and sets status='deleted', which the existing "status <> 'active' ends the
 * session / blocks login" enforcement in AuthContext and vault-auth already handles.
 */
import { supabase, isSupabaseConfigured } from './supabase';
import { UserProfile } from '../types';

export interface AccountDataExport {
  exportedAt: string;
  profile: UserProfile | null;
  messagesSent: unknown[];
  galleryItems: unknown[];
  connections: unknown[];
  gameScores: unknown[];
}

/** Everything this account can see about itself, assembled client-side under normal RLS. */
export async function exportMyData(userId: string): Promise<AccountDataExport> {
  if (!isSupabaseConfigured()) {
    return {
      exportedAt: new Date().toISOString(),
      profile: null,
      messagesSent: [],
      galleryItems: [],
      connections: [],
      gameScores: [],
    };
  }

  const [profileRes, messagesRes, galleryRes, connsRes, scoresRes] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', userId).single(),
    supabase.from('messages').select('*').eq('sender_id', userId),
    supabase.from('gallery_items').select('*').eq('user_id', userId),
    supabase.from('connections').select('*').or(`user_a.eq.${userId},user_b.eq.${userId}`),
    supabase.from('game_progress').select('*').eq('user_id', userId),
  ]);

  return {
    exportedAt: new Date().toISOString(),
    profile: (profileRes.data as unknown as UserProfile) ?? null,
    messagesSent: messagesRes.data ?? [],
    galleryItems: galleryRes.data ?? [],
    connections: connsRes.data ?? [],
    gameScores: scoresRes.data ?? [],
  };
}

/** Triggers a browser download of the export as a JSON file. */
export function downloadDataExport(data: AccountDataExport): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `account-data-${data.exportedAt.slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/**
 * Deletes this account. Removes gallery storage objects first (the RPC only drops the rows,
 * since SQL can't reach into Storage), then calls delete_own_account, which scrubs the profile
 * and hard-deletes the rest of this user's own data. The caller is responsible for signing out
 * afterward - this function does not touch the session.
 */
export async function deleteOwnAccount(userId: string, reason?: string): Promise<void> {
  if (!isSupabaseConfigured()) return;

  const { data: items } = await supabase.from('gallery_items').select('storage_path').eq('user_id', userId);
  const paths = ((items ?? []) as { storage_path: string }[]).map(i => i.storage_path).filter(Boolean);
  if (paths.length) {
    const { error: storageError } = await supabase.storage.from('gallery').remove(paths);
    if (storageError) console.warn('[account] could not remove all gallery files', storageError.message);
  }

  const { error } = await supabase.rpc('delete_own_account', { p_reason: reason ?? null });
  if (error) throw new Error(error.message);
}

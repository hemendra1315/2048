import { supabase, isSupabaseConfigured } from './supabase';

export interface AppUpdateNotice {
  latest_version: string;
  update_url: string;
  release_notes: string | null;
  updated_at: string;
}

/** Reads the currently published "latest version" notice, or null if none is set. */
export async function getAppUpdateNotice(): Promise<AppUpdateNotice | null> {
  if (!isSupabaseConfigured()) return null;
  const { data, error } = await supabase
    .from('app_update_notice')
    .select('latest_version, update_url, release_notes, updated_at')
    .eq('id', true)
    .maybeSingle();
  if (error) {
    console.warn('[app-update] could not load update notice:', error.message);
    return null;
  }
  return (data as AppUpdateNotice | null) ?? null;
}

/** Admin: publishes a new "latest version" notice. Super-admin only, enforced server-side. */
export async function setAppUpdateNotice(latestVersion: string, updateUrl: string, releaseNotes?: string): Promise<AppUpdateNotice> {
  const { data, error } = await supabase.rpc('admin_set_app_update', {
    p_latest_version: latestVersion,
    p_update_url: updateUrl,
    p_release_notes: releaseNotes || null,
  });
  if (error) throw error;
  return data as AppUpdateNotice;
}

/**
 * Admin: pushes an "Update Available" notification to every device with a stored FCM
 * token, for whatever version is currently published. Super-admin only, enforced
 * server-side by the Edge Function itself (checks is_super_admin() with the caller's
 * own session, independent of anything the client claims).
 */
export async function notifyUsersOfUpdate(): Promise<{ sent: number; failed: number; pruned: number }> {
  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData.session?.access_token;
  if (!accessToken) throw new Error('Not signed in');

  const { data, error } = await supabase.functions.invoke<{ sent: number; failed: number; pruned: number; error?: string }>(
    'send-update-notification',
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data as { sent: number; failed: number; pruned: number };
}

/**
 * Compares two dotted version strings (e.g. "1.2" vs "1.10", "1.0.0" vs "1.0.1").
 * Returns true if `latest` is newer than `current`. Non-numeric segments and
 * missing segments are treated as 0, so "1.2" and "1.2.0" compare as equal.
 */
export function isVersionNewer(latest: string, current: string): boolean {
  const toParts = (v: string) => v.trim().replace(/^v/i, '').split('.').map(s => parseInt(s, 10) || 0);
  const a = toParts(latest);
  const b = toParts(current);
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    if (x > y) return true;
    if (x < y) return false;
  }
  return false;
}

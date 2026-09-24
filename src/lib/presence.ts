/**
 * Online / last seen.
 *   - While the app is open and visible it sends a heartbeat every 30 s; going to the
 *     background marks you offline. Nothing is sent when you've hidden your status.
 *   - get_presence() on the server only returns people you have a chat with, and only if
 *     both of you share your status (like WhatsApp).
 */
import { useEffect, useState } from 'react';
import { supabase, isSupabaseConfigured } from './supabase';

export interface PresenceInfo {
  isOnline: boolean;
  lastSeenAt: string | null;
}

const HEARTBEAT_MS = 30_000;
let sharing: boolean | null = null;
const sharingListeners = new Set<(v: boolean) => void>();

/** Whether you currently share your online status (default: yes). */
export async function getPresenceSharing(): Promise<boolean> {
  if (sharing !== null) return sharing;
  if (!isSupabaseConfigured()) return true;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return true;
  const { data } = await supabase.from('user_presence').select('share_presence').eq('user_id', user.id).maybeSingle();
  sharing = (data as { share_presence?: boolean } | null)?.share_presence ?? true;
  return sharing;
}

export async function setPresenceSharing(share: boolean): Promise<void> {
  const { error } = await supabase.rpc('set_presence_sharing', { p_share: share });
  if (error) throw new Error(error.message);
  sharing = share;
  if (share) void supabase.rpc('presence_heartbeat');
  else void supabase.rpc('presence_offline');
  sharingListeners.forEach(l => l(share));
}

/** Keeps your status fresh while the app is open. Mount once for a signed-in user. */
export function usePresenceHeartbeat(userId: string | undefined): void {
  useEffect(() => {
    if (!userId || !isSupabaseConfigured()) return;
    let active = true;

    const beat = async () => {
      if (!active || document.visibilityState !== 'visible') return;
      if (!(await getPresenceSharing())) return;
      void supabase.rpc('presence_heartbeat');
    };
    const offline = () => {
      if (sharing === false) return;
      void supabase.rpc('presence_offline');
    };
    const onVisibility = () => {
      if (document.visibilityState === 'visible') void beat();
      else offline();
    };

    void beat();
    const timer = setInterval(() => void beat(), HEARTBEAT_MS);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', offline);
    return () => {
      active = false;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', offline);
      offline();
      sharing = null;
    };
  }, [userId]);
}

/** Presence for a set of people, refreshed every 30 s. Empty if you or they hide it. */
export function usePresence(userIds: string[]): Record<string, PresenceInfo> {
  const [map, setMap] = useState<Record<string, PresenceInfo>>({});
  const key = [...new Set(userIds)].sort().join(',');

  useEffect(() => {
    if (!key || !isSupabaseConfigured()) {
      setMap({});
      return;
    }
    const ids = key.split(',');
    let cancelled = false;
    const load = async () => {
      const { data, error } = await supabase.rpc('get_presence', { p_user_ids: ids });
      if (cancelled || error) return;
      const next: Record<string, PresenceInfo> = {};
      for (const row of (data ?? []) as { user_id: string; is_online: boolean; last_seen_at: string | null }[]) {
        next[row.user_id] = { isOnline: row.is_online, lastSeenAt: row.last_seen_at };
      }
      setMap(next);
    };
    void load();
    const timer = setInterval(() => void load(), HEARTBEAT_MS);
    const onShare = () => void load();
    sharingListeners.add(onShare);
    return () => {
      cancelled = true;
      clearInterval(timer);
      sharingListeners.delete(onShare);
    };
  }, [key]);

  return map;
}

/** "online", "last seen just now", "last seen 5 min ago", "last seen today at 14:03", ... */
export function describePresence(p: PresenceInfo | undefined): string | null {
  if (!p) return null;
  if (p.isOnline) return 'online';
  if (!p.lastSeenAt) return null;
  const seen = new Date(p.lastSeenAt);
  const mins = Math.floor((Date.now() - seen.getTime()) / 60000);
  if (mins < 1) return 'last seen just now';
  if (mins < 60) return `last seen ${mins} min ago`;
  const time = seen.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (seen.toDateString() === today.toDateString()) return `last seen today at ${time}`;
  if (seen.toDateString() === yesterday.toDateString()) return `last seen yesterday at ${time}`;
  return `last seen ${seen.toLocaleDateString([], { day: 'numeric', month: 'short' })}`;
}

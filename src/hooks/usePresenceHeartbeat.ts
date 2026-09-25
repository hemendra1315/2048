import { useEffect } from 'react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';

const HEARTBEAT_INTERVAL_MS = 25_000;

/**
 * Keeps the signed-in user's presence row fresh while the app is open, and marks them offline
 * on the way out. get_presence() treats a heartbeat older than 75s as offline, so this interval
 * has comfortable margin against a missed beat or a slow tab.
 */
export function usePresenceHeartbeat(active: boolean): void {
  useEffect(() => {
    if (!active || !isSupabaseConfigured()) return;

    supabase.rpc('presence_heartbeat').then(({ error }) => {
      if (error) console.warn('Presence heartbeat failed:', error);
    });
    const interval = setInterval(() => {
      supabase.rpc('presence_heartbeat').then(({ error }) => {
        if (error) console.warn('Presence heartbeat failed:', error);
      });
    }, HEARTBEAT_INTERVAL_MS);

    return () => {
      clearInterval(interval);
      supabase.rpc('presence_offline').then(({ error }) => {
        if (error) console.warn('Presence offline signal failed:', error);
      });
    };
  }, [active]);
}

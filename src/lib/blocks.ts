/**
 * Blocking. Rows live in public.user_blocks (you can only see and change your own).
 * The server refuses messages, reactions, game moves, timer changes and presence between
 * two people when either has blocked the other (migration 20260924000013).
 */
import { supabase, isSupabaseConfigured } from './supabase';
import { mockBackend } from './mockBackend';
import { UserProfile } from '../types';

export interface BlockStatus {
  /** You blocked them. */
  iBlocked: boolean;
  /** Either of you blocked the other, so you can't message each other. */
  blocked: boolean;
}

export async function getBlockStatus(otherId: string): Promise<BlockStatus> {
  if (!isSupabaseConfigured()) return { iBlocked: false, blocked: false };
  const { data, error } = await supabase.rpc('get_block_status', { p_other: otherId });
  if (error || !data) return { iBlocked: false, blocked: false };
  const row = (Array.isArray(data) ? data[0] : data) as { i_blocked?: boolean; blocked_either_way?: boolean } | undefined;
  return { iBlocked: Boolean(row?.i_blocked), blocked: Boolean(row?.blocked_either_way) };
}

export async function blockUser(myId: string, otherId: string): Promise<void> {
  if (!isSupabaseConfigured()) {
    mockBackend.blockUser(myId, otherId);
    return;
  }
  const { error } = await supabase.from('user_blocks').insert({ blocker_id: myId, blocked_id: otherId } as never);
  if (error && error.code !== '23505') throw new Error(error.message);
}

export async function unblockUser(myId: string, otherId: string): Promise<void> {
  if (!isSupabaseConfigured()) {
    mockBackend.unblockUser(myId, otherId);
    return;
  }
  const { error } = await supabase.from('user_blocks').delete().eq('blocker_id', myId).eq('blocked_id', otherId);
  if (error) throw new Error(error.message);
}

/** People you've blocked, newest first. */
export async function listBlocked(myId: string): Promise<{ profile: UserProfile; blockedAt: string }[]> {
  if (!isSupabaseConfigured()) return [];
  const { data, error } = await supabase
    .from('user_blocks')
    .select('blocked_id, created_at')
    .eq('blocker_id', myId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as unknown as { blocked_id: string; created_at: string }[];
  if (!rows.length) return [];
  const { data: profiles } = await supabase.from('profiles').select('*').in('id', rows.map(r => r.blocked_id));
  const map = new Map(((profiles ?? []) as unknown as UserProfile[]).map(p => [p.id, p]));
  return rows.map(r => ({
    profile:
      map.get(r.blocked_id) ??
      ({ id: r.blocked_id, uid: '—', display_name: 'Unknown user', avatar_url: null } as unknown as UserProfile),
    blockedAt: r.created_at,
  }));
}

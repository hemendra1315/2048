import { supabase, isSupabaseConfigured } from './supabase';
import { mockBackend } from './mockBackend';

export interface ClaimResult {
  success: boolean;
  content?: string;
  reason?:
    | 'already_viewed'
    | 'max_replays_reached'
    | 'unauthorized'
    | 'not_found'
    | 'unavailable'
    | 'not_view_once'
    | 'network_error';
  opened_at?: string;
  message_id?: string;
  view_mode?: 'view_once' | 'allow_replay' | 'keep_in_chat';
  view_count?: number;
  max_views?: number;
}

/**
 * Atomically claims an ephemeral media attachment (View Once or Allow Replay) via
 * the Supabase RPC `claim_ephemeral_media`. Enforces server-authoritative view-count
 * consumption and race safety — the client can never increment its own view count.
 */
export async function claimEphemeralMedia(messageId: string, currentUserId?: string): Promise<ClaimResult> {
  if (!isSupabaseConfigured()) {
    if (currentUserId) {
      return mockBackend.claimViewOnceMedia(messageId, currentUserId) as ClaimResult;
    }
    return { success: false, reason: 'unauthorized' };
  }

  try {
    const { data, error } = await supabase.rpc('claim_ephemeral_media', {
      p_message_id: messageId,
    });

    if (error) {
      console.error('[ephemeral-media] claim RPC error:', error);
      if (error.code === '42501') return { success: false, reason: 'unauthorized' };
      return { success: false, reason: 'network_error' };
    }

    return (data as ClaimResult) || { success: false, reason: 'unavailable' };
  } catch (err) {
    console.error('[ephemeral-media] claim exception:', err);
    return { success: false, reason: 'network_error' };
  }
}

/** @deprecated Use claimEphemeralMedia — kept as an alias so any other call site keeps working. */
export const claimViewOnceMedia = claimEphemeralMedia;

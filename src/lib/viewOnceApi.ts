import { supabase, isSupabaseConfigured } from './supabase';
import { mockBackend } from './mockBackend';

export interface ClaimResult {
  success: boolean;
  content?: string;
  reason?: 'already_viewed' | 'unauthorized' | 'not_found' | 'unavailable' | 'not_view_once' | 'network_error';
  opened_at?: string;
  message_id?: string;
}

/**
 * Atomically claims a View Once media attachment via Supabase RPC `claim_view_once_media`.
 * Enforces server-authoritative single-view consumption and race safety.
 */
export async function claimViewOnceMedia(messageId: string, currentUserId?: string): Promise<ClaimResult> {
  if (!isSupabaseConfigured()) {
    if (currentUserId) {
      return mockBackend.claimViewOnceMedia(messageId, currentUserId) as ClaimResult;
    }
    return { success: false, reason: 'unauthorized' };
  }

  try {
    const { data, error } = await supabase.rpc('claim_view_once_media', {
      p_message_id: messageId,
    });

    if (error) {
      console.error('[view-once] claim RPC error:', error);
      if (error.code === '42501') return { success: false, reason: 'unauthorized' };
      return { success: false, reason: 'network_error' };
    }

    return (data as ClaimResult) || { success: false, reason: 'unavailable' };
  } catch (err) {
    console.error('[view-once] claim exception:', err);
    return { success: false, reason: 'network_error' };
  }
}

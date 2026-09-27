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
  /** A short-lived signed URL for the media, present only when success is true. */
  signedUrl?: string;
}

/**
 * Atomically claims an ephemeral media attachment (View Once or Allow Replay) AND signs
 * its storage URL, via the claim-ephemeral-media Edge Function.
 *
 * This used to be two separate client calls: claim_ephemeral_media() to consume a view,
 * then a plain supabase.storage.createSignedUrl() to load the image. The storage RLS
 * policy behind that second call only checked conversation membership -- it had no idea
 * the object belonged to a view-once message -- so any member could sign that same path
 * directly, any number of times, forever, completely bypassing the single-view guarantee.
 * The Edge Function is now the only path that can produce a signed URL for ephemeral
 * media at all (storage RLS flatly denies direct client signing for it); it only signs
 * the URL if the atomic claim itself succeeded.
 */
export async function claimEphemeralMedia(messageId: string, currentUserId?: string): Promise<ClaimResult> {
  if (!isSupabaseConfigured()) {
    if (currentUserId) {
      return mockBackend.claimViewOnceMedia(messageId, currentUserId) as ClaimResult;
    }
    return { success: false, reason: 'unauthorized' };
  }

  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData.session?.access_token;
    if (!accessToken) {
      return { success: false, reason: 'unauthorized' };
    }

    const { data, error } = await supabase.functions.invoke<ClaimResult>('claim-ephemeral-media', {
      body: { message_id: messageId },
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (error) {
      console.error('[ephemeral-media] claim function error:', error);
      return { success: false, reason: 'network_error' };
    }

    return data || { success: false, reason: 'unavailable' };
  } catch (err) {
    console.error('[ephemeral-media] claim exception:', err);
    return { success: false, reason: 'network_error' };
  }
}

/** @deprecated Use claimEphemeralMedia — kept as an alias so any other call site keeps working. */
export const claimViewOnceMedia = claimEphemeralMedia;

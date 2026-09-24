/**
 * Admin-only reads for disappearing-mode chats (see migration 20260924000012).
 *   - messages sent with the timer on (still in `messages`, visible to super admins after expiry)
 *   - disappearing_message_archive: original content of such messages that were deleted
 */
import { supabase, isSupabaseConfigured } from './supabase';
import { MessageItem } from '../types';

export interface ArchivedMessage {
  id: string;
  message_id: string;
  conversation_id: string | null;
  sender_id: string | null;
  content: string;
  sent_at: string;
  expires_at: string | null;
  deleted_at: string;
  deleted_by: string | null;
  how: 'delete_for_everyone' | 'deleted';
}

const LIMIT = 500;

export async function listDisappearingMessages(): Promise<MessageItem[]> {
  if (!isSupabaseConfigured()) return [];
  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .not('expires_at', 'is', null)
    .order('created_at', { ascending: false })
    .limit(LIMIT);
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as MessageItem[];
}

export async function listArchivedMessages(): Promise<ArchivedMessage[]> {
  if (!isSupabaseConfigured()) return [];
  const { data, error } = await supabase
    .from('disappearing_message_archive')
    .select('*')
    .order('deleted_at', { ascending: false })
    .limit(LIMIT);
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as ArchivedMessage[];
}

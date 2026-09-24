/**
 * Outbox for chat messages: a message appears in the thread the moment it's sent, and if the
 * phone is offline it waits here (in browser storage) and is delivered when the connection
 * returns. Each message carries a client_id, so a retry can never create a duplicate: the
 * database rejects a second copy (unique sender_id + client_id) and we fetch the stored one.
 */
import { supabase } from './supabase';
import { MessageItem } from '../types';

const KEY = 'chat_outbox_v1';
const MAX_ITEMS = 200;

export interface OutboxItem {
  client_id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  reply_to_id: string | null;
  created_at: string;
}

export type OutboxEvent =
  | { type: 'sent'; clientId: string; message: MessageItem }
  | { type: 'queued'; clientId: string }
  | { type: 'failed'; clientId: string; error: string };

const listeners = new Set<(e: OutboxEvent) => void>();

export function onOutboxEvent(listener: (e: OutboxEvent) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const emit = (e: OutboxEvent) => listeners.forEach(l => l(e));

function read(): OutboxItem[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as OutboxItem[]) : [];
  } catch {
    return [];
  }
}

function write(list: OutboxItem[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(-MAX_ITEMS)));
  } catch {
    // Storage full or unavailable: the message still sends if online, it just can't wait offline.
  }
}

function remove(clientId: string): void {
  write(read().filter(i => i.client_id !== clientId));
}

export function newClientId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

/** Messages still waiting to be delivered for this chat, oldest first. */
export function pendingFor(conversationId: string, senderId: string): OutboxItem[] {
  return read().filter(i => i.conversation_id === conversationId && i.sender_id === senderId);
}

export function enqueue(item: OutboxItem): void {
  const list = read().filter(i => i.client_id !== item.client_id);
  list.push(item);
  write(list);
}

/** Drops everything waiting to be sent (used on sign-out, so the next user can't send it). */
export function clearOutbox(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}

const inFlight = new Set<string>();

/** Tries to deliver one message. Keeps it queued on network problems; drops it on real errors. */
export async function deliver(item: OutboxItem): Promise<void> {
  if (inFlight.has(item.client_id)) return;
  inFlight.add(item.client_id);
  try {
    const { data, error } = await supabase
      .from('messages')
      .insert({
        conversation_id: item.conversation_id,
        sender_id: item.sender_id,
        content: item.content,
        client_id: item.client_id,
        reply_to_id: item.reply_to_id,
      } as never)
      .select('*')
      .single();

    if (!error && data) {
      remove(item.client_id);
      emit({ type: 'sent', clientId: item.client_id, message: data as unknown as MessageItem });
      return;
    }

    // Already stored by an earlier attempt whose response was lost.
    if (error?.code === '23505') {
      const { data: existing } = await supabase
        .from('messages')
        .select('*')
        .eq('sender_id', item.sender_id)
        .eq('client_id', item.client_id)
        .maybeSingle();
      if (existing) {
        remove(item.client_id);
        emit({ type: 'sent', clientId: item.client_id, message: existing as unknown as MessageItem });
        return;
      }
    }

    // No error code means the request never reached the server (offline, timeout).
    if (!error?.code || !navigator.onLine) {
      emit({ type: 'queued', clientId: item.client_id });
      return;
    }

    remove(item.client_id);
    emit({ type: 'failed', clientId: item.client_id, error: error.message });
  } catch {
    emit({ type: 'queued', clientId: item.client_id });
  } finally {
    inFlight.delete(item.client_id);
  }
}

/** Delivers everything the given user has waiting, in order. */
export async function flushOutbox(senderId: string | undefined): Promise<void> {
  if (!senderId || !navigator.onLine) return;
  for (const item of read()) {
    if (item.sender_id === senderId) await deliver(item);
  }
}

let started = false;
let currentUser: () => string | undefined = () => undefined;

/**
 * Retries queued messages when the connection comes back, and every 20 seconds as a fallback.
 * Safe to call repeatedly; the latest getter wins (so a different signed-in user is picked up).
 */
export function startOutboxSync(getUserId: () => string | undefined): void {
  currentUser = getUserId;
  if (started || typeof window === 'undefined') return;
  started = true;
  window.addEventListener('online', () => void flushOutbox(currentUser()));
  setInterval(() => void flushOutbox(currentUser()), 20000);
}

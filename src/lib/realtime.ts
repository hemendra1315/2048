// Supabase Realtime reuses an existing channel when `supabase.channel(name)` is called with a name
// that is already registered, and throws if `.on()` is then called on that already-subscribed
// channel ("cannot add `postgres_changes` callbacks ... after `subscribe()`").
// `supabase.removeChannel()` is asynchronous, so an effect that re-runs (or a second component
// instance) can hit a channel that is still registered. Giving every subscription its own name
// makes each effect run own a fresh channel, which its cleanup then removes.

function randomSuffix(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** A channel name unique to one subscription, e.g. `chat:<conversationId>:<random>`. */
export function uniqueChannelName(base: string): string {
  return `${base}:${randomSuffix()}`;
}

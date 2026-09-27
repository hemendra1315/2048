/**
 * Tracks which conversation's ChatRoom is currently mounted/visible, so the global
 * notification listener (App.tsx) can suppress a local notification for a message
 * that's already showing live in the open chat. ChatRoom itself learns about new
 * messages through its own realtime subscription; the global listener's only job is
 * every OTHER conversation.
 */
let activeConversationId: string | null = null;

/** Call when a ChatRoom mounts (or its conversationId changes). */
export function setActiveConversationId(id: string | null): void {
  activeConversationId = id;
}

/** Call when a ChatRoom unmounts, so a closed chat doesn't keep suppressing notifications. */
export function clearActiveConversationId(id: string): void {
  if (activeConversationId === id) activeConversationId = null;
}

export function getActiveConversationId(): string | null {
  return activeConversationId;
}

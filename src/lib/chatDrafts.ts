/**
 * Unsent message text per conversation, kept in memory only (never written to storage), so a
 * draft survives the app locking or switching chats. Cleared on sign-out.
 */
const drafts = new Map<string, string>();

export function getDraft(conversationId: string): string {
  return drafts.get(conversationId) ?? '';
}

export function setDraft(conversationId: string, text: string): void {
  if (text) drafts.set(conversationId, text);
  else drafts.delete(conversationId);
}

export function clearDrafts(): void {
  drafts.clear();
}

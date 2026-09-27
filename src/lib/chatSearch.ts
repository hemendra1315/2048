import { MessageItem } from '../types';
import { readableMessagePreview, parseVoiceNote } from './chatExtras';

export interface ChatSearchResult {
  message: MessageItem;
  matchType: 'text' | 'image' | 'video' | 'voice' | 'link' | 'date';
  snippet: string;
  timestamp: string;
}

/**
 * High-performance, 100% local client-side chat search.
 * Zero network requests. Indexes and searches loaded/cached message histories.
 */
export function searchConversationMessages(
  messages: MessageItem[],
  query: string,
  filterType: 'all' | 'media' | 'links' | 'voice' = 'all'
): ChatSearchResult[] {
  const cleanQuery = query.trim().toLowerCase();
  if (!cleanQuery && filterType === 'all') return [];

  const results: ChatSearchResult[] = [];

  for (const msg of messages) {
    const rawContent = msg.content || '';
    const isVoice = Boolean(parseVoiceNote(rawContent));
    const isImage = !isVoice && (rawContent.startsWith('[IMAGE') || rawContent.startsWith('data:image/'));
    const isLink = /https?:\/\/[^\s]+/.test(rawContent);
    const dateStr = new Date(msg.created_at).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });

    // Check Filter Type
    if (filterType === 'media' && !isImage) continue;
    if (filterType === 'links' && !isLink) continue;
    if (filterType === 'voice' && !isVoice) continue;

    let matchType: ChatSearchResult['matchType'] | null = null;
    let snippet = '';

    if (isVoice) {
      if (!cleanQuery || 'voice message audio note'.includes(cleanQuery) || dateStr.toLowerCase().includes(cleanQuery)) {
        matchType = 'voice';
        snippet = '🎙️ Voice Message';
      }
    } else if (isImage) {
      if (!cleanQuery || 'photo image picture video'.includes(cleanQuery) || dateStr.toLowerCase().includes(cleanQuery)) {
        matchType = 'image';
        snippet = '📷 Shared Photo';
      }
    } else if (isLink) {
      const urls = rawContent.match(/https?:\/\/[^\s]+/g) || [];
      const matchingUrl = urls.find(u => u.toLowerCase().includes(cleanQuery));
      if (matchingUrl || !cleanQuery) {
        matchType = 'link';
        snippet = matchingUrl || urls[0] || '';
      }
    }

    if (!matchType && cleanQuery) {
      const readable = readableMessagePreview(rawContent).toLowerCase();
      if (readable.includes(cleanQuery)) {
        matchType = 'text';
        snippet = readableMessagePreview(rawContent);
      } else if (dateStr.toLowerCase().includes(cleanQuery)) {
        matchType = 'date';
        snippet = readableMessagePreview(rawContent);
      }
    }

    if (matchType) {
      results.push({
        message: msg,
        matchType,
        snippet,
        timestamp: msg.created_at,
      });
    }
  }

  return results;
}

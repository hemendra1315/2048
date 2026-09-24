import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Timer, Trash2, Image as ImageIcon, MessageSquare, RefreshCw, Search, ExternalLink } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { supabase, isSupabaseConfigured } from '../../lib/supabase';
import { listProfiles, logAdminAction } from '../../lib/adminApi';
import { ArchivedMessage, listArchivedMessages, listDisappearingMessages } from '../../lib/disappearingArchiveApi';
import { parseSticker, parseVoiceNote, extraPreview } from '../../lib/chatExtras';
import { formatTimestamp } from '../../lib/utils';
import { UserProfile } from '../../types';
import type { User360Tab } from './User360View';
import { ChatImage, ChatAudio } from '../common/ChatMedia';
import { resolveChatMediaUrl } from '../../lib/mediaUrls';

type Tab = 'messages' | 'deleted' | 'photos';
type State = 'live' | 'expired' | 'deleted';

interface Entry {
  key: string;
  messageId: string;
  conversationId: string | null;
  senderId: string | null;
  content: string;
  sentAt: string;
  expiresAt: string | null;
  state: State;
  deletedAt?: string;
  how?: ArchivedMessage['how'];
}

interface DisappearingArchiveProps {
  onNavigateToConversation?: (conversationId: string, highlightMessageId?: string) => void;
  onNavigateToUser?: (userId: string, tab?: User360Tab) => void;
}

const isPhoto = (content: string) => content.startsWith('[IMAGE]');

const STATE_BADGE: Record<State, { label: string; cls: string }> = {
  live: { label: 'Timer running', cls: 'bg-emerald/15 text-emerald border-emerald/40' },
  expired: { label: 'Expired for users', cls: 'bg-vault-800 text-vault-300 border-vault-700' },
  deleted: { label: 'Deleted by sender', cls: 'bg-rose-950/60 text-rose-300 border-rose-700/50' },
};

/**
 * Disappearing-mode archive for super admins: messages and photos sent while a chat had
 * disappearing messages on, including the original content of ones the sender deleted.
 * Opening this screen is recorded in the admin audit log.
 */
export const DisappearingArchive: React.FC<DisappearingArchiveProps> = ({ onNavigateToConversation, onNavigateToUser }) => {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [tab, setTab] = useState<Tab>('messages');
  const [entries, setEntries] = useState<Entry[]>([]);
  const [profiles, setProfiles] = useState<Record<string, UserProfile>>({});
  const [participants, setParticipants] = useState<Record<string, [string, string]>>({});
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [stateFilter, setStateFilter] = useState<State | 'all'>('all');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [messages, archive, profileList] = await Promise.all([
        listDisappearingMessages(),
        listArchivedMessages(),
        listProfiles(),
      ]);
      const archiveByMessage = new Map(archive.map(a => [a.message_id, a]));
      const now = Date.now();
      const list: Entry[] = messages
        .filter(m => !m.content.startsWith('[SYSTEM:'))
        .map(m => {
          const archived = archiveByMessage.get(m.id);
          const deleted = Boolean(m.deleted_at) || m.content === '[DELETED]';
          return {
            key: m.id,
            messageId: m.id,
            conversationId: m.conversation_id,
            senderId: m.sender_id,
            content: deleted ? archived?.content ?? '(original not archived)' : m.content,
            sentAt: m.created_at,
            expiresAt: m.expires_at ?? null,
            state: deleted ? 'deleted' : m.expires_at && new Date(m.expires_at).getTime() <= now ? 'expired' : 'live',
            deletedAt: archived?.deleted_at ?? m.deleted_at ?? undefined,
            how: archived?.how,
          };
        });
      const inMessages = new Set(messages.map(m => m.id));
      for (const a of archive) {
        if (inMessages.has(a.message_id)) continue; // row removed entirely: only the archive remains
        list.push({
          key: `archive:${a.id}`,
          messageId: a.message_id,
          conversationId: a.conversation_id,
          senderId: a.sender_id,
          content: a.content,
          sentAt: a.sent_at,
          expiresAt: a.expires_at,
          state: 'deleted',
          deletedAt: a.deleted_at,
          how: a.how,
        });
      }
      list.sort((x, y) => new Date(y.sentAt).getTime() - new Date(x.sentAt).getTime());
      setEntries(list);

      const pmap: Record<string, UserProfile> = {};
      for (const p of profileList) pmap[p.id] = p;
      setProfiles(pmap);

      const convIds = [...new Set(list.map(e => e.conversationId).filter((id): id is string => Boolean(id)))];
      if (convIds.length && isSupabaseConfigured()) {
        const { data } = await supabase.from('conversations').select('id, user_a, user_b').in('id', convIds);
        const cmap: Record<string, [string, string]> = {};
        for (const c of (data ?? []) as unknown as { id: string; user_a: string; user_b: string }[]) cmap[c.id] = [c.user_a, c.user_b];
        setParticipants(cmap);
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not load the archive', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    void load();
  }, [load]);

  // Accountability: record that an admin opened this archive.
  useEffect(() => {
    if (user) void logAdminAction(user.id, 'VIEW_DISAPPEARING_ARCHIVE', null, null, {});
  }, [user]);

  const name = (id: string | null | undefined) => (id ? profiles[id]?.display_name ?? 'Deleted account' : 'Unknown');
  const recipient = (e: Entry) => {
    const pair = e.conversationId ? participants[e.conversationId] : undefined;
    return pair ? pair.find(id => id !== e.senderId) ?? null : null;
  };

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return entries.filter(e => {
      if (tab === 'photos' && !isPhoto(e.content)) return false;
      if (tab === 'messages' && isPhoto(e.content)) return false;
      if (tab === 'deleted' && e.state !== 'deleted') return false;
      if (tab !== 'deleted' && stateFilter !== 'all' && e.state !== stateFilter) return false;
      if (!q) return true;
      const r = recipient(e);
      return (
        e.content.toLowerCase().includes(q) ||
        name(e.senderId).toLowerCase().includes(q) ||
        (r ? name(r).toLowerCase().includes(q) : false)
      );
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries, tab, stateFilter, query, profiles, participants]);

  const counts = useMemo(() => ({
    messages: entries.filter(e => !isPhoto(e.content)).length,
    deleted: entries.filter(e => e.state === 'deleted').length,
    photos: entries.filter(e => isPhoto(e.content)).length,
  }), [entries]);

  const renderContent = (content: string) => {
    if (isPhoto(content)) {
      const url = content.slice('[IMAGE]'.length);
      return (
        <button
          type="button"
          onClick={() => void resolveChatMediaUrl(url).then(src => { if (src) window.open(src, '_blank', 'noopener'); })}
          className="block w-40 aspect-[4/5] rounded-lg overflow-hidden bg-black/30 p-0 border-0 cursor-zoom-in"
          aria-label="Open photo full size"
        >
          <ChatImage url={url} alt="Disappearing photo" loading="lazy" className="w-full h-full object-cover"
            fallback={<span className="text-xs text-vault-400 p-2 block">Photo unavailable</span>} />
        </button>
      );
    }
    const voice = parseVoiceNote(content);
    if (voice) {
      return (
        <div className="flex flex-col gap-1">
          <span className="text-xs text-vault-300">🎤 Voice message ({voice.duration})</span>
          <ChatAudio url={voice.url} className="h-8 max-w-[260px]" />
        </div>
      );
    }
    const sticker = parseSticker(content);
    if (sticker) return <span className="text-3xl">{sticker.art}</span>;
    const extra = extraPreview(content);
    if (extra) return <span className="text-sm text-vault-200">{extra}</span>;
    return <p className="m-0 text-sm text-white whitespace-pre-wrap break-words">{content}</p>;
  };

  const tabs: { id: Tab; label: string; icon: React.ElementType; count: number }[] = [
    { id: 'messages', label: 'Disappearing messages', icon: MessageSquare, count: counts.messages },
    { id: 'deleted', label: 'Deleted in disappearing mode', icon: Trash2, count: counts.deleted },
    { id: 'photos', label: 'Disappearing photos', icon: ImageIcon, count: counts.photos },
  ];

  return (
    <div className="space-y-4 pb-20 animate-fade-in text-vault-100">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-vault-800 pb-3">
        <div>
          <h2 className="text-base font-bold text-white flex items-center gap-2 m-0">
            <Timer className="w-5 h-5 text-emerald" aria-hidden /> Disappearing archive
          </h2>
          <p className="text-xs text-vault-400 m-0 mt-1">
            Everything sent while a chat had disappearing messages on, kept after it disappears for users. Viewing is logged.
          </p>
        </div>
        <button type="button" onClick={() => void load()} className="btn btn-s btn-sm min-h-[40px]" aria-label="Refresh">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} aria-hidden /> Refresh
        </button>
      </div>

      <div className="flex flex-wrap gap-2" role="tablist">
        {tabs.map(t => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-2 px-3 min-h-[40px] rounded-xl text-xs font-bold border ${
              tab === t.id ? 'bg-vault-800 border-vault-600 text-white' : 'bg-vault-950 border-vault-800 text-vault-400'
            }`}
          >
            <t.icon className="w-4 h-4" aria-hidden /> {t.label}
            <span className="px-1.5 rounded bg-vault-900 text-vault-300 font-mono">{t.count}</span>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2 flex-1 min-w-[200px] bg-vault-950 border border-vault-800 rounded-xl px-3 min-h-[40px]">
          <Search className="w-4 h-4 text-vault-500" aria-hidden />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search text or people"
            className="bg-transparent flex-1 text-sm text-white outline-none"
            aria-label="Search archive"
          />
        </label>
        {tab !== 'deleted' && (
          <div className="flex gap-1">
            {(['all', 'live', 'expired', 'deleted'] as const).map(f => (
              <button
                key={f}
                type="button"
                onClick={() => setStateFilter(f)}
                className={`px-2.5 min-h-[36px] rounded-lg text-xs border ${
                  stateFilter === f ? 'bg-vault-800 border-vault-600 text-white' : 'border-vault-800 text-vault-400'
                }`}
              >
                {f === 'all' ? 'All' : STATE_BADGE[f].label}
              </button>
            ))}
          </div>
        )}
      </div>

      {loading ? (
        <p className="text-xs text-vault-400">Loading…</p>
      ) : visible.length === 0 ? (
        <p className="text-xs text-vault-400">Nothing here yet.</p>
      ) : tab === 'photos' ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {visible.map(e => (
            <div key={e.key} className="rounded-xl border border-vault-800 bg-vault-900 p-2 flex flex-col gap-2">
              {renderContent(e.content)}
              <span className={`self-start px-1.5 py-0.5 rounded border text-[10px] font-bold ${STATE_BADGE[e.state].cls}`}>{STATE_BADGE[e.state].label}</span>
              <div className="text-[11px] text-vault-300">
                <button type="button" className="font-bold hover:underline" onClick={() => e.senderId && onNavigateToUser?.(e.senderId, 'media')}>{name(e.senderId)}</button>
                {' → '}{name(recipient(e))}
              </div>
              <div className="text-[10px] text-vault-500 font-mono">{formatTimestamp(e.sentAt)}</div>
              {e.conversationId && e.state !== 'deleted' && (
                <button type="button" onClick={() => onNavigateToConversation?.(e.conversationId!, e.messageId)} className="text-[11px] text-emerald flex items-center gap-1 hover:underline">
                  <ExternalLink className="w-3 h-3" aria-hidden /> Open in chat
                </button>
              )}
            </div>
          ))}
        </div>
      ) : (
        <ul className="list-none m-0 p-0 flex flex-col gap-2">
          {visible.map(e => (
            <li key={e.key} className="rounded-xl border border-vault-800 bg-vault-900 p-3 flex flex-col gap-2">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <button type="button" className="font-bold text-white hover:underline" onClick={() => e.senderId && onNavigateToUser?.(e.senderId, 'chats')}>
                  {name(e.senderId)}
                </button>
                <span className="text-vault-500">→ {name(recipient(e))}</span>
                <span className="text-vault-500 font-mono">{formatTimestamp(e.sentAt)}</span>
                <span className={`px-1.5 py-0.5 rounded border text-[10px] font-bold ${STATE_BADGE[e.state].cls}`}>{STATE_BADGE[e.state].label}</span>
              </div>
              {renderContent(e.content)}
              <div className="flex flex-wrap items-center gap-3 text-[11px] text-vault-500">
                {e.state === 'deleted' && e.deletedAt && (
                  <span>
                    {e.how === 'delete_for_everyone' ? 'Deleted for everyone' : 'Removed'} {formatTimestamp(e.deletedAt)}
                  </span>
                )}
                {e.state !== 'deleted' && e.expiresAt && (
                  <span>{e.state === 'live' ? 'Disappears' : 'Disappeared'} {formatTimestamp(e.expiresAt)}</span>
                )}
                {e.conversationId && e.state !== 'deleted' && (
                  <button type="button" onClick={() => onNavigateToConversation?.(e.conversationId!, e.messageId)} className="text-emerald flex items-center gap-1 hover:underline">
                    <ExternalLink className="w-3 h-3" aria-hidden /> Open in chat
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

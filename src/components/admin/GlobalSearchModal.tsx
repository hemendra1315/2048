import type { User360Tab } from './User360View';
import React, { useState, useEffect, useRef } from 'react';
import {
  Search,
  X,
  MessageSquare,
  ShieldAlert,
  ArrowRight,
  ChevronRight,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { performUniversalSearch, UniversalSearchResult } from '../../lib/safetyApi';
import { formatTimestamp } from '../../lib/utils';
import { Avatar } from '../common/Avatar';

interface GlobalSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectUser?: (userId: string, tab?: User360Tab) => void;
  onSelectConversation?: (conversationId: string, highlightMessageId?: string) => void;
  onSelectMedia?: (conversationId?: string, messageId?: string) => void;
  onSelectReport?: (reportId: string) => void;
  onNavigateToUser?: (userId: string, tab?: User360Tab) => void;
  onNavigateToConversation?: (conversationId: string, highlightMessageId?: string) => void;
  onNavigateToMedia?: (conversationId?: string, messageId?: string) => void;
  onNavigateToReport?: (reportId: string) => void;
}

export const GlobalSearchModal: React.FC<GlobalSearchModalProps> = ({
  isOpen,
  onClose,
  onSelectUser,
  onSelectConversation,
  onSelectMedia,
  onSelectReport,
  onNavigateToUser,
  onNavigateToConversation,
  onNavigateToMedia,
  onNavigateToReport,
}) => {
  const navigateUser = onNavigateToUser || onSelectUser || (() => {});
  const navigateConv = onNavigateToConversation || onSelectConversation || (() => {});
  const navigateMedia = onNavigateToMedia || onSelectMedia || (() => {});
  const navigateReport = onNavigateToReport || onSelectReport || (() => {});

  const { user } = useAuth();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<UniversalSearchResult>({
    users: [],
    messages: [],
    conversations: [],
    media: [],
    reports: [],
  });
  const [loading, setLoading] = useState(false);
  const [activeCategory, setActiveCategory] = useState<'all' | 'users' | 'messages' | 'conversations' | 'media' | 'reports'>('all');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      setQuery('');
      setResults({ users: [], messages: [], conversations: [], media: [], reports: [] });
    }
  }, [isOpen]);

  useEffect(() => {
    if (!query.trim() || !user) {
      setResults({ users: [], messages: [], conversations: [], media: [], reports: [] });
      setLoading(false);
      return;
    }

    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await performUniversalSearch(user.id, query);
        setResults(res);
      } catch (err) {
        console.error('Universal search error:', err);
      } finally {
        setLoading(false);
      }
    }, 180);

    return () => clearTimeout(timer);
  }, [query, user]);

  if (!isOpen) return null;

  const totalHits =
    results.users.length +
    results.messages.length +
    results.conversations.length +
    results.media.length +
    results.reports.length;

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-start justify-center p-3 sm:p-6 overflow-y-auto animate-fade-in">
      <div className="bg-vault-900 border border-vault-700/80 rounded-3xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col my-auto max-h-[85vh]">
        {/* Search Input Bar */}
        <div className="p-4 border-b border-vault-800 bg-vault-950 flex items-center gap-3">
          <Search className="w-5 h-5 text-emerald shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Universal Search across Users, Messages, Media, Reports..."
            className="flex-1 bg-transparent text-sm sm:text-base text-white placeholder-vault-500 outline-none font-medium"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              className="p-1 rounded-lg text-vault-400 hover:text-white hover:bg-vault-800 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="px-2.5 py-1 text-xs font-bold rounded-lg bg-vault-800 hover:bg-vault-700 text-vault-300 hover:text-white transition-colors cursor-pointer"
          >
            ESC
          </button>
        </div>

        {/* Category Filter Pills */}
        <div className="px-4 py-2 border-b border-vault-800 bg-vault-950/60 flex items-center gap-1.5 overflow-x-auto no-scrollbar">
          {(['all', 'users', 'messages', 'conversations', 'media', 'reports'] as const).map(cat => (
            <button
              key={cat}
              type="button"
              onClick={() => setActiveCategory(cat)}
              className={`px-3 py-1 rounded-xl text-xs font-bold uppercase transition-all shrink-0 cursor-pointer ${
                activeCategory === cat
                  ? 'bg-emerald text-black shadow-sm font-black'
                  : 'bg-vault-900 text-vault-400 hover:text-white border border-vault-800'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Results Stream */}
        <div className="flex-1 overflow-y-auto p-3 space-y-4 min-h-[260px]">
          {loading && (
            <div className="flex items-center justify-center py-12 text-vault-400 text-xs gap-2">
              <div className="w-4 h-4 rounded-full border-2 border-emerald border-t-transparent animate-spin" />
              <span>Searching platform index...</span>
            </div>
          )}

          {!loading && !query.trim() && (
            <div className="py-12 text-center text-vault-500 text-xs">
              Type keywords, user display names, @usernames, UIDs, or report reasons to instantly inspect.
            </div>
          )}

          {!loading && query.trim() && totalHits === 0 && (
            <div className="py-12 text-center text-vault-400 text-xs">
              No matching records found for "{query}".
            </div>
          )}

          {/* Users Section */}
          {(activeCategory === 'all' || activeCategory === 'users') && results.users.length > 0 && (
            <div>
              <div className="text-[11px] font-bold uppercase tracking-wider text-vault-400 px-2 mb-1.5 flex items-center justify-between">
                <span>Users ({results.users.length})</span>
              </div>
              <div className="space-y-1">
                {results.users.map(u => (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => {
                      navigateUser(u.id);
                      onClose();
                    }}
                    className="w-full p-2.5 rounded-xl hover:bg-vault-800/80 flex items-center justify-between gap-3 text-left transition-colors group cursor-pointer border border-transparent hover:border-vault-700"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <Avatar src={u.avatar_url} name={u.display_name || 'User'} size={40} />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold text-white truncate">{u.display_name}</span>
                          <span className={`text-[10px] font-mono uppercase px-1.5 py-0.5 rounded font-bold ${
                            u.status === 'banned'
                              ? 'bg-rose-950 text-rose-300 border border-rose-800'
                              : u.status === 'suspended'
                              ? 'bg-amber-950 text-amber-300 border border-amber-800'
                              : 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                          }`}>
                            {u.status}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-vault-400 font-mono">
                          <span>{u.uid}</span>
                          {u.username && <span>• @{u.username}</span>}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 text-xs text-emerald font-semibold opacity-0 group-hover:opacity-100 transition-opacity">
                      <span>Inspect 360</span>
                      <ChevronRight className="w-4 h-4" />
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Messages Section */}
          {(activeCategory === 'all' || activeCategory === 'messages') && results.messages.length > 0 && (
            <div>
              <div className="text-[11px] font-bold uppercase tracking-wider text-vault-400 px-2 mb-1.5 flex items-center justify-between">
                <span>Messages ({results.messages.length})</span>
              </div>
              <div className="space-y-1">
                {results.messages.map(item => (
                  <button
                    key={item.message.id}
                    type="button"
                    onClick={() => {
                      navigateConv(item.conversationId, item.message.id);
                      onClose();
                    }}
                    className="w-full p-2.5 rounded-xl hover:bg-vault-800/80 flex items-center justify-between gap-3 text-left transition-colors group cursor-pointer border border-transparent hover:border-vault-700"
                  >
                    <div className="flex items-start gap-3 min-w-0">
                      <div className="p-2 rounded-lg bg-vault-800 text-cyan-400 shrink-0 mt-0.5">
                        <MessageSquare className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="text-xs font-bold text-white">
                            {item.sender?.display_name || 'Sender'}
                          </span>
                          <span className="text-[11px] font-mono text-vault-400">
                            {formatTimestamp(item.message.created_at)}
                          </span>
                        </div>
                        <p className="text-xs text-vault-300 line-clamp-1 m-0">
                          {item.snippet}
                        </p>
                      </div>
                    </div>
                    <span className="text-xs text-cyan-400 font-semibold opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                      Jump to chat →
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Conversations Section */}
          {(activeCategory === 'all' || activeCategory === 'conversations') && results.conversations.length > 0 && (
            <div>
              <div className="text-[11px] font-bold uppercase tracking-wider text-vault-400 px-2 mb-1.5">
                <span>Conversations ({results.conversations.length})</span>
              </div>
              <div className="space-y-1">
                {results.conversations.map(c => (
                  <button
                    key={c.conversation.id}
                    type="button"
                    onClick={() => {
                      navigateConv(c.conversation.id);
                      onClose();
                    }}
                    className="w-full p-2.5 rounded-xl hover:bg-vault-800/80 flex items-center justify-between gap-3 text-left transition-colors group cursor-pointer border border-transparent hover:border-vault-700"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="flex -space-x-2 shrink-0">
                        <Avatar src={c.userA?.avatar_url} name={c.userA?.display_name || 'User A'} size={32} />
                        <Avatar src={c.userB?.avatar_url} name={c.userB?.display_name || 'User B'} size={32} />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-white truncate m-0">
                          {c.userA?.display_name || 'User A'} & {c.userB?.display_name || 'User B'}
                        </p>
                        <p className="text-xs text-vault-400 truncate m-0 font-mono">
                          {c.conversation.messages.length} messages • Updated {formatTimestamp(c.conversation.updated_at)}
                        </p>
                      </div>
                    </div>
                    <span className="text-xs text-emerald font-semibold opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                      Open DM →
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Media Section */}
          {(activeCategory === 'all' || activeCategory === 'media') && results.media.length > 0 && (
            <div>
              <div className="text-[11px] font-bold uppercase tracking-wider text-vault-400 px-2 mb-1.5">
                <span>Media Items ({results.media.length})</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {results.media.map(m => (
                  <button
                    key={m.item.id}
                    type="button"
                    onClick={() => {
                      if (m.conversationId) {
                        navigateMedia(m.conversationId, m.messageId);
                      } else {
                        navigateUser(m.item.user_id, 'media');
                      }
                      onClose();
                    }}
                    className="group relative aspect-square rounded-xl overflow-hidden border border-vault-800 hover:border-emerald bg-vault-950 text-left cursor-pointer"
                  >
                    <img
                      src={m.item.previewUrl || m.item.image_url}
                      alt={m.item.caption || 'Media'}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent p-2 flex flex-col justify-end">
                      <span className="text-xs font-bold text-white truncate">
                        {m.user?.display_name || 'User'}
                      </span>
                      <span className="text-[10px] text-emerald font-mono flex items-center gap-1">
                        <ArrowRight className="w-3 h-3" /> View Context
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Reports Section */}
          {(activeCategory === 'all' || activeCategory === 'reports') && results.reports.length > 0 && (
            <div>
              <div className="text-[11px] font-bold uppercase tracking-wider text-vault-400 px-2 mb-1.5">
                <span>Safety Reports ({results.reports.length})</span>
              </div>
              <div className="space-y-1">
                {results.reports.map(r => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => {
                      navigateReport(r.id);
                      onClose();
                    }}
                    className="w-full p-2.5 rounded-xl hover:bg-vault-800/80 flex items-center justify-between gap-3 text-left transition-colors group cursor-pointer border border-transparent hover:border-vault-700"
                  >
                    <div className="flex items-start gap-3 min-w-0">
                      <div className="p-2 rounded-lg bg-rose-950/80 text-rose-400 border border-rose-800/50 shrink-0 mt-0.5">
                        <ShieldAlert className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="text-xs font-bold text-rose-300 uppercase tracking-wider">
                            {r.category.replace('_', ' ')}
                          </span>
                          <span className="text-[10px] font-mono text-vault-400">
                            Target: {r.reportedUser?.display_name || 'Unknown'}
                          </span>
                        </div>
                        <p className="text-xs text-vault-300 line-clamp-1 m-0">
                          {r.reason}
                        </p>
                      </div>
                    </div>
                    <span className="text-xs text-rose-400 font-semibold opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                      Investigate →
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

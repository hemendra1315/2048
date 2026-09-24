import type { User360Tab } from './User360View';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  MessageSquare,
  Search,
  Trash2,
  Copy,
  ExternalLink,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import {
  listConversations,
  listProfiles,
  deleteMessageAsAdmin,
  AdminConversation,
} from '../../lib/adminApi';
import { MessageItem, UserProfile } from '../../types';
import { formatTimestamp } from '../../lib/utils';
import { Avatar } from '../common/Avatar';

interface ConversationViewerProps {
  initialConversationId?: string | null;
  initialHighlightMessageId?: string | null;
  highlightMessageId?: string | null;
  onSelectUser?: (userId: string, tab?: User360Tab) => void;
  onNavigateToUser?: (userId: string, tab?: User360Tab) => void;
}

export const ConversationViewer: React.FC<ConversationViewerProps> = ({
  initialConversationId,
  initialHighlightMessageId,
  highlightMessageId,
  onSelectUser,
  onNavigateToUser,
}) => {
  const navigateUser = (userId: string, tab?: User360Tab) => {
    if (onNavigateToUser) {
      onNavigateToUser(userId, tab);
    } else if (onSelectUser) {
      onSelectUser(userId, tab);
    }
  };
  const targetHighlightId = highlightMessageId || initialHighlightMessageId;

  const { user } = useAuth();
  const { showToast } = useToast();
  const [conversations, setConversations] = useState<AdminConversation[]>([]);
  const [profiles, setProfiles] = useState<Record<string, UserProfile>>({});
  const [selectedConvId, setSelectedConvId] = useState<string | null>(initialConversationId || null);
  const [highlightMsgId, setHighlightMsgId] = useState<string | null>(targetHighlightId || null);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const highlightedMessageRef = useRef<HTMLDivElement>(null);

  const loadData = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const [convs, profileList] = await Promise.all([
        listConversations(user.id),
        listProfiles(),
      ]);

      const map: Record<string, UserProfile> = {};
      profileList.forEach(p => {
        map[p.id] = p;
      });
      setProfiles(map);
      setConversations(convs);

      if (initialConversationId && convs.some(c => c.id === initialConversationId)) {
        setSelectedConvId(initialConversationId);
      } else if (convs.length > 0 && !selectedConvId) {
        setSelectedConvId(convs[0].id);
      }
    } catch (err) {
      console.error('Error loading conversations for admin:', err);
      showToast('Failed to load conversations', 'error');
    } finally {
      setLoading(false);
    }
  }, [user, initialConversationId, selectedConvId, showToast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // If highlight message changes from props, update and scroll
  useEffect(() => {
    if (targetHighlightId) {
      setHighlightMsgId(targetHighlightId);
    }
  }, [targetHighlightId]);

  useEffect(() => {
    if (initialConversationId) {
      setSelectedConvId(initialConversationId);
    }
  }, [initialConversationId]);

  // Auto-scroll to highlighted message or bottom
  useEffect(() => {
    if (highlightMsgId && highlightedMessageRef.current) {
      highlightedMessageRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } else if (messagesEndRef.current && !highlightMsgId) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [selectedConvId, highlightMsgId, conversations]);

  const activeConv = conversations.find(c => c.id === selectedConvId) || null;
  const userA = activeConv ? profiles[activeConv.user_a] : null;
  const userB = activeConv ? profiles[activeConv.user_b] : null;

  const filteredConversations = conversations.filter(c => {
    const pA = profiles[c.user_a];
    const pB = profiles[c.user_b];
    const nameA = pA?.display_name?.toLowerCase() || '';
    const nameB = pB?.display_name?.toLowerCase() || '';
    const uidA = pA?.uid?.toLowerCase() || '';
    const uidB = pB?.uid?.toLowerCase() || '';
    const q = searchQuery.toLowerCase();

    return (
      nameA.includes(q) ||
      nameB.includes(q) ||
      uidA.includes(q) ||
      uidB.includes(q) ||
      c.id.toLowerCase().includes(q) ||
      c.messages.some(m => m.content.toLowerCase().includes(q))
    );
  });

  const handleDeleteMessage = async (msg: MessageItem) => {
    if (!user || !activeConv) return;
    if (!confirm('Are you sure you want to permanently delete this message as Admin?')) return;

    try {
      await deleteMessageAsAdmin(user.id, msg.id, activeConv.id);
      setConversations(prev =>
        prev.map(c =>
          c.id === activeConv.id
            ? { ...c, messages: c.messages.filter(m => m.id !== msg.id) }
            : c
        )
      );
      showToast('Message removed by Administrator', 'info');
    } catch (err) {
      console.error('Failed to delete message:', err);
      showToast('Could not delete message', 'error');
    }
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    showToast(`${label} copied to clipboard`, 'success');
  };

  return (
    <div className="flex flex-col lg:flex-row h-[calc(100vh-140px)] min-h-[600px] bg-vault-950 border border-vault-800 rounded-3xl overflow-hidden shadow-2xl">
      {/* Left Sidebar: Conversation Index */}
      <div className="w-full lg:w-80 border-b lg:border-b-0 lg:border-r border-vault-800 flex flex-col bg-vault-950/80">
        <div className="p-3.5 border-b border-vault-800">
          <div className="relative">
            <Search className="w-4 h-4 text-vault-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search chats, participants, UIDs..."
              className="w-full bg-vault-900 border border-vault-800 focus:border-emerald rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-vault-500 outline-none transition-colors"
            />
          </div>
        </div>

        {/* Conversation List */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {loading ? (
            <div className="py-12 text-center text-vault-400 text-xs">Loading conversations...</div>
          ) : filteredConversations.length === 0 ? (
            <div className="py-12 text-center text-vault-500 text-xs">No conversations found</div>
          ) : (
            filteredConversations.map(c => {
              const pA = profiles[c.user_a];
              const pB = profiles[c.user_b];
              const isSelected = c.id === selectedConvId;
              const lastMsg = c.messages[c.messages.length - 1];

              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => {
                    setSelectedConvId(c.id);
                    setHighlightMsgId(null);
                  }}
                  className={`w-full p-3 rounded-2xl text-left flex items-start gap-3 transition-all cursor-pointer border ${
                    isSelected
                      ? 'bg-vault-850 border-emerald shadow-sm'
                      : 'border-transparent hover:bg-vault-900 hover:border-vault-800'
                  }`}
                >
                  <div className="flex -space-x-2 shrink-0 mt-0.5">
                    <Avatar src={pA?.avatar_url} name={pA?.display_name || 'User'} size={32} />
                    <Avatar src={pB?.avatar_url} name={pB?.display_name || 'User'} size={32} />
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-1 mb-0.5">
                      <span className="text-xs font-bold text-white truncate">
                        {pA?.display_name?.split(' ')[0]} & {pB?.display_name?.split(' ')[0]}
                      </span>
                      {lastMsg && (
                        <span className="text-[10px] font-mono text-vault-500 shrink-0">
                          {formatTimestamp(lastMsg.created_at)}
                        </span>
                      )}
                    </div>

                    <p className="text-xs text-vault-400 truncate m-0 font-mono">
                      {lastMsg ? lastMsg.content : 'No messages'}
                    </p>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* Right Main Chat Panel: Real Message Stream */}
      <div className="flex-1 flex flex-col min-w-0 bg-vault-900">
        {activeConv ? (
          <>
            {/* Conversation Header */}
            <div className="p-4 border-b border-vault-800 bg-vault-950 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="flex items-center gap-2 bg-vault-900 px-3 py-1.5 rounded-xl border border-vault-750">
                    <Avatar src={userA?.avatar_url} name={userA?.display_name || 'User A'} size={32} />
                    <div className="min-w-0">
                      <span className="text-xs font-bold text-white block truncate">{userA?.display_name || 'User A'}</span>
                      <span className="text-[10px] font-mono text-emerald block">{userA?.uid}</span>
                    </div>
                    {userA && (
                      <button
                        type="button"
                        onClick={() => navigateUser(userA.id)}
                        className="p-1 hover:bg-vault-800 rounded text-vault-400 hover:text-white ml-1 cursor-pointer"
                        title="Inspect User A 360"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  <span className="text-xs text-vault-500 font-bold">↔</span>

                  <div className="flex items-center gap-2 bg-vault-900 px-3 py-1.5 rounded-xl border border-vault-750">
                    <Avatar src={userB?.avatar_url} name={userB?.display_name || 'User B'} size={32} />
                    <div className="min-w-0">
                      <span className="text-xs font-bold text-white block truncate">{userB?.display_name || 'User B'}</span>
                      <span className="text-[10px] font-mono text-emerald block">{userB?.uid}</span>
                    </div>
                    {userB && (
                      <button
                        type="button"
                        onClick={() => navigateUser(userB.id)}
                        className="p-1 hover:bg-vault-800 rounded text-vault-400 hover:text-white ml-1 cursor-pointer"
                        title="Inspect User B 360"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 text-xs text-vault-400 font-mono self-end sm:self-center">
                <span>{activeConv.messages.length} Messages</span>
                <span>•</span>
                <button
                  type="button"
                  onClick={() => copyToClipboard(activeConv.id, 'Conversation ID')}
                  className="hover:text-emerald flex items-center gap-1 cursor-pointer"
                  title="Copy conversation ID"
                >
                  <Copy className="w-3 h-3" />
                  <span>ID</span>
                </button>
              </div>
            </div>

            {/* Message Stream */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
              {activeConv.messages.length === 0 ? (
                <div className="py-20 text-center text-vault-400 text-xs">
                  This conversation contains no messages.
                </div>
              ) : (
                activeConv.messages.map(msg => {
                  const sender = profiles[msg.sender_id];
                  const isUserA = msg.sender_id === activeConv.user_a;
                  const isHighlighted = msg.id === highlightMsgId;

                  return (
                    <div
                      key={msg.id}
                      ref={isHighlighted ? highlightedMessageRef : undefined}
                      className={`flex gap-3 group transition-all duration-300 ${
                        isUserA ? 'justify-start' : 'justify-end'
                      } ${
                        isHighlighted
                          ? 'p-2 rounded-2xl bg-emerald-950/40 border-2 border-emerald shadow-lg shadow-emerald/20 animate-pulse-subtle'
                          : ''
                      }`}
                    >
                      {/* Avatar for User A */}
                      {isUserA && (
                        <button
                          type="button"
                          onClick={() => navigateUser(msg.sender_id)}
                          className="shrink-0 cursor-pointer hover:opacity-80 transition-opacity"
                        >
                          <Avatar src={sender?.avatar_url} name={sender?.display_name || 'User'} size={32} />
                        </button>
                      )}

                      {/* Bubble Container */}
                      <div className={`flex flex-col max-w-[80%] sm:max-w-[70%] ${isUserA ? 'items-start' : 'items-end'}`}>
                        {/* Sender info & time */}
                        <div className="flex items-center gap-2 mb-1 px-1">
                          <span className="text-xs font-bold text-vault-300">
                            {sender?.display_name || 'User'}
                          </span>
                          <span className="text-[10px] font-mono text-vault-500">
                            {formatTimestamp(msg.created_at)}
                          </span>
                          {isHighlighted && (
                            <span className="px-1.5 py-0.5 rounded bg-emerald text-black text-[9px] font-bold uppercase tracking-wider">
                              Target Context
                            </span>
                          )}
                        </div>

                        {/* Message Body */}
                        <div
                          className={`p-3.5 rounded-2xl text-xs sm:text-sm leading-relaxed relative ${
                            isUserA
                              ? 'bg-vault-800 text-vault-100 border border-vault-700/60 rounded-tl-sm'
                              : 'bg-emerald-950 text-emerald-100 border border-emerald-800/60 rounded-tr-sm'
                          }`}
                        >
                          {/* Photo attachment preview if message is image */}
                          {msg.content.startsWith('http') && (msg.content.includes('.jpg') || msg.content.includes('.png') || msg.content.includes('.webp') || msg.content.includes('supabase.co/storage')) ? (
                            <div className="space-y-2">
                              <img
                                src={msg.content}
                                alt="Attachment"
                                className="max-w-xs rounded-xl object-cover max-h-64 border border-vault-700"
                              />
                            </div>
                          ) : (
                            <p className="m-0 break-words whitespace-pre-wrap">{msg.content}</p>
                          )}
                        </div>

                        {/* Message Actions (Visible on hover or if highlighted) */}
                        <div className="flex items-center gap-2 mt-1 opacity-0 group-hover:opacity-100 transition-opacity px-1">
                          <button
                            type="button"
                            onClick={() => copyToClipboard(msg.id, 'Message ID')}
                            className="text-[10px] text-vault-400 hover:text-white flex items-center gap-1 cursor-pointer"
                          >
                            <Copy className="w-3 h-3" />
                            <span>Copy ID</span>
                          </button>
                          <span className="text-vault-600">•</span>
                          <button
                            type="button"
                            onClick={() => navigateUser(msg.sender_id)}
                            className="text-[10px] text-emerald hover:underline cursor-pointer"
                          >
                            User 360
                          </button>
                          <span className="text-vault-600">•</span>
                          <button
                            type="button"
                            onClick={() => handleDeleteMessage(msg)}
                            className="text-[10px] text-rose-400 hover:text-rose-300 flex items-center gap-1 cursor-pointer"
                          >
                            <Trash2 className="w-3 h-3" />
                            <span>Delete</span>
                          </button>
                        </div>
                      </div>

                      {/* Avatar for User B */}
                      {!isUserA && (
                        <button
                          type="button"
                          onClick={() => navigateUser(msg.sender_id)}
                          className="shrink-0 cursor-pointer hover:opacity-80 transition-opacity"
                        >
                          <Avatar src={sender?.avatar_url} name={sender?.display_name || 'User'} size={32} />
                        </button>
                      )}
                    </div>
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-vault-400 text-xs">
            <MessageSquare className="w-12 h-12 text-vault-700 mb-3" />
            <p className="m-0 font-medium">Select a conversation from the left index to inspect the message transcript.</p>
          </div>
        )}
      </div>
    </div>
  );
};

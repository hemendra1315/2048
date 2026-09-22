import React, { useState, useEffect, useCallback } from 'react';
import {
  MessageSquare,
  Search,
  Pin,
  Image as ImageIcon,
  Mic,
  UserPlus,
} from 'lucide-react';
import { ConversationItem, UserProfile } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { mockBackend } from '../../lib/mockBackend';
import { supabase, isSupabaseConfigured } from '../../lib/supabase';
import { formatTimestamp } from '../../lib/utils';
import { ChatRoom } from './ChatRoom';

interface MessagesViewProps {
  initialPartnerId?: string | null;
  onClearInitialPartner?: () => void;
  onOpenConnectionsTab?: () => void;
  onSelectConversationForDesktop?: (partner: UserProfile, convId: string) => void;
}

export const MessagesView: React.FC<MessagesViewProps> = ({
  initialPartnerId,
  onClearInitialPartner,
  onSelectConversationForDesktop,
}) => {
  const { user } = useAuth();
  const [conversations, setConversations] = useState<ConversationItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeConversation, setActiveConversation] = useState<{
    id: string;
    partner: UserProfile;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [newChatUidInput, setNewChatUidInput] = useState('');
  const [newChatModalOpen, setNewChatModalOpen] = useState(false);

  const loadConversations = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      if (isSupabaseConfigured()) {
        const { data: rawConvs } = await supabase
          .from('conversations')
          .select('*')
          .or(`user_a.eq.${user.id},user_b.eq.${user.id}`)
          .order('updated_at', { ascending: false });

        const convs = (rawConvs || []) as unknown as { id: string; user_a: string; user_b: string; created_at: string; updated_at: string }[];

        if (convs.length > 0) {
          const partnerIds = convs.map(c => (c.user_a === user.id ? c.user_b : c.user_a));
          const { data: rawProfiles } = await supabase
            .from('profiles')
            .select('*')
            .in('id', partnerIds);

          const profiles = (rawProfiles || []) as unknown as UserProfile[];

          const formatted: ConversationItem[] = convs.map(c => {
            const pId = c.user_a === user.id ? c.user_b : c.user_a;
            const partner = profiles?.find(p => p.id === pId) || {
              id: pId,
              uid: 'UNKNOWN',
              display_name: 'Contact',
              avatar_url: null,
              role: 'user',
              status: 'active',
              created_at: '',
              updated_at: '',
            };
            return {
              id: c.id,
              user_a: c.user_a,
              user_b: c.user_b,
              created_at: c.created_at,
              updated_at: c.updated_at,
              partner: partner as ConversationItem['partner'],
              unreadCount: 0,
            };
          });
          setConversations(formatted);
        } else {
          setConversations([]);
        }
      } else {
        const list = mockBackend.getConversations(user.id);
        setConversations(list);
      }
    } catch (err) {
      console.error('Error loading conversations:', err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    loadConversations();

    if (!isSupabaseConfigured()) {
      const unsub = mockBackend.subscribe('messages:updated', () => loadConversations());
      return unsub;
    }
  }, [loadConversations]);

  // Handle direct navigation to a chat partner
  useEffect(() => {
    if (initialPartnerId && user) {
      const existing = conversations.find(c => c.partner.id === initialPartnerId);
      if (existing) {
        setActiveConversation({ id: existing.id, partner: existing.partner });
      } else {
        const partner = mockBackend.getProfileById(initialPartnerId);
        if (partner) {
          const convId = mockBackend.getOrCreateConversation(user.id, partner.id);
          setActiveConversation({ id: convId, partner });
        }
      }
      if (onClearInitialPartner) onClearInitialPartner();
    }
  }, [initialPartnerId, conversations, user, onClearInitialPartner]);

  const handleStartDirectChat = (partner: UserProfile, convId: string) => {
    setActiveConversation({ id: convId, partner });
    if (onSelectConversationForDesktop) {
      onSelectConversationForDesktop(partner, convId);
    }
  };

  const handleCreateChatByUid = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newChatUidInput.trim() || !user) return;
    const cleanUid = newChatUidInput.trim().toUpperCase();

    const allProfiles = mockBackend.getProfiles();
    const targetUser = allProfiles.find(
      p => p.uid.toUpperCase() === cleanUid || (p.username && p.username.toUpperCase() === cleanUid)
    );

    if (targetUser) {
      const convId = mockBackend.getOrCreateConversation(user.id, targetUser.id);
      setActiveConversation({ id: convId, partner: targetUser });
      setNewChatModalOpen(false);
      setNewChatUidInput('');
    } else {
      alert(`No sovereign user node found with UID "${cleanUid}"`);
    }
  };

  const filteredConversations = conversations.filter(c => {
    const q = searchQuery.toLowerCase();
    return (
      c.partner.display_name.toLowerCase().includes(q) ||
      (c.partner.uid && c.partner.uid.toLowerCase().includes(q))
    );
  });

  if (activeConversation) {
    return (
      <ChatRoom
        conversationId={activeConversation.id}
        partner={activeConversation.partner}
        onBack={() => setActiveConversation(null)}
      />
    );
  }

  return (
    <div className="space-y-4 pb-20 animate-fade-in select-none">
      {/* Search & Direct Add Header */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-zinc-500 absolute left-3.5 top-3 pointer-events-none" />
          <input
            type="text"
            placeholder="Search messages or UID..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full bg-[#111111] border border-[#262626] focus:border-[#10B981] rounded-xl pl-9 pr-4 py-2 text-xs text-white placeholder-zinc-500 outline-none transition-all"
          />
        </div>

        <button
          onClick={() => setNewChatModalOpen(true)}
          className="flex items-center justify-center p-2.5 bg-[#171717] hover:bg-[#222222] border border-[#262626] hover:border-[#10B981] rounded-xl text-[#10B981] transition-all active:scale-95"
          title="Direct UID Connect"
        >
          <UserPlus className="w-4 h-4" />
        </button>
      </div>

      {/* Pinned Contacts Carousel */}
      {conversations.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-1.5 px-1 text-xs text-zinc-500 font-semibold">
            <Pin className="w-3 h-3 text-[#10B981]" />
            <span>PINNED CONTACTS</span>
          </div>

          <div className="flex items-center gap-3 overflow-x-auto pb-1 scrollbar-none">
            {conversations.slice(0, 5).map(c => (
              <button
                key={c.id}
                onClick={() => handleStartDirectChat(c.partner, c.id)}
                className="flex flex-col items-center gap-1.5 p-2 rounded-xl bg-[#111111] border border-[#262626] hover:border-[#10B981]/60 min-w-[76px] transition-all active:scale-95"
              >
                <div className="relative">
                  <img
                    src={c.partner.avatar_url || `https://api.dicebear.com/7.x/bottts/svg?seed=${c.partner.uid}`}
                    alt={c.partner.display_name}
                    className="w-11 h-11 rounded-xl bg-[#171717] border border-[#262626] object-cover"
                  />
                  <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-[#10B981] border-2 border-[#111111]" />
                </div>
                <span className="text-[11px] font-semibold text-zinc-300 truncate max-w-[68px]">
                  {c.partner.display_name.split(' ')[0]}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Main Conversation Stream */}
      <div className="space-y-2">
        <div className="flex items-center justify-between px-1 text-xs text-zinc-500 font-semibold">
          <span>RECENT MESSAGES</span>
          <span className="font-mono text-[10px] text-[#10B981]">E2E ENCRYPTED</span>
        </div>

        {loading ? (
          <div className="p-12 text-center text-xs text-zinc-500 font-mono">Loading secure channels...</div>
        ) : filteredConversations.length === 0 ? (
          <div className="p-12 bg-[#111111] border border-[#262626] rounded-2xl text-center space-y-3">
            <MessageSquare className="w-10 h-10 text-zinc-600 mx-auto" />
            <p className="text-sm font-semibold text-white">No Active Conversations</p>
            <p className="text-xs text-[#A1A1AA] max-w-xs mx-auto">
              Connect directly with sovereign peers using their UID tag.
            </p>
            <button
              onClick={() => setNewChatModalOpen(true)}
              className="px-4 py-2 bg-[#10B981] hover:bg-emerald-400 text-black text-xs font-bold rounded-xl shadow-lg transition-all"
            >
              Start New Chat
            </button>
          </div>
        ) : (
          <div className="space-y-1.5">
            {filteredConversations.map(c => (
              <div
                key={c.id}
                onClick={() => handleStartDirectChat(c.partner, c.id)}
                className="group flex items-center justify-between p-3.5 bg-[#111111] hover:bg-[#171717] border border-[#262626] hover:border-zinc-600 rounded-2xl cursor-pointer transition-all active:scale-98"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="relative">
                    <img
                      src={c.partner.avatar_url || `https://api.dicebear.com/7.x/bottts/svg?seed=${c.partner.uid}`}
                      alt={c.partner.display_name}
                      className="w-12 h-12 rounded-xl bg-[#171717] border border-[#262626] object-cover"
                    />
                    <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-[#10B981] border-2 border-[#111111]" />
                  </div>

                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h4 className="text-sm font-bold text-white truncate leading-tight">
                        {c.partner.display_name}
                      </h4>
                      <span className="text-[10px] font-mono text-[#10B981]">
                        {c.partner.uid}
                      </span>
                    </div>

                    <p className="text-xs text-[#A1A1AA] truncate mt-1 flex items-center gap-1">
                      {c.lastMessage?.content.startsWith('[IMAGE]') ? (
                        <>
                          <ImageIcon className="w-3.5 h-3.5 text-[#10B981]" />
                          <span>Encrypted photo</span>
                        </>
                      ) : c.lastMessage?.content.startsWith('[VOICE_NOTE') ? (
                        <>
                          <Mic className="w-3.5 h-3.5 text-[#10B981]" />
                          <span>Voice message (0:14)</span>
                        </>
                      ) : (
                        c.lastMessage?.content || 'Encrypted direct channel ready'
                      )}
                    </p>
                  </div>
                </div>

                <div className="flex flex-col items-end gap-1 text-right pl-2">
                  <span className="text-[10px] text-zinc-500 whitespace-nowrap">
                    {c.lastMessage ? formatTimestamp(c.lastMessage.created_at) : ''}
                  </span>
                  {c.unreadCount > 0 && (
                    <span className="px-2 py-0.5 bg-[#10B981] text-black font-bold text-[10px] rounded-full">
                      {c.unreadCount}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* New Direct Chat Modal */}
      {newChatModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-[#111111] border border-[#262626] rounded-2xl p-6 max-w-sm w-full space-y-4 animate-fade-in shadow-2xl">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-white">Direct Sovereign Connect</h3>
              </div>
              <button
                onClick={() => setNewChatModalOpen(false)}
                className="text-zinc-500 hover:text-white text-sm"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-[#A1A1AA]">
              Enter the peer's unique UID tag (e.g. <span className="font-mono text-white">CIPHER-1082</span> or <span className="font-mono text-white">SOLAR-8120</span>) to open an encrypted channel.
            </p>

            <form onSubmit={handleCreateChatByUid} className="space-y-3">
              <input
                type="text"
                placeholder="Enter UID..."
                value={newChatUidInput}
                onChange={e => setNewChatUidInput(e.target.value)}
                className="w-full py-2.5 px-4 bg-[#171717] border border-[#262626] focus:border-[#10B981] rounded-xl text-white font-mono text-sm placeholder:text-zinc-600 focus:outline-none"
              />

              <button
                type="submit"
                className="w-full py-2.5 bg-[#10B981] hover:bg-emerald-400 active:scale-98 text-black text-xs font-bold rounded-xl shadow-lg transition-all"
              >
                Open Encrypted Channel
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

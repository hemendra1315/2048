import React, { useState, useEffect, useCallback } from 'react';
import {
  MessageSquare,
  Search,
  Pin,
  Image as ImageIcon,
  Mic,
  UserPlus,
  ShieldCheck,
  Lock,
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
          const convIds = convs.map(c => c.id);

          const [{ data: rawProfiles }, { data: rawMessages }] = await Promise.all([
            supabase.from('profiles').select('*').in('id', partnerIds),
            supabase.from('messages').select('*').in('conversation_id', convIds).order('created_at', { ascending: false }),
          ]);

          const profiles = (rawProfiles || []) as unknown as UserProfile[];
          const messages = (rawMessages || []) as unknown as { id: string; conversation_id: string; sender_id: string; content: string; is_read: boolean; created_at: string }[];

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

            const convMessages = messages.filter(m => m.conversation_id === c.id);
            const lastMsg = convMessages[0] as ConversationItem['lastMessage'];
            const unreadCount = convMessages.filter(m => !m.is_read && m.sender_id !== user.id).length;

            return {
              id: c.id,
              user_a: c.user_a,
              user_b: c.user_b,
              created_at: c.created_at,
              updated_at: c.updated_at,
              partner: partner as ConversationItem['partner'],
              lastMessage: lastMsg,
              unreadCount,
            };
          });
          setConversations(formatted);
          setActiveConversation(prev => {
            if (!prev && formatted.length > 0 && typeof window !== 'undefined' && window.innerWidth >= 1024) {
              if (onSelectConversationForDesktop) {
                onSelectConversationForDesktop(formatted[0].partner, formatted[0].id);
              }
              return { id: formatted[0].id, partner: formatted[0].partner };
            }
            return prev;
          });
        } else {
          setConversations([]);
        }
      } else {
        const list = mockBackend.getConversations(user.id);
        setConversations(list);
        setActiveConversation(prev => {
          if (!prev && list.length > 0 && typeof window !== 'undefined' && window.innerWidth >= 1024) {
            if (onSelectConversationForDesktop) {
              onSelectConversationForDesktop(list[0].partner, list[0].id);
            }
            return { id: list[0].id, partner: list[0].partner };
          }
          return prev;
        });
      }
    } catch (err) {
      console.error('Error loading conversations:', err);
    } finally {
      setLoading(false);
    }
  }, [user, onSelectConversationForDesktop]);

  useEffect(() => {
    loadConversations();

    if (!isSupabaseConfigured()) {
      const unsub = mockBackend.subscribe('messages:updated', () => loadConversations());
      return unsub;
    } else {
      const channel = supabase
        .channel('public:conversations_messages')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, () => {
          loadConversations();
        })
        .subscribe();
      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [loadConversations]);

  // Handle direct navigation to a chat partner
  useEffect(() => {
    if (initialPartnerId && user) {
      const existing = conversations.find(c => c.partner.id === initialPartnerId);
      if (existing) {
        setActiveConversation({ id: existing.id, partner: existing.partner });
        if (onSelectConversationForDesktop) onSelectConversationForDesktop(existing.partner, existing.id);
      } else {
        if (!isSupabaseConfigured()) {
          const partner = mockBackend.getProfileById(initialPartnerId);
          if (partner) {
            const convId = mockBackend.getOrCreateConversation(user.id, partner.id);
            setActiveConversation({ id: convId, partner });
            if (onSelectConversationForDesktop) onSelectConversationForDesktop(partner, convId);
          }
        }
      }
      if (onClearInitialPartner) onClearInitialPartner();
    }
  }, [initialPartnerId, conversations, user, onClearInitialPartner, onSelectConversationForDesktop]);

  const handleStartDirectChat = (partner: UserProfile, convId: string) => {
    setActiveConversation({ id: convId, partner });
    if (onSelectConversationForDesktop) {
      onSelectConversationForDesktop(partner, convId);
    }
  };

  const handleCreateChatByUid = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newChatUidInput.trim() || !user) return;
    const cleanUid = newChatUidInput.trim().toUpperCase();

    if (user.uid === cleanUid) {
      alert('You cannot start a direct chat with your own UID.');
      return;
    }

    if (isSupabaseConfigured()) {
      try {
        const { data: rawProfile, error } = await supabase
          .from('profiles')
          .select('*')
          .or(`uid.eq.${cleanUid},username.eq.${cleanUid.toLowerCase()}`)
          .maybeSingle();

        if (error || !rawProfile) {
          alert(`No sovereign user node found with UID/Username "${cleanUid}"`);
          return;
        }

        const targetUser = rawProfile as unknown as UserProfile;
        const userA = user.id < targetUser.id ? user.id : targetUser.id;
        const userB = user.id < targetUser.id ? targetUser.id : user.id;

        let { data: existingConv } = await supabase
          .from('conversations')
          .select('*')
          .eq('user_a', userA)
          .eq('user_b', userB)
          .maybeSingle();

        if (!existingConv) {
          const { data: newConv, error: createErr } = await supabase
            .from('conversations')
            .insert({ user_a: userA, user_b: userB })
            .select('*')
            .single();
          if (createErr) throw createErr;
          existingConv = newConv;
        }

        if (existingConv) {
          await loadConversations();
          setActiveConversation({ id: existingConv.id, partner: targetUser });
          if (onSelectConversationForDesktop) onSelectConversationForDesktop(targetUser, existingConv.id);
          setNewChatModalOpen(false);
          setNewChatUidInput('');
        }
      } catch (err) {
        console.error('Error initiating conversation:', err);
        alert('Failed to initialize encrypted channel with peer');
      }
    } else {
      const allProfiles = mockBackend.getProfiles();
      const targetUser = allProfiles.find(
        p => p.uid.toUpperCase() === cleanUid || (p.username && p.username.toUpperCase() === cleanUid)
      );

      if (targetUser) {
        const convId = mockBackend.getOrCreateConversation(user.id, targetUser.id);
        setActiveConversation({ id: convId, partner: targetUser });
        if (onSelectConversationForDesktop) onSelectConversationForDesktop(targetUser, convId);
        setNewChatModalOpen(false);
        setNewChatUidInput('');
      } else {
        alert(`No sovereign user node found with UID "${cleanUid}"`);
      }
    }
  };

  const filteredConversations = conversations.filter(c => {
    const q = searchQuery.toLowerCase();
    return (
      c.partner.display_name.toLowerCase().includes(q) ||
      (c.partner.uid && c.partner.uid.toLowerCase().includes(q))
    );
  });

  // Mobile Viewport: if conversation is active, show only ChatRoom
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 1024;
  if (isMobile && activeConversation) {
    return (
      <ChatRoom
        conversationId={activeConversation.id}
        partner={activeConversation.partner}
        onBack={() => setActiveConversation(null)}
      />
    );
  }

  // Conversation List Sub-component
  const ConversationListView = (
    <div className="space-y-4 select-none h-full flex flex-col">
      {/* Search & Direct Add Header */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-zinc-500 absolute left-3.5 top-3 pointer-events-none" />
          <input
            type="text"
            placeholder="Search conversations or UID..."
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

          <div className="flex items-center gap-2.5 overflow-x-auto pb-1 scrollbar-none">
            {conversations.slice(0, 5).map(c => (
              <button
                key={c.id}
                onClick={() => handleStartDirectChat(c.partner, c.id)}
                className={`flex flex-col items-center gap-1.5 p-2 rounded-xl border min-w-[76px] transition-all active:scale-95 ${
                  activeConversation?.id === c.id
                    ? 'bg-[#171717] border-[#10B981]'
                    : 'bg-[#111111] border-[#262626] hover:border-[#10B981]/60'
                }`}
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
      <div className="space-y-2 flex-1 overflow-y-auto">
        <div className="flex items-center justify-between px-1 text-xs text-zinc-500 font-semibold">
          <span>RECENT MESSAGES</span>
          <span className="font-mono text-[10px] text-[#10B981]">E2E ENCRYPTED</span>
        </div>

        {loading ? (
          <div className="p-12 text-center text-xs text-zinc-500 font-mono">Loading secure channels...</div>
        ) : filteredConversations.length === 0 ? (
          <div className="p-8 bg-[#111111] border border-[#262626] rounded-2xl text-center space-y-3">
            <MessageSquare className="w-8 h-8 text-zinc-600 mx-auto" />
            <p className="text-sm font-semibold text-white">No Active Chats</p>
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
            {filteredConversations.map(c => {
              const isSelected = activeConversation?.id === c.id;
              return (
                <div
                  key={c.id}
                  onClick={() => handleStartDirectChat(c.partner, c.id)}
                  className={`group flex items-center justify-between p-3 border rounded-2xl cursor-pointer transition-all active:scale-98 ${
                    isSelected
                      ? 'bg-[#171717] border-[#10B981] shadow-sm'
                      : 'bg-[#111111] border-[#262626] hover:bg-[#171717] hover:border-zinc-600'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="relative">
                      <img
                        src={c.partner.avatar_url || `https://api.dicebear.com/7.x/bottts/svg?seed=${c.partner.uid}`}
                        alt={c.partner.display_name}
                        className="w-11 h-11 rounded-xl bg-[#171717] border border-[#262626] object-cover"
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

                      <p className="text-xs text-[#A1A1AA] truncate mt-0.5 flex items-center gap-1">
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
              );
            })}
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="animate-fade-in w-full">
      {/* Desktop 2-Pane Split View (≥ 1024px) */}
      <div className="hidden lg:grid lg:grid-cols-12 lg:gap-4 h-[calc(100vh-140px)]">
        {/* Left Column: Conversations List (5 cols) */}
        <div className="lg:col-span-5 h-full overflow-hidden flex flex-col bg-[#0A0A0A] p-2 rounded-2xl border border-[#262626]">
          {ConversationListView}
        </div>

        {/* Right Column: Active Chat Stream (7 cols) */}
        <div className="lg:col-span-7 h-full">
          {activeConversation ? (
            <ChatRoom
              conversationId={activeConversation.id}
              partner={activeConversation.partner}
              onBack={() => setActiveConversation(null)}
            />
          ) : (
            <div className="h-full bg-[#0A0A0A] border border-[#262626] rounded-2xl flex flex-col items-center justify-center p-8 text-center space-y-3">
              <div className="w-16 h-16 rounded-2xl bg-[#111111] border border-[#262626] flex items-center justify-center text-[#10B981]">
                <Lock className="w-8 h-8" />
              </div>
              <h3 className="text-base font-bold text-white">Signal-Grade Encrypted Messenger</h3>
              <p className="text-xs text-[#A1A1AA] max-w-sm">
                Select a conversation from the left pane or tap <span className="text-[#10B981] font-semibold">+ Direct Connect</span> to establish an end-to-end encrypted session.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Mobile Single View (< 1024px) */}
      <div className="lg:hidden pb-20">
        {ConversationListView}
      </div>

      {/* Direct UID Connect Modal */}
      {newChatModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-[#111111] border border-[#262626] rounded-2xl p-6 max-w-sm w-full space-y-4 animate-fade-in shadow-2xl">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-[#10B981]" />
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

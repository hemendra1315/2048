import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  MessageSquare,
  Search,
  Image as ImageIcon,
  Mic,
  UserPlus,
  ShieldCheck,
} from 'lucide-react';
import { ConversationItem, UserProfile } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { mockBackend } from '../../lib/mockBackend';
import { supabase, isSupabaseConfigured } from '../../lib/supabase';
import { uniqueChannelName } from '../../lib/realtime';
import { formatTimestamp } from '../../lib/utils';
import { ChatRoom } from './ChatRoom';
import { Avatar } from '../common/Avatar';
import { useMediaQuery, DESKTOP_QUERY } from '../../lib/useMediaQuery';

interface MessagesViewProps {
  initialPartnerId?: string | null;
  initialAttachment?: string | null;
  onClearInitialPartner?: () => void;
  onClearInitialAttachment?: () => void;
  onSelectConversationForDesktop?: (partner: UserProfile, convId: string) => void;
}

export const MessagesView: React.FC<MessagesViewProps> = ({
  initialPartnerId,
  initialAttachment,
  onClearInitialPartner,
  onClearInitialAttachment,
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
  const isDesktop = useMediaQuery(DESKTOP_QUERY);

  // The parent passes an inline callback. Keeping it in a ref stops every parent re-render from
  // changing loadConversations, which would re-run the realtime effect (unsubscribe/resubscribe).
  const onSelectRef = useRef(onSelectConversationForDesktop);
  useEffect(() => {
    onSelectRef.current = onSelectConversationForDesktop;
  }, [onSelectConversationForDesktop]);
  const notifyDesktopSelection = useCallback((partner: UserProfile, convId: string) => {
    onSelectRef.current?.(partner, convId);
  }, []);

  const activeConversationRef = useRef(activeConversation);
  useEffect(() => {
    activeConversationRef.current = activeConversation;
  }, [activeConversation]);

  // On desktop the split view opens the most recent conversation when nothing is selected yet.
  const autoSelectFirstOnDesktop = useCallback(
    (list: { id: string; partner: UserProfile }[]) => {
      if (activeConversationRef.current || list.length === 0) return;
      if (!window.matchMedia(DESKTOP_QUERY).matches) return;
      const first = { id: list[0].id, partner: list[0].partner };
      activeConversationRef.current = first;
      setActiveConversation(first);
      notifyDesktopSelection(first.partner, first.id);
    },
    [notifyDesktopSelection]
  );

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
          autoSelectFirstOnDesktop(formatted);
        } else {
          setConversations([]);
        }
      } else {
        const list = mockBackend.getConversations(user.id);
        setConversations(list);
        autoSelectFirstOnDesktop(list);
      }
    } catch (err) {
      console.error('Error loading conversations:', err);
    } finally {
      setLoading(false);
    }
  }, [user, autoSelectFirstOnDesktop]);

  useEffect(() => {
    loadConversations();

    if (!isSupabaseConfigured()) {
      const unsub = mockBackend.subscribe('messages:updated', () => loadConversations());
      return unsub;
    } else {
      const channel = supabase
        .channel(uniqueChannelName('conversations_messages'))
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
        notifyDesktopSelection(existing.partner, existing.id);
      } else {
        if (!isSupabaseConfigured()) {
          const partner = mockBackend.getProfileById(initialPartnerId);
          if (partner) {
            const convId = mockBackend.getOrCreateConversation(user.id, partner.id);
            setActiveConversation({ id: convId, partner });
            notifyDesktopSelection(partner, convId);
          }
        } else {
          (async () => {
            try {
              const { data: rawPartner } = await supabase.from('profiles').select('*').eq('id', initialPartnerId).maybeSingle();
              if (rawPartner) {
                const partner = rawPartner as unknown as UserProfile;
                const userA = user.id < partner.id ? user.id : partner.id;
                const userB = user.id < partner.id ? partner.id : user.id;
                let { data: conv } = await supabase.from('conversations').select('*').eq('user_a', userA).eq('user_b', userB).maybeSingle();
                if (!conv) {
                  const { data: newConv } = await supabase.from('conversations').insert({ user_a: userA, user_b: userB }).select('*').single();
                  conv = newConv;
                }
                if (conv) {
                  await loadConversations();
                  setActiveConversation({ id: conv.id, partner });
                  notifyDesktopSelection(partner, conv.id);
                }
              }
            } catch (e) {
              console.error('Error starting chat for initial partner in Supabase:', e);
            }
          })();
        }
      }
      if (onClearInitialPartner) onClearInitialPartner();
    }
  }, [initialPartnerId, conversations, user, onClearInitialPartner, notifyDesktopSelection, loadConversations]);

  const handleStartDirectChat = (partner: UserProfile, convId: string) => {
    setActiveConversation({ id: convId, partner });
    notifyDesktopSelection(partner, convId);
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
          notifyDesktopSelection(targetUser, existingConv.id);
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
        notifyDesktopSelection(targetUser, convId);
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

  // Conversation List Sub-component
  const previewText = (content?: string) => {
    if (!content) return 'Say hi';
    if (content.startsWith('[IMAGE]')) return 'Photo';
    if (content.startsWith('[VOICE_NOTE')) return 'Voice message';
    return content;
  };

  const ConversationListView = (
    <div className="flex flex-col gap-3 h-full">
      <div className="flex items-center gap-2">
        <label className="search flex-1">
          <Search className="i i-sm" aria-hidden />
          <input
            type="text"
            placeholder="Search chats or an ID"
            aria-label="Search chats or an ID"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="flex-1 min-w-0 bg-transparent border-0 outline-none text-vault-50 text-[15px]"
          />
        </label>
        <button type="button" onClick={() => setNewChatModalOpen(true)} className="ib ib-s" aria-label="New chat" title="Direct UID Connect">
          <UserPlus className="i" aria-hidden />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto -mx-1">
        {loading ? (
          <div role="status" aria-label="Loading chats">
            {[52, 40, 58, 36, 48].map((w, i) => (
              <div key={i} className="row">
                <div className="sk w-14 h-14 !rounded-full" />
                <div className="flex-1 flex flex-col gap-2.5">
                  <div className="sk h-3.5" style={{ width: `${w}%` }} />
                  <div className="sk h-3" style={{ width: `${w + 24}%` }} />
                </div>
              </div>
            ))}
          </div>
        ) : filteredConversations.length === 0 ? (
          <div className="flex flex-col items-center text-center gap-3 px-8 py-14">
            <div className="w-[72px] h-[72px] rounded-[22px] bg-vault-900 border border-vault-800 flex items-center justify-center text-[#34D399]">
              <MessageSquare className="w-8 h-8" aria-hidden />
            </div>
            <h2 className="t-h2 mt-2 mb-0">{searchQuery ? 'No matches' : 'No conversations yet'}</h2>
            <p className="t-sm c2 m-0">
              {searchQuery ? 'Try a different name or ID.' : 'Add someone by their ID, or share yours so they can add you.'}
            </p>
            {!searchQuery && (
              <button type="button" onClick={() => setNewChatModalOpen(true)} className="btn btn-p btn-block mt-3">
                Start a chat
              </button>
            )}
          </div>
        ) : (
          <ul aria-label="Conversations" className="list-none m-0 p-0 flex flex-col gap-0.5">
            {filteredConversations.map(c => {
              const isSelected = activeConversation?.id === c.id;
              const unread = c.unreadCount > 0;
              const preview = previewText(c.lastMessage?.content);
              const time = c.lastMessage ? formatTimestamp(c.lastMessage.created_at) : '';
              return (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => handleStartDirectChat(c.partner, c.id)}
                    aria-current={isSelected ? 'true' : undefined}
                    aria-label={`${c.partner.display_name}. ${preview}. ${time}${unread ? `. ${c.unreadCount} unread` : ''}`}
                    className={`row w-full text-left ${isSelected ? 'row-sel' : ''}`}
                  >
                    <Avatar name={c.partner.display_name} seed={c.partner.uid} src={c.partner.avatar_url} size={56} />
                    <span className="flex-1 min-w-0 flex flex-col gap-1">
                      <span className="flex justify-between items-baseline gap-2">
                        <span className="t-h3 truncate">{c.partner.display_name}</span>
                        <span className={`t-cap mono whitespace-nowrap ${unread ? 'cem' : ''}`}>{time}</span>
                      </span>
                      <span className="flex items-center gap-1.5 min-h-[22px]">
                        {c.lastMessage?.content.startsWith('[IMAGE]') && <ImageIcon className="i i-sm c2" aria-hidden />}
                        {c.lastMessage?.content.startsWith('[VOICE_NOTE') && <Mic className="i i-sm cem" aria-hidden />}
                        <span className={`t-sm flex-1 truncate ${unread ? 'text-vault-50' : 'c2'}`}>{preview}</span>
                        {unread && <span className="badge">{c.unreadCount}</span>}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );

  // Exactly one ChatRoom is mounted for the active conversation. The desktop split view and the
  // mobile single view are chosen in code, not hidden with CSS, so two ChatRooms (and two realtime
  // subscriptions for the same conversation) can never exist at once. `key` remounts the room when
  // the conversation changes, so the previous room's subscription is always cleaned up first.
  const activeChat = activeConversation ? (
    <ChatRoom
      key={activeConversation.id}
      conversationId={activeConversation.id}
      partner={activeConversation.partner}
      onBack={() => setActiveConversation(null)}
      initialAttachment={initialAttachment}
      onClearInitialAttachment={onClearInitialAttachment}
    />
  ) : null;

  return (
    <div className="animate-fade-in w-full">
      {isDesktop ? (
        /* Desktop 2-Pane Split View (≥ 1024px) */
        <div className="grid grid-cols-12 gap-4 h-[calc(100vh-140px)]">
          {/* Left Column: Conversations List (5 cols) */}
          <div className="col-span-5 h-full overflow-hidden flex flex-col bg-[#050505] p-2 rounded-2xl border border-[#1E2025]">
            {ConversationListView}
          </div>

          {/* Right Column: Active Chat Stream (7 cols) */}
          <div className="col-span-7 h-full">
            {activeChat ?? (
              <div className="h-full bg-[#050505] border border-[#1E2025] rounded-2xl flex flex-col items-center justify-center p-8 text-center space-y-3">
                <div className="w-16 h-16 rounded-2xl bg-[#0C0D0F] border border-[#1E2025] flex items-center justify-center text-[#10B981]">
                  <MessageSquare className="w-8 h-8" aria-hidden />
                </div>
                <h3 className="t-h2 m-0">Select a conversation</h3>
                <p className="t-sm c2 max-w-sm m-0">Choose a chat on the left, or start a new one with someone's ID.</p>
              </div>
            )}
          </div>
        </div>
      ) : (
        /* Mobile Single View (< 1024px) */
        <div className="pb-20">{activeChat ?? ConversationListView}</div>
      )}

      {/* Direct UID Connect Modal */}
      {newChatModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-[#0C0D0F] border border-[#1E2025] rounded-2xl p-6 max-w-sm w-full space-y-4 animate-fade-in shadow-2xl">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-[#10B981]" />
                <h3 className="text-sm font-bold text-white">Direct Sovereign Connect</h3>
              </div>
              <button
                onClick={() => setNewChatModalOpen(false)}
                className="text-vault-500 hover:text-white text-sm"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-[#A7ABB3]">
              Enter the peer's unique UID tag (e.g. <span className="font-mono text-white">CIPHER-1082</span> or <span className="font-mono text-white">SOLAR-8120</span>) to open an encrypted channel.
            </p>

            <form onSubmit={handleCreateChatByUid} className="space-y-3">
              <input
                type="text"
                placeholder="Enter UID..."
                value={newChatUidInput}
                onChange={e => setNewChatUidInput(e.target.value)}
                className="w-full py-2.5 px-4 bg-[#131417] border border-[#1E2025] focus:border-[#10B981] rounded-xl text-white font-mono text-sm placeholder:text-vault-500 focus:outline-none"
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

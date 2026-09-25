import React, { useState, useEffect, useCallback, useRef } from 'react';
import { MessageSquare, Search, Pin, UserPlus, Lock, Camera } from 'lucide-react';
import { ConversationItem, UserProfile } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { mockBackend } from '../../lib/mockBackend';
import { supabase, isSupabaseConfigured } from '../../lib/supabase';
import { buildInviteLink, extractUidFromInput } from '../../lib/invite';
import { ChatRoom } from './ChatRoom';
import { PinnedContact } from './messagesView/PinnedContact';
import { ConversationRow } from './messagesView/ConversationRow';
import { AddFriendModal } from './messagesView/AddFriendModal';

interface MessagesViewProps {
  initialPartnerId?: string | null;
  initialAttachment?: string | null;
  onClearInitialPartner?: () => void;
  onClearInitialAttachment?: () => void;
  onSelectConversationForDesktop?: (partner: UserProfile, convId: string) => void;
  onChatActiveChange?: (active: boolean) => void;
  onOpenCamera?: () => void;
}

export const MessagesView: React.FC<MessagesViewProps> = ({
  initialPartnerId,
  initialAttachment,
  onClearInitialPartner,
  onClearInitialAttachment,
  onSelectConversationForDesktop,
  onChatActiveChange,
  onOpenCamera,
}) => {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [conversations, setConversations] = useState<ConversationItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeConversation, setActiveConversation] = useState<{
    id: string;
    partner: UserProfile;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [newChatUidInput, setNewChatUidInput] = useState('');
  const [newChatModalOpen, setNewChatModalOpen] = useState(false);
  const [inviteQrDataUrl, setInviteQrDataUrl] = useState<string | null>(null);
  const activeConversationRef = useRef(activeConversation);
  useEffect(() => {
    activeConversationRef.current = activeConversation;
  }, [activeConversation]);

  useEffect(() => {
    if (!newChatModalOpen || !user?.uid) return;
    let cancelled = false;
    import('qrcode')
      .then(({ default: QRCode }) =>
        QRCode.toDataURL(buildInviteLink(user.uid), {
          width: 200,
          margin: 1,
          color: { dark: '#0A0A0A', light: '#FFFFFF' },
        })
      )
      .then(dataUrl => {
        if (!cancelled) setInviteQrDataUrl(dataUrl);
      })
      .catch(err => console.error('Failed to generate invite QR code:', err));
    return () => {
      cancelled = true;
    };
  }, [newChatModalOpen, user?.uid]);

  const copyInviteLink = () => {
    if (!user?.uid) return;
    navigator.clipboard.writeText(buildInviteLink(user.uid));
    showToast('Invite link copied to clipboard', 'success');
  };

  const loadConversations = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      if (isSupabaseConfigured()) {
        const { data: rawRows, error } = await supabase.rpc('get_chat_list');
        if (error) throw error;

        const rows = (rawRows ?? []) as unknown as {
          conversation_id: string;
          partner_id: string;
          created_at: string;
          updated_at: string;
          last_message_id: string | null;
          last_message_content: string | null;
          last_message_sender_id: string | null;
          last_message_at: string | null;
          last_message_is_read: boolean | null;
          unread_count: number;
          pinned_at: string | null;
          disappear_after_seconds: number | null;
          chat_theme: string;
        }[];

        if (rows.length > 0) {
          const partnerIds = rows.map(r => r.partner_id);
          const { data: rawProfiles } = await supabase.from('profiles').select('*').in('id', partnerIds);
          const profiles = (rawProfiles || []) as unknown as UserProfile[];

          const formatted: ConversationItem[] = rows.map(r => {
            const partner = profiles?.find(p => p.id === r.partner_id) || {
              id: r.partner_id,
              uid: 'UNKNOWN',
              display_name: 'Contact',
              avatar_url: null,
              role: 'user',
              status: 'active',
              created_at: '',
              updated_at: '',
            };

            return {
              id: r.conversation_id,
              user_a: user.id,
              user_b: r.partner_id,
              created_at: r.created_at,
              updated_at: r.updated_at,
              partner: partner as ConversationItem['partner'],
              lastMessage: r.last_message_id
                ? {
                    id: r.last_message_id,
                    conversation_id: r.conversation_id,
                    sender_id: r.last_message_sender_id ?? '',
                    content: r.last_message_content ?? '',
                    is_read: r.last_message_is_read ?? false,
                    created_at: r.last_message_at ?? r.updated_at,
                  }
                : undefined,
              unreadCount: r.unread_count,
              pinnedAt: r.pinned_at,
              disappearAfterSeconds: r.disappear_after_seconds,
              chatTheme: r.chat_theme,
            };
          });
          setConversations(formatted);
          if (
            !activeConversationRef.current &&
            formatted.length > 0 &&
            typeof window !== 'undefined' &&
            window.innerWidth >= 1024
          ) {
            const target = { id: formatted[0].id, partner: formatted[0].partner };
            activeConversationRef.current = target;
            setActiveConversation(target);
            onSelectConversationForDesktop?.(target.partner, target.id);
          }
        } else {
          setConversations([]);
        }
      } else {
        const list = mockBackend.getConversations(user.id);
        setConversations(list);
        if (
          !activeConversationRef.current &&
          list.length > 0 &&
          typeof window !== 'undefined' &&
          window.innerWidth >= 1024
        ) {
          const target = { id: list[0].id, partner: list[0].partner };
          activeConversationRef.current = target;
          setActiveConversation(target);
          onSelectConversationForDesktop?.(target.partner, target.id);
        }
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
        .channel(`public:conversations_messages:${crypto.randomUUID()}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, () => {
          loadConversations();
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'conversation_members' }, () => {
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
                  if (onSelectConversationForDesktop) onSelectConversationForDesktop(partner, conv.id);
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
  }, [initialPartnerId, conversations, user, onClearInitialPartner, onSelectConversationForDesktop, loadConversations]);

  const handleStartDirectChat = (partner: UserProfile, convId: string) => {
    setActiveConversation({ id: convId, partner });
    if (onSelectConversationForDesktop) {
      onSelectConversationForDesktop(partner, convId);
    }
  };

  const handleTogglePin = async (conversationId: string, pinned: boolean) => {
    if (!isSupabaseConfigured()) {
      showToast('Pinning requires the live server', 'info');
      return;
    }
    // Optimistic; loadConversations (triggered by the realtime subscription) reconciles it.
    setConversations(prev =>
      prev.map(c => (c.id === conversationId ? { ...c, pinnedAt: pinned ? new Date().toISOString() : null } : c))
    );
    const { error } = await supabase.rpc('set_chat_pinned', { p_conversation_id: conversationId, p_pinned: pinned });
    if (error) {
      console.error('Pin chat error:', error);
      showToast(error.message || 'Could not update pin', 'error');
      loadConversations();
    }
  };

  const handleCreateChatByUid = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newChatUidInput.trim() || !user) return;
    const cleanUid = extractUidFromInput(newChatUidInput);

    if (user.uid === cleanUid) {
      showToast("That's your own invite link or UID.", 'error');
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
          showToast(`No one found with that invite link or UID "${cleanUid}"`, 'error');
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
        showToast('Failed to initialize encrypted channel with peer', 'error');
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
        showToast(`No one found with that invite link or UID "${cleanUid}"`, 'error');
      }
    }
  };

  useEffect(() => {
    if (onChatActiveChange) onChatActiveChange(!!activeConversation);
  }, [activeConversation, onChatActiveChange]);

  useEffect(() => {
    return () => {
      if (onChatActiveChange) onChatActiveChange(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filteredConversations = conversations.filter(c => {
    const q = searchQuery.toLowerCase();
    return (
      c.partner.display_name.toLowerCase().includes(q) ||
      (c.partner.uid && c.partner.uid.toLowerCase().includes(q))
    );
  });
  const pinnedConversations = conversations.filter(c => c.pinnedAt);

  // Mobile Viewport: if conversation is active, show only ChatRoom
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 1024;
  if (isMobile && activeConversation) {
    return (
      <div className="fixed inset-0 z-40 bg-[#0A0A0A] lg:hidden">
        <ChatRoom
          conversationId={activeConversation.id}
          partner={activeConversation.partner}
          onBack={() => setActiveConversation(null)}
        />
      </div>
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

        {onOpenCamera && (
          <button
            onClick={onOpenCamera}
            className="flex items-center justify-center p-2.5 bg-[#171717] hover:bg-[#222222] border border-[#262626] hover:border-[#10B981] rounded-xl text-zinc-300 hover:text-[#10B981] transition-all active:scale-95"
            title="Open Camera"
          >
            <Camera className="w-4 h-4" />
          </button>
        )}

        <button
          onClick={() => setNewChatModalOpen(true)}
          className="flex items-center justify-center p-2.5 bg-[#171717] hover:bg-[#222222] border border-[#262626] hover:border-[#10B981] rounded-xl text-[#10B981] transition-all active:scale-95"
          title="Direct UID Connect"
        >
          <UserPlus className="w-4 h-4" />
        </button>
      </div>

      {/* Pinned Contacts Carousel */}
      {pinnedConversations.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-1.5 px-1 text-xs text-zinc-500 font-semibold">
            <Pin className="w-3 h-3 text-[#10B981]" />
            <span>PINNED CHATS</span>
          </div>

          <div className="flex items-center gap-2.5 overflow-x-auto pb-1 scrollbar-none">
            {pinnedConversations.map(c => (
              <PinnedContact
                key={c.id}
                conversation={c}
                isSelected={activeConversation?.id === c.id}
                onClick={() => handleStartDirectChat(c.partner, c.id)}
              />
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
              Share your invite link or scan a friend's QR code to connect.
            </p>
            <button
              onClick={() => setNewChatModalOpen(true)}
              className="px-4 py-2 bg-[#10B981] hover:bg-emerald-400 text-black text-xs font-bold rounded-xl shadow-lg transition-all"
            >
              Add a Friend
            </button>
          </div>
        ) : (
          <div className="space-y-1.5">
            {filteredConversations.map(c => (
              <ConversationRow
                key={c.id}
                conversation={c}
                isSelected={activeConversation?.id === c.id}
                onClick={() => handleStartDirectChat(c.partner, c.id)}
                onTogglePin={() => handleTogglePin(c.id, !c.pinnedAt)}
              />
            ))}
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
              initialAttachment={initialAttachment}
              onClearInitialAttachment={onClearInitialAttachment}
            />
          ) : (
            <div className="h-full bg-[#0A0A0A] border border-[#262626] rounded-2xl flex flex-col items-center justify-center p-8 text-center space-y-3">
              <div className="w-16 h-16 rounded-2xl bg-[#111111] border border-[#262626] flex items-center justify-center text-[#10B981]">
                <Lock className="w-8 h-8" />
              </div>
              <h3 className="text-base font-bold text-white">Your messages are private</h3>
              <p className="text-xs text-[#A1A1AA] max-w-sm">
                Select a conversation from the left, or tap the <span className="text-[#10B981] font-semibold">add-friend</span> icon above to invite someone new.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Mobile Single View (< 1024px) */}
      <div className="lg:hidden pb-20">
        {activeConversation ? (
          <ChatRoom
            conversationId={activeConversation.id}
            partner={activeConversation.partner}
            onBack={() => setActiveConversation(null)}
            initialAttachment={initialAttachment}
            onClearInitialAttachment={onClearInitialAttachment}
          />
        ) : (
          ConversationListView
        )}
      </div>

      {/* Add Friend Modal */}
      {newChatModalOpen && (
        <AddFriendModal
          onClose={() => setNewChatModalOpen(false)}
          inviteQrDataUrl={inviteQrDataUrl}
          onCopyInviteLink={copyInviteLink}
          newChatUidInput={newChatUidInput}
          setNewChatUidInput={setNewChatUidInput}
          onSubmit={handleCreateChatByUid}
        />
      )}
    </div>
  );
};

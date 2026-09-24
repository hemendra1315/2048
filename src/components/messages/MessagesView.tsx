import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  MessageSquare,
  Search,
  Image as ImageIcon,
  Mic,
  UserPlus,
  ShieldCheck,
  X,
  Pin,
  PinOff,
  Timer,
} from 'lucide-react';
import { ConversationItem, UserProfile } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { mockBackend } from '../../lib/mockBackend';
import { supabase, isSupabaseConfigured } from '../../lib/supabase';
import { uniqueChannelName } from '../../lib/realtime';
import { formatTimestamp } from '../../lib/utils';
import { ChatRoom } from './ChatRoom';
import { ContactDossier } from './ContactDossier';
import { Avatar } from '../common/Avatar';
import { useMediaQuery, DESKTOP_QUERY } from '../../lib/useMediaQuery';
import { usePresence } from '../../lib/presence';
import { extraPreview } from '../../lib/chatExtras';
import { useToast } from '../../context/ToastContext';
import { useBackHandler } from '../../lib/backButton';

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
  const { showToast } = useToast();
  const [pinTarget, setPinTarget] = useState<ConversationItem | null>(null);
  const presence = usePresence(conversations.map(c => c.partner.id));

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
        // One call returns every chat with its last message, unread count, pin and timer.
        const { data: rows, error } = await supabase.rpc('get_chat_list');
        if (error) throw error;
        const list = (rows ?? []) as unknown as {
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
        }[];

        if (list.length > 0) {
          const partnerIds = [...new Set(list.map(r => r.partner_id))];
          const { data: rawProfiles } = await supabase.from('profiles').select('*').in('id', partnerIds);
          const profiles = (rawProfiles || []) as unknown as UserProfile[];

          const formatted: ConversationItem[] = list.map(r => {
            const partner = profiles.find(p => p.id === r.partner_id) || {
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
                    is_read: Boolean(r.last_message_is_read),
                    created_at: r.last_message_at ?? r.updated_at,
                  }
                : undefined,
              unreadCount: r.unread_count,
              pinnedAt: r.pinned_at,
              disappearAfterSeconds: r.disappear_after_seconds,
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
      let reloadTimer: ReturnType<typeof setTimeout> | undefined;
      const channel = supabase
        .channel(uniqueChannelName('conversations_messages'))
        .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, () => {
          // Several changes often arrive together (message + read receipt); reload once.
          if (reloadTimer) clearTimeout(reloadTimer);
          reloadTimer = setTimeout(() => void loadConversations(), 400);
        })
        .subscribe();
      return () => {
        if (reloadTimer) clearTimeout(reloadTimer);
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
          alert(`No user found with UID/Username "${cleanUid}"`);
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
        alert(`No user found with UID "${cleanUid}"`);
      }
    }
  };

  const togglePin = async (c: ConversationItem) => {
    setPinTarget(null);
    const pin = !c.pinnedAt;
    const { error } = await supabase.rpc('set_chat_pinned', { p_conversation_id: c.id, p_pinned: pin });
    if (error) {
      showToast(error.message || 'Could not update pin', 'error');
      return;
    }
    showToast(pin ? `Pinned ${c.partner.display_name}` : 'Chat unpinned', 'success');
    void loadConversations();
  };

  const filteredConversations = conversations.filter(c => {
    const q = searchQuery.toLowerCase();
    return (
      c.partner.display_name.toLowerCase().includes(q) ||
      (c.partner.uid && c.partner.uid.toLowerCase().includes(q))
    );
  });

  const previewText = (content?: string) => {
    if (!content) return 'Say hi';
    if (content === '[DELETED]') return 'Message deleted';
    if (content.startsWith('[SYSTEM:disappearing:off')) return 'Disappearing messages turned off';
    if (content.startsWith('[SYSTEM:disappearing:')) return 'Disappearing messages turned on';
    const extra = extraPreview(content);
    if (extra) return extra;
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
        <button
          type="button"
          onClick={() => setNewChatModalOpen(true)}
          className="ib ib-s"
          aria-label="New chat"
          title="Direct UID Connect"
        >
          <UserPlus className="i" aria-hidden />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto -mx-1">
        {loading ? (
          <div role="status" aria-label="Loading chats">
            {[52, 40, 58, 36, 48].map((w, i) => (
              <div key={i} className="row">
                <div className="sk w-12 h-12 !rounded-full" />
                <div className="flex-1 flex flex-col gap-2">
                  <div className="sk h-3.5" style={{ width: `${w}%` }} />
                  <div className="sk h-3" style={{ width: `${w + 24}%` }} />
                </div>
              </div>
            ))}
          </div>
        ) : filteredConversations.length === 0 ? (
          <div className="flex flex-col items-center text-center gap-3 px-6 py-12">
            <div className="w-14 h-14 rounded-2xl bg-vault-900 border border-vault-800 flex items-center justify-center text-emerald">
              <MessageSquare className="w-7 h-7" aria-hidden />
            </div>
            <h2 className="t-h3 mt-1 mb-0 text-white font-bold">{searchQuery ? 'No matches' : 'No conversations'}</h2>
            <p className="t-sm c2 m-0 text-xs">
              {searchQuery ? 'Try a different ID or handle.' : 'Start an encrypted thread with a contact UID.'}
            </p>
            {!searchQuery && (
              <button type="button" onClick={() => setNewChatModalOpen(true)} className="btn btn-p btn-sm btn-block mt-2">
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
                <li key={c.id} className="relative group">
                  <button
                    type="button"
                    onClick={() => handleStartDirectChat(c.partner, c.id)}
                    onContextMenu={e => {
                      if (!isSupabaseConfigured()) return;
                      e.preventDefault();
                      setPinTarget(c);
                    }}
                    aria-current={isSelected ? 'true' : undefined}
                    aria-label={`${c.partner.display_name}. ${preview}. ${time}${unread ? `. ${c.unreadCount} unread` : ''}`}
                    className={`row w-full text-left p-2.5 rounded-xl transition-colors ${
                      isSelected ? 'bg-vault-850 border border-vault-750' : 'hover:bg-vault-900 border border-transparent'
                    }`}
                  >
                    <Avatar
                      name={c.partner.display_name}
                      seed={c.partner.uid}
                      src={c.partner.avatar_url}
                      size={48}
                      online={presence[c.partner.id]?.isOnline ?? false}
                    />
                    <span className="flex-1 min-w-0 flex flex-col gap-0.5 ml-1">
                      <span className="flex justify-between items-baseline gap-2">
                        <span className="t-body font-bold text-white truncate flex items-center gap-1 min-w-0">
                          <span className="truncate">{c.partner.display_name}</span>
                          {c.pinnedAt && <Pin className="w-3 h-3 text-emerald shrink-0" aria-label="Pinned" />}
                          {c.disappearAfterSeconds ? <Timer className="w-3 h-3 text-vault-400 shrink-0" aria-label="Disappearing messages on" /> : null}
                        </span>
                        <span className={`t-cap mono whitespace-nowrap text-[11px] ${unread ? 'cem' : 'c3'}`}>{time}</span>
                      </span>
                      <span className="flex items-center gap-1.5 min-h-[20px]">
                        {c.lastMessage?.content.startsWith('[IMAGE]') && <ImageIcon className="w-3.5 h-3.5 text-vault-400" aria-hidden />}
                        {c.lastMessage?.content.startsWith('[VOICE_NOTE') && <Mic className="w-3.5 h-3.5 text-emerald" aria-hidden />}
                        <span className={`t-sm text-xs flex-1 truncate ${unread ? 'text-white font-medium' : 'c2'}`}>{preview}</span>
                        {unread && <span className="badge !h-5 !min-w-5 !text-[10px]">{c.unreadCount}</span>}
                      </span>
                    </span>
                  </button>
                  {isSupabaseConfigured() && (
                    <button
                      type="button"
                      onClick={() => void togglePin(c)}
                      className="hidden md:flex absolute right-1.5 top-1.5 w-7 h-7 rounded-full items-center justify-center bg-vault-900 border border-vault-750 text-vault-300 opacity-0 group-hover:opacity-100 focus:opacity-100"
                      aria-label={c.pinnedAt ? `Unpin ${c.partner.display_name}` : `Pin ${c.partner.display_name}`}
                      title={c.pinnedAt ? 'Unpin chat' : 'Pin chat'}
                    >
                      {c.pinnedAt ? <PinOff className="w-3.5 h-3.5" aria-hidden /> : <Pin className="w-3.5 h-3.5" aria-hidden />}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );

  useBackHandler(newChatModalOpen, () => setNewChatModalOpen(false));
  useBackHandler(Boolean(pinTarget), () => setPinTarget(null));

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

  const pinSheet = pinTarget ? (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Chat options"
      className="fixed inset-0 z-50 bg-black/70 flex items-end sm:items-center justify-center anim-fade"
      onClick={() => setPinTarget(null)}
      onKeyDown={e => { if (e.key === 'Escape') setPinTarget(null); }}
    >
      <div className="w-full sm:max-w-sm bg-vault-900 border border-vault-800 rounded-t-2xl sm:rounded-2xl p-2 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-2xl" onClick={e => e.stopPropagation()}>
        <p className="px-4 pt-2 pb-2 text-xs text-vault-400 truncate">{pinTarget.partner.display_name}</p>
        <button
          type="button"
          onClick={() => void togglePin(pinTarget)}
          className="w-full flex items-center gap-3 px-4 min-h-[48px] text-sm text-white hover:bg-vault-800 rounded-xl"
        >
          {pinTarget.pinnedAt ? <PinOff className="w-4 h-4" aria-hidden /> : <Pin className="w-4 h-4" aria-hidden />}
          {pinTarget.pinnedAt ? 'Unpin chat' : 'Pin to top'}
        </button>
      </div>
    </div>
  ) : null;

  return (
    <div className="animate-fade-in w-full h-full">
      {pinSheet}
      {isDesktop ? (
        /* Desktop 3-Column Balanced Layout (Nav/Chats 260px | Dossier 350px | Active Chat Fluid min-720px) */
        <div className="flex h-full w-full overflow-hidden rounded-2xl border border-vault-800 bg-vault-950 shadow-2xl">
          {/* Left Column: Conversations List (260px fixed) */}
          <aside className="w-[260px] shrink-0 h-full overflow-hidden flex flex-col bg-vault-950 p-3 border-r border-vault-800">
            {ConversationListView}
          </aside>

          {/* Center Column: Contact Profile & Shared Media Dossier (340-350px fixed) */}
          {activeConversation ? (
            <ContactDossier
              partner={activeConversation.partner}
              conversationId={activeConversation.id}
            />
          ) : (
            <div className="w-[340px] shrink-0 h-full bg-vault-900 border-r border-vault-800 p-6 flex flex-col items-center justify-center text-center gap-2">
              <ShieldCheck className="w-10 h-10 text-vault-600" />
              <p className="t-cap text-vault-400 m-0">No active contact selected</p>
            </div>
          )}

          {/* Right Column: Active Chat Stream (flex-1 min-w-[720px]) */}
          <main className="flex-1 min-w-[500px] xl:min-w-[720px] h-full overflow-hidden flex flex-col bg-vault-950">
            {activeChat ?? (
              <div className="h-full bg-vault-950 flex flex-col items-center justify-center p-8 text-center gap-3">
                <div className="w-16 h-16 rounded-2xl bg-vault-900 border border-vault-800 flex items-center justify-center text-emerald shadow-sm">
                  <MessageSquare className="w-8 h-8" aria-hidden />
                </div>
                <h3 className="t-h2 m-0 text-white font-bold">Select a conversation</h3>
                <p className="t-sm c2 max-w-sm m-0">
                  Choose a chat on the left or start a new conversation using a contact UID.
                </p>
              </div>
            )}
          </main>
        </div>
      ) : (
        /* Mobile Single View (< 1024px) */
        <div className="h-full min-h-0 flex flex-col">{activeChat ?? ConversationListView}</div>
      )}

      {/* Direct UID Connect Modal */}
      {newChatModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-vault-900 border border-vault-750 rounded-2xl p-6 max-w-sm w-full space-y-4 animate-fade-in shadow-2xl">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-emerald" />
                <h3 className="text-sm font-bold text-white m-0">Direct Connect</h3>
              </div>
              <button
                type="button"
                onClick={() => setNewChatModalOpen(false)}
                className="ib"
                aria-label="Close"
              >
                <X className="i" aria-hidden />
              </button>
            </div>

            <p className="text-xs text-vault-400 m-0">
              Enter the peer's unique UID tag (e.g. <span className="font-mono text-white">CIPHER-1082</span> or <span className="font-mono text-white">SOLAR-8120</span>) to open an encrypted channel.
            </p>

            <form onSubmit={handleCreateChatByUid} className="space-y-3">
              <input
                type="text"
                placeholder="Enter UID..."
                value={newChatUidInput}
                onChange={e => setNewChatUidInput(e.target.value)}
                className="w-full py-2.5 px-4 bg-vault-950 border border-vault-700 focus:border-emerald rounded-xl text-white font-mono text-sm placeholder:text-vault-500 focus:outline-none"
              />

              <button
                type="submit"
                className="btn btn-p btn-block font-bold text-xs"
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

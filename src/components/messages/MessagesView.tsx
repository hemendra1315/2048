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
  Bell,
  BellOff,
  Trash2,
  MailOpen,
  RotateCcw,
  Users,
  Plus,
  Check,
} from 'lucide-react';
import { ConversationItem, UserProfile } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { mockBackend } from '../../lib/mockBackend';
import { supabase, isSupabaseConfigured } from '../../lib/supabase';
import { createGroupChat } from '../../lib/groupChatApi';
import { uniqueChannelName } from '../../lib/realtime';
import { formatTimestamp } from '../../lib/utils';
import { ChatRoom } from './ChatRoom';
import { ContactDossier } from './ContactDossier';
import { Avatar } from '../common/Avatar';
import { useMediaQuery, DESKTOP_QUERY } from '../../lib/useMediaQuery';
import { usePresence } from '../../lib/presence';
import { readableMessagePreview } from '../../lib/chatExtras';
import { useToast } from '../../context/ToastContext';
import { mediumImpact, lightImpact } from '../../lib/haptics';
import { useBackHandler } from '../../lib/backButton';

interface MessagesViewProps {
  initialPartnerId?: string | null;
  initialAttachment?: string | null;
  onClearInitialPartner?: () => void;
  onClearInitialAttachment?: () => void;
  onSelectConversationForDesktop?: (partner: UserProfile, convId: string) => void;
  /** On a phone, an open chat should fill the screen — no app title, tab bar, or admin/lock
   * buttons competing with it. This tells the parent when that's the case so it can hide its own
   * chrome; on desktop the chat is one column among three and the parent ignores it. */
  onActiveChatChange?: (active: boolean) => void;
}

export const MessagesView: React.FC<MessagesViewProps> = ({
  initialPartnerId,
  initialAttachment,
  onClearInitialPartner,
  onClearInitialAttachment,
  onSelectConversationForDesktop,
  onActiveChatChange,
}) => {
  const { user } = useAuth();
  const [conversations, setConversations] = useState<ConversationItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeConversation, setActiveConversation] = useState<{
    id: string;
    partner: UserProfile;
    is_group?: boolean;
    group_name?: string | null;
    group_avatar_url?: string | null;
    group_description?: string | null;
  } | null>(null);

  useEffect(() => {
    onActiveChatChange?.(Boolean(activeConversation));
    return () => onActiveChatChange?.(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [Boolean(activeConversation)]);
  const [loading, setLoading] = useState(true);
  const [newChatUidInput, setNewChatUidInput] = useState('');
  const [newChatModalOpen, setNewChatModalOpen] = useState(false);
  const [newChatTab, setNewChatTab] = useState<'direct' | 'group'>('direct');
  const [groupNameInput, setGroupNameInput] = useState('');
  const [groupMemberUidInput, setGroupMemberUidInput] = useState('');
  const [selectedGroupMembers, setSelectedGroupMembers] = useState<UserProfile[]>([]);
  const isDesktop = useMediaQuery(DESKTOP_QUERY);
  const { showToast } = useToast();
  const [pinTarget, setPinTarget] = useState<ConversationItem | null>(null);
  const [swipedId, setSwipedId] = useState<string | null>(null);
  const swipeRef = useRef<{ id: string; startX: number; startY: number; dx: number; locked: 'x' | 'y' | null } | null>(null);
  const presence = usePresence(conversations.map(c => c.partner.id));

  const handleRowTouchStart = (e: React.TouchEvent, id: string) => {
    const t = e.touches[0];
    swipeRef.current = { id, startX: t.clientX, startY: t.clientY, dx: 0, locked: null };
  };
  const handleRowTouchMove = (e: React.TouchEvent) => {
    const s = swipeRef.current;
    if (!s) return;
    const t = e.touches[0];
    const dx = t.clientX - s.startX;
    const dy = t.clientY - s.startY;
    if (!s.locked) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      s.locked = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
    }
    if (s.locked !== 'x') return;
    s.dx = dx;
  };
  const handleRowTouchEnd = () => {
    const s = swipeRef.current;
    swipeRef.current = null;
    if (!s || s.locked !== 'x') return;
    if (s.dx < -40) setSwipedId(s.id);
    else if (s.dx > 40 && swipedId === s.id) setSwipedId(null);
  };

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
          muted_at: string | null;
          disappear_after_seconds: number | null;
          is_group?: boolean;
          group_name?: string | null;
          group_avatar_url?: string | null;
          group_description?: string | null;
          member_count?: number;
        }[];

        if (list.length > 0) {
          const directPartnerIds = [
            ...new Set(list.filter(r => !r.is_group).map(r => r.partner_id).filter(Boolean)),
          ];
          const { data: rawProfiles, error: profilesError } = directPartnerIds.length > 0
            ? await supabase.from('profiles').select('*').in('id', directPartnerIds)
            : { data: [], error: null };
          if (profilesError) {
            console.warn('[messages] could not load partner profiles; showing placeholders', profilesError);
          }
          const profiles = (rawProfiles || []) as unknown as UserProfile[];

          const formatted: ConversationItem[] = list.map(r => {
            const isGroup = Boolean(r.is_group);
            const partner = isGroup
              ? ({
                  id: r.conversation_id,
                  uid: 'GROUP',
                  display_name: r.group_name || 'Group Chat',
                  avatar_url: r.group_avatar_url || null,
                  role: 'user',
                  status: 'active',
                  created_at: r.created_at,
                  updated_at: r.updated_at,
                } as UserProfile)
              : profiles.find(p => p.id === r.partner_id) || {
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
              user_b: isGroup ? r.conversation_id : r.partner_id,
              created_at: r.created_at,
              updated_at: r.updated_at,
              partner: partner as ConversationItem['partner'],
              is_group: isGroup,
              group_name: r.group_name,
              group_avatar_url: r.group_avatar_url,
              group_description: r.group_description,
              member_count: r.member_count,
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
              mutedAt: r.muted_at,
              disappearAfterSeconds: r.disappear_after_seconds,
            };
          });
          const sorted = [...formatted].sort(
            (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
          );
          setConversations(sorted);
          autoSelectFirstOnDesktop(sorted);
        } else {
          setConversations([]);
          autoSelectFirstOnDesktop([]);
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

  const handleStartDirectChat = (partner: UserProfile, convId: string, convItem?: ConversationItem) => {
    // Optimistically clear unread badge immediately (Instagram style)
    setConversations(prev => prev.map(c => c.id === convId ? { ...c, unreadCount: 0 } : c));
    if (isSupabaseConfigured()) {
      void supabase.rpc('mark_conversation_read', { p_conversation_id: convId }).then(() => undefined, () => undefined);
    } else if (user) {
      mockBackend.markMessagesAsRead(convId, user.id);
    }

    setActiveConversation({
      id: convId,
      partner,
      is_group: convItem?.is_group,
      group_name: convItem?.group_name,
      group_avatar_url: convItem?.group_avatar_url,
      group_description: convItem?.group_description,
    });
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

  const handleAddMemberToGroup = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!groupMemberUidInput.trim()) return;
    const cleanUid = groupMemberUidInput.trim().toUpperCase();

    if (user?.uid === cleanUid) {
      showToast('You are automatically included in the group', 'info');
      return;
    }

    if (selectedGroupMembers.some(m => m.uid.toUpperCase() === cleanUid || (m.username && m.username.toUpperCase() === cleanUid))) {
      showToast('Member already added', 'info');
      return;
    }

    let targetProfile: UserProfile | null = null;
    if (isSupabaseConfigured()) {
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('*')
          .or(`uid.eq.${cleanUid},username.eq.${cleanUid.toLowerCase()}`)
          .maybeSingle();
        if (!error && data) {
          targetProfile = data as unknown as UserProfile;
        }
      } catch (err) {
        console.error('Error finding profile for group:', err);
      }
    }

    if (!targetProfile) {
      const all = mockBackend.getProfiles();
      targetProfile = all.find(
        p => p.uid.toUpperCase() === cleanUid || (p.username && p.username.toUpperCase() === cleanUid)
      ) || null;
    }

    if (targetProfile) {
      setSelectedGroupMembers(prev => [...prev, targetProfile!]);
      setGroupMemberUidInput('');
      lightImpact();
      showToast(`Added ${targetProfile.display_name}`, 'success');
    } else {
      showToast(`No user found with UID "${cleanUid}"`, 'error');
    }
  };

  const handleToggleContactForGroup = (contact: UserProfile) => {
    if (contact.id === user?.id) return;
    lightImpact();
    setSelectedGroupMembers(prev => {
      const exists = prev.some(m => m.id === contact.id);
      if (exists) {
        return prev.filter(m => m.id !== contact.id);
      } else {
        return [...prev, contact];
      }
    });
  };

  const handleCreateGroupChat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!groupNameInput.trim()) {
      showToast('Please enter a group name', 'info');
      return;
    }
    if (selectedGroupMembers.length === 0) {
      showToast('Please select at least 1 member for the group', 'info');
      return;
    }

    const cleanName = groupNameInput.trim();
    const memberIds = selectedGroupMembers.map(m => m.id);

    try {
      if (isSupabaseConfigured()) {
        const convId = await createGroupChat(cleanName, memberIds);
        await loadConversations();
        const targetPartner: UserProfile = {
          id: convId,
          uid: 'GROUP',
          display_name: cleanName,
          avatar_url: null,
          role: 'user',
          status: 'active',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        setActiveConversation({ id: convId, partner: targetPartner });
        notifyDesktopSelection(targetPartner, convId);
      } else {
        const newConv = mockBackend.createGroupConversation(user.id, cleanName, memberIds);
        void loadConversations();
        setActiveConversation({ id: newConv.id, partner: newConv.partner });
        notifyDesktopSelection(newConv.partner, newConv.id);
      }
      setNewChatModalOpen(false);
      setGroupNameInput('');
      setSelectedGroupMembers([]);
      setGroupMemberUidInput('');
      mediumImpact();
      showToast(`Created group "${cleanName}" 🎉`, 'success');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to create group';
      showToast(msg, 'error');
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

  const toggleMute = async (c: ConversationItem) => {
    setPinTarget(null);
    setSwipedId(null);
    const mute = !c.mutedAt;
    const { error } = await supabase.rpc('set_chat_muted', { p_conversation_id: c.id, p_muted: mute });
    if (error) {
      showToast(error.message || 'Could not update mute', 'error');
      return;
    }
    showToast(mute ? `Muted ${c.partner.display_name}` : 'Chat unmuted', 'success');
    void loadConversations();
  };

  const hideConversation = async (c: ConversationItem) => {
    setPinTarget(null);
    setSwipedId(null);
    if (activeConversation?.id === c.id) setActiveConversation(null);
    const { error } = await supabase.rpc('set_chat_hidden', { p_conversation_id: c.id, p_hidden: true });
    if (error) {
      showToast(error.message || 'Could not delete chat', 'error');
      return;
    }
    showToast('Chat deleted', 'success');
    void loadConversations();
  };

  const markUnread = async (c: ConversationItem) => {
    setPinTarget(null);
    const { error } = await supabase.rpc('mark_conversation_unread', { p_conversation_id: c.id });
    if (error) {
      showToast(error.message || 'Could not mark as unread', 'error');
      return;
    }
    void loadConversations();
  };

  // Pull to refresh (only engages when the list is already scrolled to the top)
  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const listScrollRef = useRef<HTMLDivElement>(null);
  const pullStartRef = useRef<number | null>(null);
  const PULL_TRIGGER = 64;

  const handleListTouchStart = (e: React.TouchEvent) => {
    if (isRefreshing || (listScrollRef.current?.scrollTop ?? 0) > 0) return;
    pullStartRef.current = e.touches[0].clientY;
  };
  const handleListTouchMove = (e: React.TouchEvent) => {
    if (pullStartRef.current === null) return;
    const dy = e.touches[0].clientY - pullStartRef.current;
    if (dy > 0 && (listScrollRef.current?.scrollTop ?? 0) <= 0) {
      setPullDistance(Math.min(96, dy * 0.5));
    }
  };
  const handleListTouchEnd = async () => {
    if (pullDistance >= PULL_TRIGGER && !isRefreshing) {
      setIsRefreshing(true);
      mediumImpact();
      await loadConversations();
      setIsRefreshing(false);
    }
    setPullDistance(0);
    pullStartRef.current = null;
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
    return readableMessagePreview(content);
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

      <div
        ref={listScrollRef}
        onTouchStart={handleListTouchStart}
        onTouchMove={handleListTouchMove}
        onTouchEnd={() => void handleListTouchEnd()}
        onTouchCancel={() => { setPullDistance(0); pullStartRef.current = null; }}
        className="flex-1 overflow-y-auto -mx-1 relative"
        style={{ transform: pullDistance ? `translateY(${pullDistance}px)` : undefined, transition: pullDistance ? 'none' : 'transform 200ms ease-out' }}
      >
        {(pullDistance > 0 || isRefreshing) && (
          <div
            className="absolute left-1/2 -translate-x-1/2 flex items-center justify-center w-8 h-8 rounded-full bg-vault-900 border border-vault-750 shadow-md"
            style={{ top: -40 }}
          >
            <RotateCcw
              className={`w-4 h-4 text-emerald ${isRefreshing ? 'animate-spin' : ''}`}
              style={isRefreshing ? undefined : { transform: `rotate(${Math.min(1, pullDistance / PULL_TRIGGER) * 360}deg)` }}
            />
          </div>
        )}
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
              const isSwiped = swipedId === c.id;
              return (
                <li key={c.id} className="relative group overflow-hidden rounded-xl">
                  {isSupabaseConfigured() && (
                    <div className="absolute inset-y-0 right-0 flex items-stretch" aria-hidden={!isSwiped}>
                      <button
                        type="button"
                        tabIndex={isSwiped ? 0 : -1}
                        onClick={() => void toggleMute(c)}
                        className="w-[52px] flex flex-col items-center justify-center gap-0.5 bg-amber-600/90 text-white text-[10px] font-medium"
                        aria-label={c.mutedAt ? `Unmute ${c.partner.display_name}` : `Mute ${c.partner.display_name}`}
                      >
                        {c.mutedAt ? <Bell className="w-4 h-4" aria-hidden /> : <BellOff className="w-4 h-4" aria-hidden />}
                        {c.mutedAt ? 'Unmute' : 'Mute'}
                      </button>
                      <button
                        type="button"
                        tabIndex={isSwiped ? 0 : -1}
                        onClick={() => void hideConversation(c)}
                        className="w-[52px] flex flex-col items-center justify-center gap-0.5 bg-rose-600/90 text-white text-[10px] font-medium"
                        aria-label={`Delete ${c.partner.display_name}`}
                      >
                        <Trash2 className="w-4 h-4" aria-hidden />
                        Delete
                      </button>
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => (isSwiped ? setSwipedId(null) : handleStartDirectChat(c.partner, c.id, c))}
                    onContextMenu={e => {
                      if (!isSupabaseConfigured()) return;
                      e.preventDefault();
                      setPinTarget(c);
                    }}
                    onTouchStart={e => handleRowTouchStart(e, c.id)}
                    onTouchMove={handleRowTouchMove}
                    onTouchEnd={handleRowTouchEnd}
                    aria-current={isSelected ? 'true' : undefined}
                    aria-label={`${c.partner.display_name}. ${preview}. ${time}${unread ? `. ${c.unreadCount} unread` : ''}`}
                    style={{ transform: isSwiped ? 'translateX(-104px)' : 'translateX(0)' }}
                    className={`row relative w-full text-left p-2.5 rounded-xl transition-transform duration-200 ease-out ${
                      isSelected ? 'bg-vault-850 border border-vault-750' : 'bg-vault-950 hover:bg-vault-900 border border-transparent'
                    }`}
                  >
                    {c.is_group ? (
                      c.group_avatar_url ? (
                        <img
                          src={c.group_avatar_url}
                          alt={c.group_name || 'Group'}
                          className="w-14 h-14 rounded-full object-cover border border-emerald/40 shadow-sm shrink-0"
                        />
                      ) : (
                        <div className="w-14 h-14 rounded-full bg-emerald/20 border border-emerald/40 flex items-center justify-center text-emerald font-bold shadow-sm shrink-0">
                          <Users className="w-6 h-6" aria-hidden />
                        </div>
                      )
                    ) : (
                      <Avatar
                        name={c.partner.display_name}
                        seed={c.partner.uid}
                        src={c.partner.avatar_url}
                        size={56}
                        online={presence[c.partner.id]?.isOnline ?? false}
                      />
                    )}
                    <span className="flex-1 min-w-0 flex flex-col gap-0.5 ml-1">
                      <span className="flex justify-between items-baseline gap-2">
                        <span className="t-body font-bold text-white truncate flex items-center gap-1 min-w-0">
                          <span className="truncate">{c.is_group ? (c.group_name || c.partner.display_name) : c.partner.display_name}</span>
                          {c.is_group && (
                            <span className="text-[10px] px-1.5 py-0.2 rounded bg-emerald/20 text-emerald font-mono font-bold shrink-0">
                              Group
                            </span>
                          )}
                          {c.pinnedAt && <Pin className="w-3 h-3 text-emerald shrink-0" aria-label="Pinned" />}
                          {c.mutedAt && <BellOff className="w-3 h-3 text-vault-500 shrink-0" aria-label="Muted" />}
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
      isGroup={activeConversation.is_group}
      groupName={activeConversation.group_name}
      groupAvatarUrl={activeConversation.group_avatar_url}
      groupDescription={activeConversation.group_description}
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
        <button
          type="button"
          onClick={() => void toggleMute(pinTarget)}
          className="w-full flex items-center gap-3 px-4 min-h-[48px] text-sm text-white hover:bg-vault-800 rounded-xl"
        >
          {pinTarget.mutedAt ? <Bell className="w-4 h-4" aria-hidden /> : <BellOff className="w-4 h-4" aria-hidden />}
          {pinTarget.mutedAt ? 'Unmute chat' : 'Mute chat'}
        </button>
        <button
          type="button"
          onClick={() => void markUnread(pinTarget)}
          className="w-full flex items-center gap-3 px-4 min-h-[48px] text-sm text-white hover:bg-vault-800 rounded-xl"
        >
          <MailOpen className="w-4 h-4" aria-hidden />
          Mark as unread
        </button>
        <button
          type="button"
          onClick={() => void hideConversation(pinTarget)}
          className="w-full flex items-center gap-3 px-4 min-h-[48px] text-sm text-rose-400 hover:bg-vault-800 rounded-xl"
        >
          <Trash2 className="w-4 h-4" aria-hidden />
          Delete chat
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

      {/* Direct UID Connect & Group Chat Modal */}
      {newChatModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-vault-900 border border-vault-750 rounded-2xl p-5 max-w-sm w-full space-y-4 animate-fade-in shadow-2xl">
            {/* Modal Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {newChatTab === 'direct' ? (
                  <ShieldCheck className="w-5 h-5 text-emerald" />
                ) : (
                  <Users className="w-5 h-5 text-emerald" />
                )}
                <h3 className="text-sm font-bold text-white m-0">
                  {newChatTab === 'direct' ? 'Direct Connect' : 'Create Group Chat'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => {
                  setNewChatModalOpen(false);
                  setNewChatTab('direct');
                  setSelectedGroupMembers([]);
                  setGroupNameInput('');
                  setGroupMemberUidInput('');
                }}
                className="ib"
                aria-label="Close"
              >
                <X className="i" aria-hidden />
              </button>
            </div>

            {/* Tab Switcher */}
            <div className="grid grid-cols-2 p-1 bg-vault-950 rounded-xl border border-vault-800 text-xs font-semibold">
              <button
                type="button"
                onClick={() => { setNewChatTab('direct'); lightImpact(); }}
                className={`py-1.5 px-3 rounded-lg flex items-center justify-center gap-1.5 transition-all ${
                  newChatTab === 'direct'
                    ? 'bg-emerald text-vault-950 font-bold shadow-sm'
                    : 'text-vault-400 hover:text-white'
                }`}
              >
                <MessageSquare className="w-3.5 h-3.5" />
                Direct 1:1
              </button>
              <button
                type="button"
                onClick={() => { setNewChatTab('group'); lightImpact(); }}
                className={`py-1.5 px-3 rounded-lg flex items-center justify-center gap-1.5 transition-all ${
                  newChatTab === 'group'
                    ? 'bg-emerald text-vault-950 font-bold shadow-sm'
                    : 'text-vault-400 hover:text-white'
                }`}
              >
                <Users className="w-3.5 h-3.5" />
                New Group
              </button>
            </div>

            {newChatTab === 'direct' ? (
              <>
                <p className="text-xs text-vault-400 m-0">
                  Enter username (e.g. <span className="font-medium text-emerald">@akshara</span> or <span className="font-medium text-emerald">@rohit</span>) or unique ID to open an encrypted channel.
                </p>

                <form onSubmit={handleCreateChatByUid} className="space-y-3">
                  <input
                    type="text"
                    placeholder="Enter @username or ID..."
                    value={newChatUidInput}
                    onChange={e => setNewChatUidInput(e.target.value)}
                    className="w-full py-2.5 px-4 bg-vault-950 border border-vault-700 focus:border-emerald rounded-xl text-white text-sm placeholder:text-vault-500 focus:outline-none"
                  />

                  <button
                    type="submit"
                    className="btn btn-p btn-block font-bold text-xs"
                  >
                    Open Encrypted Channel
                  </button>
                </form>
              </>
            ) : (
              <form onSubmit={handleCreateGroupChat} className="space-y-3.5">
                {/* Group Name Input */}
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-vault-400 mb-1.5">
                    Group Name
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Arcade Squad, Secret Vault"
                    value={groupNameInput}
                    onChange={e => setGroupNameInput(e.target.value)}
                    className="w-full py-2 px-3.5 bg-vault-950 border border-vault-700 focus:border-emerald rounded-xl text-white text-sm placeholder:text-vault-500 focus:outline-none"
                  />
                </div>

                {/* Add Member by Username / UID */}
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-vault-400 mb-1.5">
                    Add Member by @Username or ID
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Enter @username or ID..."
                      value={groupMemberUidInput}
                      onChange={e => setGroupMemberUidInput(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          void handleAddMemberToGroup();
                        }
                      }}
                      className="flex-1 min-w-0 py-2 px-3 bg-vault-950 border border-vault-700 focus:border-emerald rounded-xl text-white text-xs placeholder:text-vault-500 focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => void handleAddMemberToGroup()}
                      className="btn btn-sm btn-p px-3 text-xs shrink-0"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Add
                    </button>
                  </div>
                </div>

                {/* Selected Members Chips */}
                {selectedGroupMembers.length > 0 && (
                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-vault-400 mb-1.5">
                      Selected Members ({selectedGroupMembers.length})
                    </label>
                    <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto p-1.5 bg-vault-950 rounded-xl border border-vault-800">
                      {selectedGroupMembers.map(m => (
                        <span
                          key={m.id}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald/20 border border-emerald/40 text-emerald text-xs font-semibold"
                        >
                          <span className="truncate max-w-[120px]">{m.display_name}</span>
                          <button
                            type="button"
                            onClick={() => handleToggleContactForGroup(m)}
                            className="text-emerald hover:text-white"
                            aria-label={`Remove ${m.display_name}`}
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Quick Add from Contacts */}
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-vault-400 mb-1.5">
                    Quick Add Contacts
                  </label>
                  <div className="max-h-32 overflow-y-auto space-y-1 pr-1">
                    {(conversations.filter(c => !c.is_group).map(c => c.partner).length > 0
                      ? conversations.filter(c => !c.is_group).map(c => c.partner)
                      : mockBackend.getProfiles().filter(p => p.id !== user?.id)
                    ).map(p => {
                      const isSelected = selectedGroupMembers.some(m => m.id === p.id);
                      return (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => handleToggleContactForGroup(p)}
                          className={`w-full flex items-center justify-between p-2 rounded-xl text-left text-xs transition-colors ${
                            isSelected
                              ? 'bg-emerald/15 border border-emerald/40 text-white'
                              : 'bg-vault-950 hover:bg-vault-850 text-vault-300 border border-transparent'
                          }`}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <Avatar name={p.display_name} seed={p.uid} src={p.avatar_url} size={32} />
                            <div className="min-w-0">
                              <p className="font-bold text-white truncate m-0">{p.display_name}</p>
                              <p className="text-[10px] text-vault-400 font-mono m-0 truncate">{p.uid}</p>
                            </div>
                          </div>
                          <div className={`w-5 h-5 rounded-full flex items-center justify-center ${isSelected ? 'bg-emerald text-vault-950' : 'border border-vault-700'}`}>
                            {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={!groupNameInput.trim() || selectedGroupMembers.length === 0}
                  className="btn btn-p btn-block font-bold text-xs disabled:opacity-50 disabled:cursor-not-allowed mt-2"
                >
                  Create Group Chat
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

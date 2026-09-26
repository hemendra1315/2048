import React, { useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo, memo } from 'react';
import {
  ArrowLeft,
  Send,
  CheckCheck,
  Check,
  ShieldCheck,
  Image as ImageIcon,
  Mic,
  Play,
  Pause,
  Lock,
  RotateCcw,
  X,
  Flag,
  Reply,
  Pencil,
  Trash2,
  Copy,
  Clock,
  AlertCircle,
  Timer,
  Smile,
  Palette,
  Trophy,
  MoreVertical,
  Ban,
  ChevronDown,
  ChevronLeft,
  Info,
  Eye,
  EyeOff,
  Repeat,
  Heart,
  Bell,
  BellOff,
} from 'lucide-react';
import { CoverGameType, MessageItem, MessageReaction, ReactionEmoji, REACTION_EMOJIS, UserProfile } from '../../types';
import type { RealtimeChannel } from '@supabase/supabase-js';
import {
  deliver,
  enqueue,
  newClientId,
  onOutboxEvent,
  pendingFor,
  startOutboxSync,
  OutboxItem,
} from '../../lib/chatOutbox';
import { useAuth } from '../../context/AuthContext';
import { supabase, isSupabaseConfigured } from '../../lib/supabase';
import { uploadChatMedia } from '../../lib/storageHelper';
import { uniqueChannelName } from '../../lib/realtime';
import { formatTimestamp } from '../../lib/utils';
import { useToast } from '../../context/ToastContext';
import { Avatar } from '../common/Avatar';
import { ContactDossier } from './ContactDossier';
import { ReportUserModal } from './ReportUserModal';
import { describePresence, usePresence } from '../../lib/presence';
import {
  ChatThemeId,
  computeWaveform,
  isSystemMessage,
  parseGame,
  parseScore,
  parseSticker,
  parseVoiceNote,
  readableMessagePreview,
  systemMessageText,
  timerLabel,
  themeById,
  WAVEFORM_BARS,
} from '../../lib/chatExtras';
import { ChatGameCard } from './ChatGameCard';
import { ChatExtrasSheet, ChatThemeSheet } from './ChatExtrasSheet';
import { NotificationPreferenceSheet } from './NotificationPreferenceSheet';
import { COVER_GAMES, useGame } from '../../context/GameContext';
import { resolveChatMediaUrl } from '../../lib/mediaUrls';
import { BlockStatus, blockUser, getBlockStatus, unblockUser } from '../../lib/blocks';
import { ChatImage, ViewOnceImageBubble, ViewOnceAudioBubble } from '../common/ChatMedia';
import { LightboxViewer } from '../gallery/LightboxViewer';
import { claimEphemeralMedia } from '../../lib/viewOnceApi';
import { useBackHandler } from '../../lib/backButton';
import { expectExternalActivity } from '../../lib/externalActivity';
import { getDraft, setDraft } from '../../lib/chatDrafts';
import { lightImpact, mediumImpact, selectionChange, notificationSuccess, errorWarning } from '../../lib/haptics';

interface ChatRoomProps {
  conversationId: string;
  partner: UserProfile;
  onBack: () => void;
  onOpenMedia?: (url: string) => void;
  initialAttachment?: string | null;
  onClearInitialAttachment?: () => void;
}

export const ChatRoom: React.FC<ChatRoomProps> = ({
  conversationId,
  partner,
  onBack,
  onOpenMedia: onOpenMediaProp,
  initialAttachment,
  onClearInitialAttachment,
}) => {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [messages, setMessages] = useState<MessageItem[]>([]);
  const [inputContent, setInputContent] = useState(() => getDraft(conversationId));
  const [isTyping, setIsTyping] = useState(false);
  const [isUploadingMedia, setIsUploadingMedia] = useState(false);
  const [sendAsSpoiler, setSendAsSpoiler] = useState(false);
  type EphemeralSendMode = 'view_once' | 'allow_replay' | 'keep_in_chat';
  const [claimingViewOnceId, setClaimingViewOnceId] = useState<string | null>(null);
  const [activeViewOnceItem, setActiveViewOnceItem] = useState<{ id: string; url: string; created_at: string; sender_id: string } | null>(null);
  const [activeMediaUrl, setActiveMediaUrl] = useState<string | null>(null);
  const onOpenMedia = useCallback((url: string) => {
    onOpenMediaProp?.(url);
    setActiveMediaUrl(url);
  }, [onOpenMediaProp]);
  const [viewOnceConsumedIds, setViewOnceConsumedIds] = useState<Set<string>>(() => new Set());
  const [playingAudioId, setPlayingAudioId] = useState<string | null>(null);
  const [audioSpeed, setAudioSpeed] = useState<number>(1);
  const [showContactModal, setShowContactModal] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [reactions, setReactions] = useState<Record<string, MessageReaction[]>>({});
  const [replyTo, setReplyTo] = useState<MessageItem | null>(null);
  const [editing, setEditing] = useState<MessageItem | null>(null);
  const [actionMsg, setActionMsg] = useState<MessageItem | null>(null);
  const [showDetailsModal, setShowDetailsModal] = useState<MessageItem | null>(null);
  const messagesRef = useRef<MessageItem[]>([]);
  messagesRef.current = messages;
  const typingChannelRef = useRef<RealtimeChannel | null>(null);
  const lastTypingSentRef = useRef(0);
  const typingIdleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [disappearAfter, setDisappearAfter] = useState<number | null>(null);
  const [showTimerSheet, setShowTimerSheet] = useState(false);
  const [showExtras, setShowExtras] = useState(false);
  const [showThemeSheet, setShowThemeSheet] = useState(false);
  const [showNotificationSheet, setShowNotificationSheet] = useState(false);
  const [themeId, setThemeId] = useState<ChatThemeId>('default');
  const [isMuted, setIsMuted] = useState(false);
  const [audioProgress, setAudioProgress] = useState(0);
  const [showChatMenu, setShowChatMenu] = useState(false);
  const [confirmBlock, setConfirmBlock] = useState(false);
  const [blockStatus, setBlockStatus] = useState<BlockStatus>({ iBlocked: false, blocked: false });
  const [showScrollBottom, setShowScrollBottom] = useState(false);
  const [unreadWhileScrolled, setUnreadWhileScrolled] = useState(0);
  const blockedRef = useRef(false);
  blockedRef.current = blockStatus.blocked;
  const theme = themeById(themeId);
  const partnerPresence = usePresence([partner.id])[partner.id];
  const presenceLabel = describePresence(partnerPresence);
  const listRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const userId = user?.id;

  const stickToBottomRef = useRef(true);
  const hasScrolledInitiallyRef = useRef(false);

  const [hasOlder, setHasOlder] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const hasOlderRef = useRef(false);
  hasOlderRef.current = hasOlder;
  const loadingOlderRef = useRef(false);
  const prependAnchorRef = useRef<number | null>(null);
  const loadOlderRef = useRef<() => void>(() => {});

  const handleListScroll = useCallback(() => {
    const el = listRef.current;
    if (!el) return;
    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    const isNearBottom = distFromBottom < 140;
    stickToBottomRef.current = isNearBottom;
    setShowScrollBottom(!isNearBottom);
    if (isNearBottom) setUnreadWhileScrolled(0);
    if (el.scrollTop < 150 && hasOlderRef.current && !loadingOlderRef.current) loadOlderRef.current();
  }, []);

  const scrollToBottom = useCallback((smooth = true) => {
    const el = listRef.current;
    if (!el) return;
    lightImpact();
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
    setShowScrollBottom(false);
    setUnreadWhileScrolled(0);
  }, []);

  const lastMessage = messages[messages.length - 1];
  useLayoutEffect(() => {
    const el = listRef.current;
    if (!el || messages.length === 0) return;
    if (prependAnchorRef.current !== null) {
      el.scrollTop = el.scrollHeight - prependAnchorRef.current;
      prependAnchorRef.current = null;
      return;
    }
    const mine = lastMessage?.sender_id === userId;
    if (!hasScrolledInitiallyRef.current) {
      hasScrolledInitiallyRef.current = true;
      el.scrollTop = el.scrollHeight;
      return;
    }
    if (stickToBottomRef.current || mine) {
      el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
      setUnreadWhileScrolled(0);
    } else if (!mine) {
      setUnreadWhileScrolled(c => c + 1);
    }
  }, [messages.length, lastMessage, userId]);

  const handleMediaLoaded = useCallback(() => {
    const el = listRef.current;
    if (el && stickToBottomRef.current) el.scrollTop = el.scrollHeight;
  }, []);

  const loadReactions = useCallback(async () => {
    if (!isSupabaseConfigured()) return;
    const { data, error } = await supabase
      .from('message_reactions')
      .select('message_id, user_id, emoji, messages!inner(conversation_id)')
      .eq('messages.conversation_id', conversationId);
    if (error) {
      console.warn('[chat] reactions load failed:', error.code);
      return;
    }
    const map: Record<string, MessageReaction[]> = {};
    for (const r of (data ?? []) as unknown as { message_id: string; user_id: string; emoji: ReactionEmoji }[]) {
      (map[r.message_id] ??= []).push({ user_id: r.user_id, emoji: r.emoji });
    }
    setReactions(map);
  }, [conversationId]);

  useEffect(() => {
    if (!isSupabaseConfigured()) return;
    let cancelled = false;
    void supabase
      .from('conversations')
      .select('disappear_after_seconds')
      .eq('id', conversationId)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled) setDisappearAfter((data as { disappear_after_seconds?: number | null } | null)?.disappear_after_seconds ?? null);
      });
    return () => { cancelled = true; };
  }, [conversationId]);

  useEffect(() => {
    const timer = setInterval(() => {
      const now = Date.now();
      if (messagesRef.current.some(m => m.expires_at && new Date(m.expires_at).getTime() <= now)) {
        setMessages(prev => prev.filter(m => !m.expires_at || new Date(m.expires_at).getTime() > now));
      }
    }, 30_000);
    return () => clearInterval(timer);
  }, []);

  const changeDisappearing = async (seconds: number | null) => {
    setShowTimerSheet(false);
    if (seconds === disappearAfter) return;
    const before = disappearAfter;
    setDisappearAfter(seconds);
    const { error } = await supabase.rpc('set_disappearing_messages', {
      p_conversation_id: conversationId,
      p_seconds: seconds,
    });
    if (error) {
      setDisappearAfter(before);
      showToast(error.message || 'Could not change the timer', 'error');
    } else {
      notificationSuccess();
    }
  };

  useEffect(() => {
    if (!isSupabaseConfigured() || !userId) return;
    let cancelled = false;
    void supabase
      .from('conversation_members')
      .select('chat_theme, muted_at')
      .eq('conversation_id', conversationId)
      .eq('user_id', userId)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;
        const row = data as { chat_theme?: ChatThemeId; muted_at?: string | null } | null;
        if (row?.chat_theme) setThemeId(row.chat_theme);
        setIsMuted(Boolean(row?.muted_at));
      });
    return () => { cancelled = true; };
  }, [conversationId, userId]);

  const changeTheme = async (id: ChatThemeId) => {
    setThemeId(id);
    setShowThemeSheet(false);
    selectionChange();
    if (!isSupabaseConfigured() || !userId) return;
    await supabase
      .from('conversation_members')
      .update({ chat_theme: id })
      .eq('conversation_id', conversationId)
      .eq('user_id', userId);
  };

  const toggleMute = async () => {
    const next = !isMuted;
    setIsMuted(next);
    selectionChange();
    if (!isSupabaseConfigured()) return;
    const { error } = await supabase.rpc('set_chat_muted', { p_conversation_id: conversationId, p_muted: next });
    if (error) {
      setIsMuted(!next);
      showToast(error.message || 'Could not update mute', 'error');
      return;
    }
    showToast(next ? `Muted ${partner.display_name}` : 'Chat unmuted', 'success');
  };

  const loadBlock = useCallback(async () => {
    const s = await getBlockStatus(partner.id);
    setBlockStatus(s);
  }, [partner.id]);

  useEffect(() => { void loadBlock(); }, [loadBlock]);

  const toggleBlock = async () => {
    if (!userId) return;
    try {
      if (blockStatus.iBlocked) {
        await unblockUser(userId, partner.id);
        showToast(`Unblocked ${partner.display_name}`, 'success');
        notificationSuccess();
      } else {
        await blockUser(userId, partner.id);
        showToast(`Blocked ${partner.display_name}`, 'info');
        mediumImpact();
      }
      setConfirmBlock(false);
      setShowChatMenu(false);
      await loadBlock();
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Action failed', 'error');
      errorWarning();
    }
  };

  const loadMessages = useCallback(async () => {
    if (isSupabaseConfigured()) {
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: false })
        .limit(PAGE_SIZE + 1);

      if (error) {
        console.error('Failed to load messages:', error);
        return;
      }
      const raw = (data ?? []) as MessageItem[];
      setHasOlder(raw.length > PAGE_SIZE);
      const page = raw.slice(0, PAGE_SIZE).reverse();
      setMessages(page);
      void loadReactions();
    } else {
      setHasOlder(false);
    }
  }, [conversationId, loadReactions]);

  const loadOlder = useCallback(async () => {
    if (loadingOlderRef.current || !hasOlderRef.current || !isSupabaseConfigured()) return;
    const oldest = messagesRef.current[0];
    if (!oldest?.created_at) return;
    loadingOlderRef.current = true;
    setLoadingOlder(true);
    const el = listRef.current;
    if (el) prependAnchorRef.current = el.scrollHeight - el.scrollTop;
    try {
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .eq('conversation_id', conversationId)
        .lt('created_at', oldest.created_at)
        .order('created_at', { ascending: false })
        .limit(PAGE_SIZE + 1);

      if (error) {
        console.warn('[chat] load older messages failed:', error.message);
        prependAnchorRef.current = null;
        return;
      }
      const raw = (data ?? []) as MessageItem[];
      setHasOlder(raw.length > PAGE_SIZE);
      const older = raw.slice(0, PAGE_SIZE).reverse();
      setMessages(prev => [...older, ...prev]);
    } finally {
      loadingOlderRef.current = false;
      setLoadingOlder(false);
    }
  }, [conversationId]);
  loadOlderRef.current = loadOlder;

  useEffect(() => {
    hasScrolledInitiallyRef.current = false;
    stickToBottomRef.current = true;
    setShowScrollBottom(false);
    setUnreadWhileScrolled(0);
    loadMessages();

    if (!isSupabaseConfigured()) return;

    const channel = supabase
      .channel(uniqueChannelName('messages'))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conversationId}` }, payload => {
        if (payload.eventType === 'INSERT') {
          const inserted = payload.new as MessageItem;
          setMessages(prev => {
            const idx = inserted.client_id ? prev.findIndex(m => m.client_id === inserted.client_id) : -1;
            if (idx >= 0) {
              const copy = [...prev];
              copy[idx] = inserted;
              return copy;
            }
            if (prev.some(m => m.id === inserted.id)) return prev;
            return [...prev, inserted];
          });
        } else if (payload.eventType === 'UPDATE') {
          const updated = payload.new as MessageItem;
          setMessages(prev => prev.map(m => (m.id === updated.id ? { ...m, ...updated } : m)));
        } else if (payload.eventType === 'DELETE') {
          const deletedId = (payload.old as { id: string }).id;
          setMessages(prev => prev.filter(m => m.id !== deletedId));
        }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'message_reactions' }, () => {
        void loadReactions();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId, loadMessages, loadReactions]);

  useEffect(() => {
    if (!isSupabaseConfigured()) return;
    const typingChannel = supabase.channel(`typing:${conversationId}`);
    typingChannelRef.current = typingChannel;
    typingChannel
      .on('broadcast', { event: 'typing' }, payload => {
        if (payload.payload?.user_id !== userId) {
          setIsTyping(true);
          if (typingIdleTimerRef.current) clearTimeout(typingIdleTimerRef.current);
          typingIdleTimerRef.current = setTimeout(() => setIsTyping(false), 3000);
        }
      })
      .subscribe();

    return () => {
      if (typingIdleTimerRef.current) clearTimeout(typingIdleTimerRef.current);
      supabase.removeChannel(typingChannel);
      typingChannelRef.current = null;
    };
  }, [conversationId, userId]);

  useEffect(() => {
    startOutboxSync(() => userId);
    const unsub = onOutboxEvent(ev => {
      if (ev.type === 'sent') {
        setMessages(prev => prev.map(m => (m.client_id === ev.clientId ? ev.message : m)));
      } else if (ev.type === 'failed') {
        setMessages(prev => prev.map(m => (m.client_id === ev.clientId ? { ...m, status: 'failed' } : m)));
      } else if (ev.type === 'queued') {
        setMessages(prev => prev.map(m => (m.client_id === ev.clientId ? { ...m, status: 'queued' } : m)));
      }
    });
    return unsub;
  }, [userId]);

  const handleInputChange = (text: string) => {
    setInputContent(text);
    setDraft(conversationId, text);
    if (!text.trim()) return;
    const now = Date.now();
    if (now - lastTypingSentRef.current > 2000) {
      lastTypingSentRef.current = now;
      typingChannelRef.current?.send({
        type: 'broadcast',
        event: 'typing',
        payload: { user_id: userId },
      });
    }
  };

  const handleSend = async (contentToSend?: string) => {
    if (blockedRef.current) return;
    const raw = (contentToSend ?? inputContent).trim();
    if (!raw || !user) return;

    if (editing) {
      const target = editing;
      setEditing(null);
      setInputContent('');
      setDraft(conversationId, '');
      lightImpact();
      if (isSupabaseConfigured()) {
        const { error } = await supabase
          .from('messages')
          .update({ content: raw, edited_at: new Date().toISOString() })
          .eq('id', target.id);
        if (error) showToast(error.message || 'Could not edit message', 'error');
        else notificationSuccess();
      }
      return;
    }

    const clientId = newClientId();
    const replyTargetId = replyTo?.id ?? null;
    setReplyTo(null);
    setInputContent('');
    setDraft(conversationId, '');
    lightImpact();

    const pendingItem: OutboxItem = {
      client_id: clientId,
      conversation_id: conversationId,
      sender_id: user.id,
      content: raw,
      created_at: new Date().toISOString(),
      reply_to_id: replyTargetId,
    };

    setMessages(prev => [...prev, outboxToMessage(pendingItem, 'queued')]);

    if (!isSupabaseConfigured()) {
      setMessages(prev => prev.map(m => (m.client_id === clientId ? { ...m, status: undefined } : m)));
      notificationSuccess();
      return;
    }

    enqueue(pendingItem);
    void deliver(pendingItem);
  };

  const startReply = (msg: MessageItem) => {
    setEditing(null);
    setReplyTo(msg);
    lightImpact();
    inputRef.current?.focus();
  };

  const startEdit = (msg: MessageItem) => {
    setReplyTo(null);
    setEditing(msg);
    setInputContent(msg.content);
    lightImpact();
    inputRef.current?.focus();
  };

  const cancelComposerMode = () => {
    setReplyTo(null);
    setEditing(null);
    setInputContent('');
    setDraft(conversationId, '');
  };

  const retrySend = (msg: MessageItem) => {
    if (!msg.client_id || !userId) return;
    const pendingList = pendingFor(conversationId, userId);
    const target = pendingList.find(i => i.client_id === msg.client_id);
    if (!target) return;
    lightImpact();
    setMessages(prev => prev.map(m => (m.client_id === msg.client_id ? { ...m, status: 'queued' } : m)));
    void deliver(target);
  };

  const discardFailed = (msg: MessageItem) => {
    mediumImpact();
    setMessages(prev => prev.filter(m => m !== msg));
  };

  const deleteForEveryone = async (msg: MessageItem) => {
    mediumImpact();
    if (!isSupabaseConfigured()) {
      setMessages(prev => prev.filter(m => m.id !== msg.id));
      showToast('Message removed', 'info');
      return;
    }
    const { error } = await supabase
      .from('messages')
      .update({ content: '[DELETED]', deleted_at: new Date().toISOString() })
      .eq('id', msg.id);

    if (error) {
      showToast(error.message || 'Could not delete message', 'error');
      errorWarning();
    } else {
      showToast('Message deleted for everyone', 'info');
    }
  };

  const toggleReaction = async (msg: MessageItem, emoji: ReactionEmoji) => {
    if (!userId || !isSupabaseConfigured() || isDeleted(msg)) return;
    selectionChange();
    const existing = reactions[msg.id]?.find(r => r.user_id === userId);
    if (existing?.emoji === emoji) {
      await supabase.from('message_reactions').delete().eq('message_id', msg.id).eq('user_id', userId);
      setReactions(prev => ({
        ...prev,
        [msg.id]: (prev[msg.id] ?? []).filter(r => r.user_id !== userId),
      }));
    } else {
      await supabase.from('message_reactions').upsert({
        message_id: msg.id,
        user_id: userId,
        emoji,
      });
      setReactions(prev => {
        const withoutMine = (prev[msg.id] ?? []).filter(r => r.user_id !== userId);
        return { ...prev, [msg.id]: [...withoutMine, { user_id: userId, emoji }] };
      });
    }
  };

  const messagesById = useMemo(() => {
    const map: Record<string, MessageItem> = {};
    for (const m of messages) {
      map[m.id] = m;
      if (m.client_id) map[m.client_id] = m;
    }
    return map;
  }, [messages]);

  const sendScoreCard = (gameId: string, bestScore: number) => {
    setShowExtras(false);
    void handleSend(`[SCORE:${gameId}|${bestScore}]`);
  };

  const sendSticker = (stickerId: string) => {
    setShowExtras(false);
    void handleSend(`[STICKER:${stickerId}]`);
  };

  const startGame = (gameId: CoverGameType) => {
    setShowExtras(false);
    void handleSend(`[GAME:${gameId}]`);
  };

  const initialAttachmentHandlersRef = useRef({ handleSend, onClearInitialAttachment, user });
  useEffect(() => {
    initialAttachmentHandlersRef.current = { handleSend, onClearInitialAttachment, user };
  });

  useEffect(() => {
    if (initialAttachment && initialAttachmentHandlersRef.current.user) {
      const sendInitialMedia = async () => {
        setIsUploadingMedia(true);
        try {
          await initialAttachmentHandlersRef.current.handleSend(`[IMAGE]${initialAttachment}`);
          initialAttachmentHandlersRef.current.onClearInitialAttachment?.();
        } finally {
          setIsUploadingMedia(false);
        }
      };
      sendInitialMedia();
    }
  }, [initialAttachment]);

  // Picking a photo opens a send-preview first (like Instagram) instead of uploading
  // immediately — the view-once/allow-replay/keep-in-chat choice is made there, per photo.
  const [pendingPhoto, setPendingPhoto] = useState<{ file: File; previewUrl: string } | null>(null);
  const [pendingPhotoMode, setPendingPhotoMode] = useState<EphemeralSendMode>('keep_in_chat');

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !user) return;
    setPendingPhoto({ file, previewUrl: URL.createObjectURL(file) });
    setPendingPhotoMode('keep_in_chat');
  };

  const cancelPendingPhoto = () => {
    if (pendingPhoto) URL.revokeObjectURL(pendingPhoto.previewUrl);
    setPendingPhoto(null);
  };

  const confirmSendPendingPhoto = async () => {
    if (!pendingPhoto || !user) return;
    const { file, previewUrl } = pendingPhoto;
    const mode = pendingPhotoMode;
    setPendingPhoto(null);
    setIsUploadingMedia(true);
    try {
      const mediaUrl = await uploadChatMedia(file, conversationId);
      const tag =
        mode === 'view_once'
          ? '[IMAGE:VIEW_ONCE]'
          : mode === 'allow_replay'
            ? '[IMAGE:ALLOW_REPLAY]'
            : sendAsSpoiler
              ? '[IMAGE:spoiler]'
              : '[IMAGE]';
      await handleSend(`${tag}${mediaUrl}`);
      showToast(
        mode === 'view_once'
          ? 'View once photo sent'
          : mode === 'allow_replay'
            ? 'Allow-replay photo sent (2 views)'
            : sendAsSpoiler
              ? 'Sensitive photo sent with spoiler blur'
              : 'Photo sent',
        'success'
      );
      notificationSuccess();
    } catch (err) {
      console.error('File upload error:', err);
      showToast('Photo upload failed', 'error');
      errorWarning();
    } finally {
      setIsUploadingMedia(false);
      setSendAsSpoiler(false);
      URL.revokeObjectURL(previewUrl);
    }
  };

  const [isRecordingAudio, setIsRecordingAudio] = useState(false);
  const [audioSeconds, setAudioSeconds] = useState(0);
  const [recordDragX, setRecordDragX] = useState(0);
  const recordPointerRef = useRef<{ startX: number; cancelled: boolean } | null>(null);
  const RECORD_CANCEL_THRESHOLD = -72;
  const recordedSecondsRef = useRef(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioElementRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isRecordingAudio) {
      interval = setInterval(() => setAudioSeconds(s => s + 1), 1000);
    } else {
      setAudioSeconds(0);
    }
    return () => clearInterval(interval);
  }, [isRecordingAudio]);

  const handleStartVoiceRecord = async () => {
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        showToast('Microphone not supported in this environment', 'error');
        return;
      }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];
      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = e => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        stream.getTracks().forEach(t => t.stop());
        const seconds = recordedSecondsRef.current;
        const dur = `${Math.floor(seconds / 60)}:${(seconds % 60).toString().padStart(2, '0')}`;

        if (seconds >= 1) {
          try {
            setIsUploadingMedia(true);
            const audioFile = new File([audioBlob], `voice-${Date.now()}.webm`, { type: 'audio/webm' });
            const [mediaUrl, levels] = await Promise.all([
              uploadChatMedia(audioFile, conversationId),
              computeWaveform(audioBlob),
            ]);
            const tag = `[VOICE_NOTE:${dur}${levels ? `|w=${levels}` : ''}]`;
            await handleSend(`${tag}${mediaUrl}`);
            showToast('Voice note shared', 'success');
            notificationSuccess();
          } catch (err) {
            console.error('Voice note upload error:', err);
            showToast('Voice note upload failed', 'error');
            errorWarning();
          } finally {
            setIsUploadingMedia(false);
          }
        }
      };

      recorder.start();
      setIsRecordingAudio(true);
      lightImpact();
      // The user may have already released (or slid to cancel) before mic
      // permission resolved — this state only reaches setIsRecordingAudio(true)
      // just above, so re-check the pointer here and stop immediately if so.
      if (!recordPointerRef.current) {
        recordedSecondsRef.current = 0;
        recorder.stop();
        setIsRecordingAudio(false);
        setRecordDragX(0);
      }
    } catch (err) {
      console.error('Voice record error:', err);
      showToast('Microphone access denied', 'error');
      errorWarning();
    }
  };

  const handleStopVoiceRecord = (send: boolean) => {
    if (mediaRecorderRef.current && isRecordingAudio) {
      if (send) {
        recordedSecondsRef.current = audioSeconds;
        mediaRecorderRef.current.stop();
        mediumImpact();
      } else {
        mediaRecorderRef.current.stream.getTracks().forEach(t => t.stop());
        lightImpact();
      }
      setIsRecordingAudio(false);
    }
    setRecordDragX(0);
  };

  // Hold-to-record with slide-to-cancel: press-and-hold the mic starts recording,
  // dragging left past the threshold cancels it, releasing short of that sends it.
  const handleRecordPointerDown = (e: React.PointerEvent) => {
    if (isRecordingAudio) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    recordPointerRef.current = { startX: e.clientX, cancelled: false };
    void handleStartVoiceRecord();
  };
  const handleRecordPointerMove = (e: React.PointerEvent) => {
    const s = recordPointerRef.current;
    if (!s || !isRecordingAudio) return;
    const dx = Math.min(0, e.clientX - s.startX);
    setRecordDragX(dx);
    if (dx <= RECORD_CANCEL_THRESHOLD && !s.cancelled) {
      s.cancelled = true;
      handleStopVoiceRecord(false);
    }
  };
  const handleRecordPointerUp = () => {
    const s = recordPointerRef.current;
    recordPointerRef.current = null;
    if (s?.cancelled) return;
    handleStopVoiceRecord(true);
  };

  const playingAudioIdRef = useRef<string | null>(null);
  playingAudioIdRef.current = playingAudioId;

  const toggleAudio = useCallback((msgId: string, audioUrl: string) => {
    if (playingAudioIdRef.current === msgId || !audioUrl) {
      audioElementRef.current?.pause();
      setPlayingAudioId(prev => (prev === msgId ? null : audioUrl ? prev : msgId));
      lightImpact();
      return;
    }

    audioElementRef.current?.pause();
    setPlayingAudioId(msgId);
    setAudioProgress(0);
    lightImpact();

    void resolveChatMediaUrl(audioUrl).then(src => {
      if (playingAudioIdRef.current !== msgId) return;
      if (!src) {
        setPlayingAudioId(null);
        return;
      }
      const audio = new Audio(src);
      audioElementRef.current = audio;
      audio.playbackRate = audioSpeed;
      audio.ontimeupdate = () => {
        if (audio.duration && Number.isFinite(audio.duration)) setAudioProgress(audio.currentTime / audio.duration);
      };
      audio.onended = () => {
        setPlayingAudioId(null);
        setAudioProgress(0);
      };
      audio.onerror = () => setPlayingAudioId(null);
      audio.play().catch(() => setPlayingAudioId(null));
    });
  }, [audioSpeed]);

  const isEphemeralExhausted = useCallback((msg: MessageItem) => {
    const maxViews = msg.view_mode === 'allow_replay' ? 2 : 1;
    const viewsUsed = msg.view_count ?? (msg.view_once_opened_at ? 1 : 0);
    return viewsUsed >= maxViews || viewOnceConsumedIds.has(msg.id);
  }, [viewOnceConsumedIds]);

  const handleOpenViewOncePhoto = useCallback(async (msg: MessageItem, rawUrl: string) => {
    if (isEphemeralExhausted(msg)) {
      showToast(msg.view_mode === 'allow_replay' ? 'No replays left for this photo' : 'This photo has already been viewed', 'info');
      return;
    }
    setClaimingViewOnceId(msg.id);
    lightImpact();
    try {
      const claimRes = await claimEphemeralMedia(msg.id, userId);
      if (!claimRes.success) {
        if (claimRes.reason === 'already_viewed' || claimRes.reason === 'max_replays_reached') {
          setViewOnceConsumedIds(prev => new Set(prev).add(msg.id));
          showToast(claimRes.reason === 'max_replays_reached' ? 'No replays left for this photo' : 'This photo has already been viewed', 'info');
        } else {
          showToast('Could not open photo', 'error');
        }
        errorWarning();
        return;
      }

      const exhausted = (claimRes.view_count ?? 0) >= (claimRes.max_views ?? 1);
      if (exhausted) setViewOnceConsumedIds(prev => new Set(prev).add(msg.id));
      setMessages(prev => prev.map(m => (m.id === msg.id
        ? { ...m, view_once_opened_at: claimRes.opened_at || new Date().toISOString(), view_count: claimRes.view_count, view_mode: claimRes.view_mode ?? m.view_mode }
        : m)));

      const resolved = await resolveChatMediaUrl(rawUrl);
      if (!resolved) {
        showToast('Photo unavailable', 'error');
        errorWarning();
        return;
      }

      notificationSuccess();
      setActiveViewOnceItem({
        id: msg.id,
        url: resolved,
        created_at: msg.created_at,
        sender_id: msg.sender_id,
      });
    } catch (err) {
      console.error('Error opening ephemeral photo:', err);
      showToast('Error opening photo', 'error');
      errorWarning();
    } finally {
      setClaimingViewOnceId(null);
    }
  }, [userId, isEphemeralExhausted, showToast]);

  const handleToggleViewOnceAudio = useCallback(async (msg: MessageItem, rawUrl: string) => {
    if (playingAudioIdRef.current === msg.id) {
      // Already claimed when playback started below — this just stops it.
      audioElementRef.current?.pause();
      setPlayingAudioId(null);
      setAudioProgress(0);
      lightImpact();
      return;
    }

    if (isEphemeralExhausted(msg)) {
      showToast(msg.view_mode === 'allow_replay' ? 'No replays left for this voice note' : 'This voice note has already been played', 'info');
      return;
    }

    setClaimingViewOnceId(msg.id);
    lightImpact();

    try {
      const claimRes = await claimEphemeralMedia(msg.id, userId);
      if (!claimRes.success) {
        if (claimRes.reason === 'already_viewed' || claimRes.reason === 'max_replays_reached') {
          setViewOnceConsumedIds(prev => new Set(prev).add(msg.id));
          showToast(claimRes.reason === 'max_replays_reached' ? 'No replays left for this voice note' : 'This voice note has already been played', 'info');
        } else {
          showToast('Could not play voice note', 'error');
        }
        errorWarning();
        return;
      }

      const exhausted = (claimRes.view_count ?? 0) >= (claimRes.max_views ?? 1);
      if (exhausted) setViewOnceConsumedIds(prev => new Set(prev).add(msg.id));
      setMessages(prev => prev.map(m => (m.id === msg.id
        ? { ...m, view_once_opened_at: claimRes.opened_at || new Date().toISOString(), view_count: claimRes.view_count, view_mode: claimRes.view_mode ?? m.view_mode }
        : m)));

      const resolved = await resolveChatMediaUrl(rawUrl);
      if (!resolved) {
        showToast('Voice note unavailable', 'error');
        errorWarning();
        return;
      }

      audioElementRef.current?.pause();
      setPlayingAudioId(msg.id);
      setAudioProgress(0);

      const audio = new Audio(resolved);
      audioElementRef.current = audio;
      audio.playbackRate = audioSpeed;
      audio.ontimeupdate = () => {
        if (audio.duration && Number.isFinite(audio.duration)) {
          setAudioProgress(audio.currentTime / audio.duration);
        }
      };
      audio.onended = () => {
        setPlayingAudioId(null);
        setAudioProgress(0);
        mediumImpact();
      };
      audio.onerror = () => {
        setPlayingAudioId(null);
        setAudioProgress(0);
      };
      audio.play().catch(() => setPlayingAudioId(null));
    } catch (err) {
      console.error('Error playing view once audio:', err);
      showToast('Error playing voice note', 'error');
      errorWarning();
    } finally {
      setClaimingViewOnceId(null);
    }
  }, [userId, isEphemeralExhausted, audioSpeed, showToast]);

  const handleScrubAudio = useCallback((progress: number) => {
    const audio = audioElementRef.current;
    if (audio && audio.duration && Number.isFinite(audio.duration)) {
      audio.currentTime = progress * audio.duration;
      setAudioProgress(progress);
      selectionChange();
    }
  }, []);

  const cycleSpeed = useCallback(() => {
    selectionChange();
    setAudioSpeed(prev => {
      const next = prev === 1 ? 1.5 : prev === 1.5 ? 2 : 1;
      if (audioElementRef.current) {
        audioElementRef.current.playbackRate = next;
      }
      return next;
    });
  }, []);

  useEffect(() => () => audioElementRef.current?.pause(), []);

  useLayoutEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight + el.offsetHeight - el.clientHeight}px`;
  }, [inputContent]);

  useBackHandler(true, onBack);
  useBackHandler(Boolean(activeViewOnceItem), () => setActiveViewOnceItem(null));
  useBackHandler(Boolean(activeMediaUrl), () => setActiveMediaUrl(null));
  useBackHandler(Boolean(replyTo || editing), cancelComposerMode);
  useBackHandler(isRecordingAudio, () => handleStopVoiceRecord(false));
  useBackHandler(showContactModal, () => setShowContactModal(false));
  useBackHandler(Boolean(pendingPhoto), cancelPendingPhoto);
  useBackHandler(showChatMenu, () => { setShowChatMenu(false); setConfirmBlock(false); });
  useBackHandler(showTimerSheet, () => setShowTimerSheet(false));
  useBackHandler(showThemeSheet, () => setShowThemeSheet(false));
  useBackHandler(showNotificationSheet, () => setShowNotificationSheet(false));
  useBackHandler(showExtras, () => setShowExtras(false));
  useBackHandler(showReportModal, () => setShowReportModal(false));
  useBackHandler(Boolean(actionMsg), () => setActionMsg(null));
  useBackHandler(Boolean(showDetailsModal), () => setShowDetailsModal(null));

  return (
    <div className="relative flex flex-col h-full bg-vault-950 lg:border lg:border-vault-800 lg:rounded-2xl overflow-hidden select-none animate-fade-in">
      {/* 1. CHAT WORKSPACE HEADER */}
      <header className="min-h-16 px-4 sm:px-5 pt-[env(safe-area-inset-top)] glass-header flex items-center justify-between shrink-0 z-20">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={onBack}
            className="ib ib-s lg:hidden rounded-full"
            aria-label="Back to conversations"
          >
            <ArrowLeft className="i" aria-hidden />
          </button>

          <button
            type="button"
            onClick={() => setShowContactModal(true)}
            className="flex items-center gap-3 min-w-0 text-left -ml-1 pl-1 pr-2 py-1 rounded-xl hover:bg-vault-850 transition-colors"
            aria-label={`Contact info for ${partner.display_name}`}
          >
            <Avatar
              name={partner.display_name}
              seed={partner.uid}
              src={partner.avatar_url}
              size={40}
              online={partnerPresence?.isOnline ?? false}
            />

            <div className="min-w-0">
              <h2 className="t-h3 font-bold text-white leading-tight truncate m-0">
                {partner.display_name}
              </h2>
              <div className="flex items-center gap-1.5 text-[11px] leading-tight mt-0.5">
                {isTyping ? (
                  <span className="text-emerald font-sans font-semibold animate-pulse">typing…</span>
                ) : presenceLabel ? (
                  <span className={`font-sans ${partnerPresence?.isOnline ? 'text-emerald' : 'text-vault-400'}`}>{presenceLabel}</span>
                ) : (
                  <span className="text-vault-500 font-mono flex items-center gap-1">
                    <ShieldCheck className="w-3 h-3" aria-hidden />
                    {partner.uid}
                  </span>
                )}
              </div>
            </div>
          </button>
        </div>

        <div className="flex items-center gap-1.5">
          {disappearAfter ? (
            <span className="text-emerald p-1" title={`Disappearing messages: ${timerLabel(disappearAfter)}`} aria-label={`Disappearing messages: ${timerLabel(disappearAfter)}`}>
              <Timer className="w-4 h-4" aria-hidden />
            </span>
          ) : null}
          <button
            type="button"
            onClick={() => setShowChatMenu(true)}
            className="ib ib-s rounded-xl"
            aria-label="Chat options"
            title="Chat options"
          >
            <MoreVertical className="i" aria-hidden />
          </button>
        </div>
      </header>

      {/* 2. MESSAGE STREAM */}
      <div
        ref={listRef}
        onScroll={handleListScroll}
        className={`flex-1 overflow-y-auto overscroll-contain px-3 py-3 sm:p-5 ${theme.wallpaper} min-h-0 [-webkit-overflow-scrolling:touch] touch-pan-y`}
      >
        {(loadingOlder || hasOlder) && messages.length > 0 && (
          <div className="flex justify-center py-2">
            {loadingOlder ? (
              <span className="text-xs text-vault-500">Loading earlier messages…</span>
            ) : (
              <button type="button" onClick={() => void loadOlder()} className="text-xs text-emerald hover:underline min-h-[32px]">
                Load earlier messages
              </button>
            )}
          </div>
        )}
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-6 text-xs text-vault-500 gap-2">
            <div className="w-14 h-14 rounded-2xl bg-vault-900 border border-vault-750 flex items-center justify-center text-emerald mb-2 shadow-sm">
              <Lock className="w-7 h-7" aria-hidden />
            </div>
            <span className="font-bold text-white text-base">Direct Private Stream</span>
            <p className="max-w-xs text-xs text-vault-400 m-0">
              Only you and {partner.display_name} have access to this conversation.
            </p>
          </div>
        ) : (
          messages.map((msg, index) => {
            const prevMsg = messages[index - 1];
            const nextMsg = messages[index + 1];
            const isMe = msg.sender_id === userId;
            const sameSenderAsPrev = prevMsg && prevMsg.sender_id === msg.sender_id && !isSystem(prevMsg.content) && !isSystem(msg.content);
            const sameSenderAsNext = nextMsg && nextMsg.sender_id === msg.sender_id && !isSystem(nextMsg.content) && !isSystem(msg.content);

            return (
              <MessageRow
                key={msg.client_id ?? msg.id}
                msg={msg}
                isMe={isMe}
                isFirstInGroup={!sameSenderAsPrev}
                isLastInGroup={!sameSenderAsNext}
                isMiddleInGroup={Boolean(sameSenderAsPrev && sameSenderAsNext)}
                isPlaying={playingAudioId === msg.id}
                onToggleAudio={toggleAudio}
                onScrubAudio={handleScrubAudio}
                audioSpeed={audioSpeed}
                onCycleSpeed={cycleSpeed}
                onOpenMedia={onOpenMedia}
                onMediaLoaded={handleMediaLoaded}
                onOpenViewOncePhoto={handleOpenViewOncePhoto}
                onToggleViewOnceAudio={handleToggleViewOnceAudio}
                claimingViewOnceId={claimingViewOnceId}
                viewOnceConsumedIds={viewOnceConsumedIds}
                reactions={reactions[msg.id]}
                replyTarget={msg.reply_to_id ? messagesById[msg.reply_to_id] ?? null : undefined}
                replyTargetIsMe={msg.reply_to_id ? messagesById[msg.reply_to_id]?.sender_id === userId : false}
                partnerName={partner.display_name}
                myUserId={userId}
                onOpenActions={setActionMsg}
                onOpenDetails={setShowDetailsModal}
                onReply={startReply}
                onToggleReaction={toggleReaction}
                onRetry={retrySend}
                mineClass={theme.mine}
                playProgress={playingAudioId === msg.id ? audioProgress : 0}
                onRematch={startGame}
              />
            );
          })
        )}

        {isTyping && (
          <div className="flex items-center gap-1.5 bg-vault-900/90 backdrop-blur-md border border-vault-800 px-3.5 py-2 rounded-full w-20 text-emerald animate-pulse mt-2">
            <div className="w-1.5 h-1.5 bg-emerald rounded-full animate-bounce" />
            <div className="w-1.5 h-1.5 bg-emerald rounded-full animate-bounce [animation-delay:0.2s]" />
            <div className="w-1.5 h-1.5 bg-emerald rounded-full animate-bounce [animation-delay:0.4s]" />
          </div>
        )}
      </div>

      {/* Floating Scroll to Bottom Button */}
      {showScrollBottom && (
        <button
          type="button"
          onClick={() => scrollToBottom(true)}
          className="absolute right-4 bottom-20 z-30 glass-pill p-2.5 rounded-full text-vault-200 hover:text-white flex items-center gap-1.5 shadow-xl transition-transform active:scale-95 anim-spring-pop"
          aria-label="Scroll to newest message"
        >
          <ChevronDown className="w-5 h-5 text-emerald" />
          {unreadWhileScrolled > 0 && (
            <span className="badge !h-5 !min-w-[20px] text-[10px] font-bold">
              {unreadWhileScrolled}
            </span>
          )}
        </button>
      )}

      {/* 3. ALWAYS VISIBLE COMPOSER BAR */}
      <footer className="bg-vault-900 border-t border-vault-800 p-3 shrink-0 z-20">
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileUpload}
          accept="image/*"
          className="hidden"
          aria-label="File upload"
        />

        {(replyTo || editing) && !isRecordingAudio && !blockStatus.blocked && (
          <div className="flex items-center gap-2 mb-2 pl-3 pr-1 py-1.5 rounded-xl bg-vault-950 border-l-2 border-emerald anim-sheet">
            {editing ? <Pencil className="w-4 h-4 text-emerald shrink-0" aria-hidden /> : <Reply className="w-4 h-4 text-emerald shrink-0" aria-hidden />}
            <div className="min-w-0 flex-1">
              <div className="text-xs font-bold text-emerald">
                {editing ? 'Editing message' : `Replying to ${replyTo?.sender_id === userId ? 'yourself' : partner.display_name}`}
              </div>
              <div className="text-xs text-vault-300 truncate">{previewText((editing ?? replyTo)!.content)}</div>
            </div>
            <button type="button" onClick={cancelComposerMode} className="ib ib-s rounded-full" aria-label={editing ? 'Cancel editing' : 'Cancel reply'}>
              <X className="i" />
            </button>
          </div>
        )}

        {blockStatus.blocked ? (
          <div className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl bg-vault-950 border border-vault-800 text-xs text-vault-300">
            <span className="flex items-center gap-2">
              <Ban className="w-4 h-4 text-rose-400" aria-hidden />
              {blockStatus.iBlocked ? `You blocked ${partner.display_name}.` : 'You can’t send messages in this chat.'}
            </span>
            {blockStatus.iBlocked && (
              <button type="button" onClick={() => void toggleBlock()} className="btn btn-s btn-sm min-h-[36px]">Unblock</button>
            )}
          </div>
        ) : isRecordingAudio ? (
          <div
            className="relative flex items-center justify-between bg-red-950/80 border border-red-600/50 rounded-xl px-4 py-2.5 text-red-300 overflow-hidden"
            style={{ opacity: recordDragX <= RECORD_CANCEL_THRESHOLD * 0.6 ? 0.6 : 1 }}
          >
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-ping" />
              <span className="text-xs font-mono font-bold">REC {audioSeconds}s</span>
            </div>
            <span
              className="flex items-center gap-1 text-xs text-vault-400"
              style={{ transform: `translateX(${recordDragX}px)` }}
            >
              <ChevronLeft className="w-3.5 h-3.5" aria-hidden />
              Slide to cancel
            </span>
            <button
              type="button"
              onClick={() => handleStopVoiceRecord(true)}
              className="btn btn-p btn-sm"
            >
              Send
            </button>
          </div>
        ) : (
          <div className="flex items-end gap-2">
            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={() => { expectExternalActivity(); fileInputRef.current?.click(); }}
                disabled={isUploadingMedia}
                className="flex items-center justify-center !w-9 !h-9 rounded-full shrink-0 bg-gradient-to-br from-[#9333EA] to-[#C026D3] text-white shadow-md active:scale-95 transition-transform"
                aria-label="Attach photo"
                title="Attach photo"
              >
                {isUploadingMedia ? (
                  <RotateCcw className="w-4 h-4 animate-spin" />
                ) : (
                  <ImageIcon className="w-4 h-4" />
                )}
              </button>

              {/* Spoiler Mode Toggle */}
              <button
                type="button"
                onClick={() => {
                  selectionChange();
                  setSendAsSpoiler(prev => !prev);
                }}
                className={`ib ib-s rounded-xl shrink-0 !w-8 !h-8 ${
                  sendAsSpoiler ? '!bg-emerald/20 !border-emerald !text-emerald' : 'text-vault-400'
                }`}
                aria-label={sendAsSpoiler ? 'Spoiler blur active for photo' : 'Toggle spoiler blur for photo'}
                title={sendAsSpoiler ? 'Spoiler blur enabled' : 'Hide with Spoiler blur'}
              >
                {sendAsSpoiler ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>

            <form
              onSubmit={e => {
                e.preventDefault();
                if (inputContent.trim()) void handleSend();
              }}
              className="flex-1 min-w-0 flex items-end gap-2"
            >
              <div className="relative flex-1 min-w-0">
                <button
                  type="button"
                  onClick={() => setShowExtras(true)}
                  className="absolute left-1.5 bottom-[7px] ib ib-s !w-8 !h-8 rounded-lg z-10"
                  aria-label="Stickers and games"
                  title="Stickers and games"
                >
                  <Smile className="w-5 h-5 text-vault-300" />
                </button>
                <textarea
                  ref={inputRef}
                  rows={1}
                  value={inputContent}
                  onChange={e => handleInputChange(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Escape' && (replyTo || editing)) cancelComposerMode();
                    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && !isTouchDevice()) {
                      e.preventDefault();
                      void handleSend();
                    }
                  }}
                  maxLength={4000}
                  enterKeyHint={isTouchDevice() ? 'enter' : 'send'}
                  placeholder={editing ? 'Edit message…' : 'Message'}
                  className="inp w-full text-sm min-h-[44px] max-h-[132px] py-[11px] pl-11 leading-[20px] resize-none overflow-y-auto"
                />
              </div>

              {inputContent.trim() ? (
                <button
                  type="submit"
                  className="flex items-center justify-center !w-11 !h-11 !p-0 rounded-full shrink-0 bg-gradient-to-br from-[#9333EA] to-[#C026D3] text-white shadow-md active:scale-90 transition-transform anim-spring-pop"
                  aria-label="Send message"
                >
                  <Send className="w-4 h-4 fill-current" />
                </button>
              ) : (
                <button
                  type="button"
                  onPointerDown={handleRecordPointerDown}
                  onPointerMove={handleRecordPointerMove}
                  onPointerUp={handleRecordPointerUp}
                  onPointerCancel={() => handleStopVoiceRecord(false)}
                  className="flex items-center justify-center !w-11 !h-11 rounded-full shrink-0 touch-none select-none text-vault-200 active:scale-95 transition-transform"
                  aria-label="Hold to record a voice message, slide left to cancel"
                  title="Hold to record"
                >
                  <Mic className="w-5 h-5" />
                </button>
              )}
            </form>
          </div>
        )}
      </footer>

      {pendingPhoto && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Send photo"
          className="fixed inset-0 z-50 bg-black flex flex-col anim-fade"
        >
          <div className="flex items-center justify-between p-4 pt-[env(safe-area-inset-top)] shrink-0">
            <button type="button" onClick={cancelPendingPhoto} className="ib ib-s rounded-full glass-panel !text-white" aria-label="Cancel">
              <X className="i" aria-hidden />
            </button>
          </div>

          <div className="flex-1 flex items-center justify-center p-4 min-h-0">
            <img
              src={pendingPhoto.previewUrl}
              alt="Photo to send"
              className="max-w-full max-h-full object-contain rounded-xl"
            />
          </div>

          {/* Media retention — a big, unmissable 3-way choice, like Instagram's send screen. */}
          <div className="px-4 pt-3 shrink-0">
            <div
              className="grid grid-cols-3 gap-2 p-1.5 rounded-2xl bg-vault-900 border border-vault-750"
              role="radiogroup"
              aria-label="Media retention"
            >
              {(
                [
                  { mode: 'keep_in_chat' as const, label: 'Keep in Chat', icon: ImageIcon },
                  { mode: 'view_once' as const, label: 'View Once', icon: EyeOff },
                  { mode: 'allow_replay' as const, label: 'View Twice', icon: Repeat },
                ]
              ).map(opt => (
                <button
                  key={opt.mode}
                  type="button"
                  role="radio"
                  aria-checked={pendingPhotoMode === opt.mode}
                  onClick={() => { selectionChange(); setPendingPhotoMode(opt.mode); }}
                  className={`flex flex-col items-center justify-center gap-1 py-2.5 rounded-xl text-[11px] font-bold transition-all ${
                    pendingPhotoMode === opt.mode
                      ? 'bg-gradient-to-br from-[#9333EA] to-[#C026D3] text-white shadow-md scale-[1.03]'
                      : 'text-vault-300 hover:text-white'
                  }`}
                >
                  <opt.icon className="w-5 h-5" aria-hidden />
                  <span>{opt.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="p-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] flex items-center justify-center gap-4 shrink-0">
            <p className="t-sm text-vault-300 m-0 flex-1 text-center">
              {pendingPhotoMode === 'view_once'
                ? 'Disappears after they open it once'
                : pendingPhotoMode === 'allow_replay'
                  ? 'Disappears after they open it twice'
                  : 'Stays in the chat'}
            </p>
            <button
              type="button"
              onClick={() => void confirmSendPendingPhoto()}
              disabled={isUploadingMedia}
              className="flex items-center justify-center !w-14 !h-14 rounded-full shrink-0 bg-gradient-to-br from-[#9333EA] to-[#C026D3] text-white shadow-lg active:scale-90 transition-transform"
              aria-label="Send photo"
            >
              {isUploadingMedia ? <RotateCcw className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5 fill-current" />}
            </button>
          </div>
        </div>
      )}

      {showChatMenu && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Chat options"
          className="fixed inset-0 z-50 bg-black/70 flex items-end sm:items-center justify-center anim-fade"
          onClick={() => { setShowChatMenu(false); setConfirmBlock(false); }}
          onKeyDown={e => { if (e.key === 'Escape') { setShowChatMenu(false); setConfirmBlock(false); } }}
        >
          <div className="w-full sm:max-w-sm bg-vault-900 border border-vault-800 rounded-t-2xl sm:rounded-2xl p-2 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-2xl anim-sheet" onClick={e => e.stopPropagation()}>
            <div className="w-9 h-1 rounded-full bg-vault-700 mx-auto my-2 sm:hidden" aria-hidden />
            <div className="flex flex-col items-center gap-2 pt-2 pb-4">
              <Avatar name={partner.display_name} seed={partner.uid} src={partner.avatar_url} size={72} />
              <p className="t-h3 font-bold text-white m-0 truncate max-w-full px-4">{partner.display_name}</p>
              <div className="flex items-center gap-6 mt-1">
                <button
                  type="button"
                  onClick={() => { setShowChatMenu(false); setShowContactModal(true); }}
                  className="flex flex-col items-center gap-1 text-vault-300 hover:text-white"
                >
                  <span className="ib ib-s rounded-full !w-11 !h-11"><ShieldCheck className="w-4 h-4" aria-hidden /></span>
                  <span className="t-cap">Profile</span>
                </button>
                <button
                  type="button"
                  onClick={() => { setShowChatMenu(false); void toggleMute(); }}
                  className="flex flex-col items-center gap-1 text-vault-300 hover:text-white"
                >
                  <span className="ib ib-s rounded-full !w-11 !h-11">{isMuted ? <BellOff className="w-4 h-4" aria-hidden /> : <Bell className="w-4 h-4" aria-hidden />}</span>
                  <span className="t-cap">{isMuted ? 'Unmute' : 'Mute'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => { setShowChatMenu(false); setShowThemeSheet(true); }}
                  className="flex flex-col items-center gap-1 text-vault-300 hover:text-white"
                >
                  <span className="ib ib-s rounded-full !w-11 !h-11"><Palette className="w-4 h-4" aria-hidden /></span>
                  <span className="t-cap">Theme</span>
                </button>
              </div>
            </div>
            <div className="divider mb-1" />
            <button
              type="button"
              className="w-full flex items-center gap-3 px-4 min-h-[48px] text-sm text-white hover:bg-vault-800 rounded-xl"
              onClick={() => { setShowChatMenu(false); setShowThemeSheet(true); }}
            >
              <Palette className="w-4 h-4 text-emerald" /> Chat theme ({theme.label})
            </button>
            <button
              type="button"
              className="w-full flex items-center gap-3 px-4 min-h-[48px] text-sm text-white hover:bg-vault-800 rounded-xl"
              onClick={() => { setShowChatMenu(false); setShowNotificationSheet(true); }}
            >
              <Bell className="w-4 h-4 text-emerald" /> Notification style
            </button>
            <button
              type="button"
              className="w-full flex items-center gap-3 px-4 min-h-[48px] text-sm text-white hover:bg-vault-800 rounded-xl"
              onClick={() => { setShowChatMenu(false); setShowTimerSheet(true); }}
            >
              <Timer className="w-4 h-4 text-emerald" /> Disappearing messages ({timerLabel(disappearAfter ?? 0)})
            </button>
            <button
              type="button"
              className="w-full flex items-center gap-3 px-4 min-h-[48px] text-sm text-white hover:bg-vault-800 rounded-xl"
              onClick={() => { setShowChatMenu(false); setShowReportModal(true); }}
            >
              <Flag className="w-4 h-4 text-amber-400" /> Report user
            </button>
            {blockStatus.iBlocked ? (
              <button
                type="button"
                className="w-full flex items-center gap-3 px-4 min-h-[48px] text-sm text-emerald hover:bg-vault-800 rounded-xl"
                onClick={() => void toggleBlock()}
              >
                <Ban className="w-4 h-4" /> Unblock {partner.display_name}
              </button>
            ) : confirmBlock ? (
              <button
                type="button"
                className="w-full flex items-center gap-3 px-4 min-h-[48px] text-sm text-rose-400 hover:bg-vault-800 rounded-xl"
                onClick={() => void toggleBlock()}
              >
                <Ban className="w-4 h-4" /> Tap again to block
              </button>
            ) : (
              <button
                type="button"
                className="w-full flex items-center gap-3 px-4 min-h-[48px] text-sm text-rose-400 hover:bg-vault-800 rounded-xl"
                onClick={() => setConfirmBlock(true)}
              >
                <Ban className="w-4 h-4" /> Block {partner.display_name}
              </button>
            )}
          </div>
        </div>
      )}

      {showTimerSheet && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Disappearing timer"
          className="fixed inset-0 z-50 bg-black/70 flex items-end sm:items-center justify-center anim-fade"
          onClick={() => setShowTimerSheet(false)}
        >
          <div className="w-full sm:max-w-sm bg-vault-900 border border-vault-800 rounded-t-2xl sm:rounded-2xl p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-2xl anim-sheet" onClick={e => e.stopPropagation()}>
            <h3 className="t-h3 font-bold text-white mb-3">Disappearing Messages</h3>
            <div className="space-y-1">
              {[
                { label: 'Off', seconds: null },
                { label: '24 hours', seconds: 86400 },
                { label: '7 days', seconds: 604800 },
                { label: '90 days', seconds: 7776000 },
              ].map(opt => (
                <button
                  key={String(opt.seconds)}
                  type="button"
                  onClick={() => void changeDisappearing(opt.seconds)}
                  className={`w-full flex items-center justify-between px-4 py-3 rounded-xl text-sm font-medium ${
                    disappearAfter === opt.seconds ? 'bg-emerald text-vault-950 font-bold' : 'text-vault-200 hover:bg-vault-800'
                  }`}
                >
                  <span>{opt.label}</span>
                  {disappearAfter === opt.seconds && <Check className="w-4 h-4" />}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {showThemeSheet && (
        <ChatThemeSheet
          current={themeId}
          onPick={changeTheme}
          onClose={() => setShowThemeSheet(false)}
        />
      )}

      {showNotificationSheet && (
        <NotificationPreferenceSheet
          partner={partner}
          onClose={() => setShowNotificationSheet(false)}
        />
      )}

      {showExtras && (
        <ChatExtrasSheet
          canPlayGames={true}
          onSticker={sendSticker}
          onStartGame={() => startGame('tic_tac_toe')}
          onShareScore={sendScoreCard}
          onClose={() => setShowExtras(false)}
        />
      )}

      {actionMsg && (
        <MessageActionSheet
          msg={actionMsg}
          isMe={actionMsg.sender_id === userId}
          myReaction={reactions[actionMsg.id]?.find(r => r.user_id === userId)?.emoji}
          onClose={() => setActionMsg(null)}
          onReact={emoji => {
            void toggleReaction(actionMsg, emoji);
            setActionMsg(null);
          }}
          onReply={() => { startReply(actionMsg); setActionMsg(null); }}
          onCopy={() => {
            void navigator.clipboard?.writeText(actionMsg.content).then(
              () => showToast('Copied to clipboard', 'success'),
              () => showToast('Could not copy', 'error'),
            );
            setActionMsg(null);
          }}
          onEdit={() => { startEdit(actionMsg); setActionMsg(null); }}
          onDelete={() => { void deleteForEveryone(actionMsg); setActionMsg(null); }}
          onDiscard={() => { discardFailed(actionMsg); setActionMsg(null); }}
          onDetails={() => {
            setShowDetailsModal(actionMsg);
            setActionMsg(null);
          }}
        />
      )}

      {showDetailsModal && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 anim-fade"
          onClick={() => setShowDetailsModal(null)}
        >
          <div className="w-full max-w-sm glass-panel rounded-2xl p-5 shadow-2xl anim-modal" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between pb-3 border-b border-vault-800">
              <h3 className="t-h3 font-bold text-white flex items-center gap-2">
                <Info className="w-4 h-4 text-emerald" /> Message Info
              </h3>
              <button type="button" onClick={() => setShowDetailsModal(null)} className="ib ib-s rounded-full">
                <X className="i" />
              </button>
            </div>
            <div className="py-3 space-y-2 text-xs">
              <div className="flex justify-between text-vault-300">
                <span>Sent by:</span>
                <span className="font-semibold text-white">{showDetailsModal.sender_id === userId ? 'You' : partner.display_name}</span>
              </div>
              <div className="flex justify-between text-vault-300">
                <span>Timestamp:</span>
                <span className="font-mono text-vault-100">{new Date(showDetailsModal.created_at).toLocaleString()}</span>
              </div>
              {showDetailsModal.edited_at && (
                <div className="flex justify-between text-vault-300">
                  <span>Edited at:</span>
                  <span className="font-mono text-vault-100">{new Date(showDetailsModal.edited_at).toLocaleString()}</span>
                </div>
              )}
              <div className="flex justify-between text-vault-300">
                <span>Status:</span>
                <span className="capitalize font-semibold text-emerald">
                  {showDetailsModal.status ?? (showDetailsModal.is_read ? 'Read' : 'Delivered')}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {showReportModal && (
        <ReportUserModal
          partner={partner}
          conversationId={conversationId}
          partnerMessages={messages.filter(m => m.sender_id === partner.id && !m.deleted_at && !isSystem(m.content))}
          onClose={() => setShowReportModal(false)}
          canBlock={!blockStatus.iBlocked}
          onBlock={async () => {
            if (!userId) return;
            await blockUser(userId, partner.id);
            setBlockStatus(await getBlockStatus(partner.id));
          }}
        />
      )}

      {showContactModal && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex justify-end anim-fade"
        >
          <div className="w-full max-w-sm bg-vault-900 h-full border-l border-vault-800 shadow-2xl relative flex flex-col">
            <div className="p-3 pt-[calc(0.75rem+env(safe-area-inset-top))] border-b border-vault-800 flex items-center justify-between bg-vault-950">
              <span className="t-body font-bold text-white">Contact info</span>
              <button
                type="button"
                onClick={() => setShowContactModal(false)}
                className="ib ib-s rounded-full"
                aria-label="Close contact settings"
              >
                <X className="i" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto min-h-0">
              <ContactDossier
                partner={partner}
                conversationId={conversationId}
                onOpenMedia={onOpenMedia}
                className="!w-full !border-0 !h-auto"
              />
            </div>
          </div>
        </div>
      )}

      {/* 4. VIEW ONCE EPHEMERAL FULLSCREEN VIEWER */}
      {activeViewOnceItem && (
        <LightboxViewer
          item={{
            id: activeViewOnceItem.id,
            user_id: activeViewOnceItem.sender_id,
            image_url: activeViewOnceItem.url,
            storage_path: '',
            caption: 'View once photo',
            created_at: activeViewOnceItem.created_at,
          }}
          isViewOnce={true}
          onClose={() => {
            lightImpact();
            setActiveViewOnceItem(null);
          }}
        />
      )}

      {/* Full-screen viewer for ordinary (non-ephemeral) chat photos — tap any photo to open it,
          like a normal Instagram DM photo. */}
      {activeMediaUrl && (
        <LightboxViewer
          item={{
            id: 'chat-media',
            user_id: userId ?? '',
            image_url: activeMediaUrl,
            storage_path: '',
            caption: null,
            created_at: new Date().toISOString(),
          }}
          onClose={() => {
            lightImpact();
            setActiveMediaUrl(null);
          }}
        />
      )}
    </div>
  );
};

const EDIT_WINDOW_MS = 15 * 60 * 1000;
const isTouchDevice = () => typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;
const PAGE_SIZE = 50;

function outboxToMessage(item: OutboxItem, status: MessageItem['status']): MessageItem {
  return {
    id: `local:${item.client_id}`,
    conversation_id: item.conversation_id,
    sender_id: item.sender_id,
    content: item.content,
    is_read: false,
    created_at: item.created_at,
    client_id: item.client_id,
    reply_to_id: item.reply_to_id,
    status,
  };
}

const isDeleted = (m: MessageItem) => Boolean(m.deleted_at) || m.content === '[DELETED]';
const isSystem = isSystemMessage;
const systemText = systemMessageText;

function previewText(content: string): string {
  if (isSystem(content)) return 'Chat setting changed';
  if (content.startsWith('[IMAGE:VIEW_ONCE]') || content.startsWith('[IMAGE:view_once]')) return '1 View Once Photo';
  if (content.startsWith('[IMAGE:SPOILER]') || content.startsWith('[IMAGE:spoiler]')) return '📷 Sensitive Photo';
  return readableMessagePreview(content);
}

interface MessageRowProps {
  msg: MessageItem;
  isMe: boolean;
  isFirstInGroup: boolean;
  isLastInGroup: boolean;
  isMiddleInGroup: boolean;
  isPlaying: boolean;
  onToggleAudio: (msgId: string, audioUrl: string) => void;
  onScrubAudio: (progress: number) => void;
  audioSpeed: number;
  onCycleSpeed: () => void;
  onOpenMedia?: (url: string) => void;
  onMediaLoaded: () => void;
  onOpenViewOncePhoto: (msg: MessageItem, rawUrl: string) => void;
  onToggleViewOnceAudio: (msg: MessageItem, rawUrl: string) => void;
  claimingViewOnceId: string | null;
  viewOnceConsumedIds: Set<string>;
  reactions?: MessageReaction[];
  replyTarget?: MessageItem | null;
  replyTargetIsMe: boolean;
  partnerName: string;
  myUserId?: string;
  onOpenActions: (msg: MessageItem) => void;
  onOpenDetails: (msg: MessageItem) => void;
  onReply: (msg: MessageItem) => void;
  onToggleReaction: (msg: MessageItem, emoji: ReactionEmoji) => void;
  onRetry: (msg: MessageItem) => void;
  mineClass: string;
  playProgress: number;
  onRematch: (gameId: CoverGameType) => void;
}

const MessageRow = memo(function MessageRow(props: MessageRowProps) {
  const { msg, isMe, partnerName } = props;
  if (isSystem(msg.content)) {
    return (
      <div className="flex justify-center my-3" role="note">
        <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-vault-900 border border-vault-800 text-xs text-vault-300">
          <Timer className="w-3.5 h-3.5 text-emerald" aria-hidden />
          {isMe ? 'You' : partnerName} {systemText(msg.content)}
        </span>
      </div>
    );
  }
  return <MessageBubble {...props} />;
});

function MessageBubble({
  msg,
  isMe,
  isFirstInGroup,
  isLastInGroup,
  isMiddleInGroup,
  isPlaying,
  onToggleAudio,
  onScrubAudio,
  audioSpeed,
  onCycleSpeed,
  onOpenMedia,
  onMediaLoaded,
  onOpenViewOncePhoto,
  onToggleViewOnceAudio,
  claimingViewOnceId,
  viewOnceConsumedIds,
  reactions,
  replyTarget,
  replyTargetIsMe,
  partnerName,
  myUserId,
  onOpenActions,
  onReply,
  onToggleReaction,
  onRetry,
  mineClass,
  playProgress,
  onRematch,
}: MessageRowProps) {
  const [imageFailed, setImageFailed] = useState(false);
  const { getHighScore } = useGame();
  const deleted = isDeleted(msg);
  const isViewOnceImage = !deleted && Boolean(
    (msg.is_view_once && (msg.content.startsWith('[IMAGE') || !msg.content.startsWith('['))) ||
    msg.content.startsWith('[IMAGE:VIEW_ONCE]') ||
    msg.content.startsWith('[IMAGE:view_once]')
  );
  const isAllowReplayImage = !deleted && !isViewOnceImage && msg.content.startsWith('[IMAGE:ALLOW_REPLAY]');
  const isEphemeralImage = isViewOnceImage || isAllowReplayImage;
  const isSpoiler = !deleted && !isEphemeralImage && (msg.content.startsWith('[IMAGE:SPOILER]') || msg.content.startsWith('[IMAGE:spoiler]'));
  const isImage = !deleted && (msg.content.startsWith('[IMAGE]') || isSpoiler || isEphemeralImage);
  const voice = deleted ? undefined : parseVoiceNote(msg.content);
  const isVoice = Boolean(voice);
  const isViewOnceVoice = !deleted && Boolean(voice?.isViewOnce || (msg.is_view_once && isVoice));
  const isAllowReplayVoice = !deleted && !isViewOnceVoice && Boolean(voice?.isAllowReplay);
  const isEphemeralVoice = isViewOnceVoice || isAllowReplayVoice;
  const ephemeralViewMode: 'view_once' | 'allow_replay' = (isAllowReplayImage || isAllowReplayVoice) ? 'allow_replay' : 'view_once';
  const ephemeralMaxViews = ephemeralViewMode === 'allow_replay' ? 2 : 1;
  const ephemeralViewsUsed = msg.view_count ?? (msg.view_once_opened_at ? 1 : 0);
  const isViewOnceOpened = ephemeralViewsUsed >= ephemeralMaxViews || viewOnceConsumedIds.has(msg.id);

  const imageUrl = isEphemeralImage
    ? msg.content.replace(/^\[IMAGE:VIEW_ONCE\]|^\[IMAGE:view_once\]|^\[IMAGE:ALLOW_REPLAY\]|^\[IMAGE\]/, '')
    : isSpoiler
    ? msg.content.replace(/^\[IMAGE:spoiler\]|^\[IMAGE:SPOILER\]/, '')
    : isImage
    ? msg.content.slice('[IMAGE]'.length)
    : '';
  const voiceDuration = voice?.duration ?? '0:00';
  const voiceUrl = voice?.url ?? '';
  const sticker = deleted ? undefined : parseSticker(msg.content);
  const score = deleted ? undefined : parseScore(msg.content);
  const gameRef = deleted ? undefined : parseGame(msg.content);
  const bare = Boolean(sticker || score || gameRef || (isImage && !isEphemeralImage));

  const [dragOffset, setDragOffset] = useState(0);
  const [isSwiping, setIsSwiping] = useState(false);
  const [showHeartBurst, setShowHeartBurst] = useState(false);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const touchDirectionRef = useRef<'horizontal' | 'vertical' | null>(null);
  const thresholdTriggeredRef = useRef(false);
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressFiredRef = useRef(false);
  const lastTapRef = useRef(0);

  const cancelPress = () => {
    if (pressTimer.current) clearTimeout(pressTimer.current);
    pressTimer.current = null;
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length !== 1) return;
    const touch = e.touches[0];
    touchStartRef.current = { x: touch.clientX, y: touch.clientY };
    touchDirectionRef.current = null;
    thresholdTriggeredRef.current = false;
    longPressFiredRef.current = false;

    pressTimer.current = setTimeout(() => {
      longPressFiredRef.current = true;
      lightImpact();
      onOpenActions(msg);
    }, 450);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!touchStartRef.current || e.touches.length !== 1) return;
    const touch = e.touches[0];
    const dx = touch.clientX - touchStartRef.current.x;
    const dy = touch.clientY - touchStartRef.current.y;

    if (!touchDirectionRef.current) {
      if (Math.hypot(dx, dy) > 8) {
        cancelPress();
        if (Math.abs(dx) > Math.abs(dy)) {
          touchDirectionRef.current = 'horizontal';
          setIsSwiping(true);
        } else {
          touchDirectionRef.current = 'vertical';
        }
      }
    }

    if (touchDirectionRef.current === 'horizontal') {
      if (dx > 0) {
        const bounded = dx > 50 ? 50 + Math.pow(dx - 50, 0.65) * 4 : dx;
        setDragOffset(bounded);

        if (bounded >= 45 && !thresholdTriggeredRef.current) {
          thresholdTriggeredRef.current = true;
          lightImpact();
        } else if (bounded < 45 && thresholdTriggeredRef.current) {
          thresholdTriggeredRef.current = false;
        }
      }
    }
  };

  const handleTouchEnd = () => {
    cancelPress();
    if (touchDirectionRef.current === 'horizontal') {
      if (dragOffset >= 45) {
        onReply(msg);
      }
    } else if (!touchDirectionRef.current && !longPressFiredRef.current && !bare && !deleted) {
      // Plain tap with no swipe/hold: check for a double-tap-to-heart-react.
      const now = Date.now();
      if (now - lastTapRef.current < 300) {
        lastTapRef.current = 0;
        mediumImpact();
        onToggleReaction(msg, '❤️');
        setShowHeartBurst(true);
        setTimeout(() => setShowHeartBurst(false), 650);
      } else {
        lastTapRef.current = now;
      }
    }
    setDragOffset(0);
    setIsSwiping(false);
    touchStartRef.current = null;
    touchDirectionRef.current = null;
    thresholdTriggeredRef.current = false;
  };

  const reactionGroups = useMemo(() => {
    const groups: { emoji: ReactionEmoji; count: number; mine: boolean }[] = [];
    for (const r of reactions ?? []) {
      const g = groups.find(x => x.emoji === r.emoji);
      if (g) {
        g.count += 1;
        g.mine ||= r.user_id === myUserId;
      } else {
        groups.push({ emoji: r.emoji, count: 1, mine: r.user_id === myUserId });
      }
    }
    return groups;
  }, [reactions, myUserId]);

  const bubbleRadiusClass = useMemo(() => {
    if (bare) return '';
    if (isMe) {
      if (isFirstInGroup && isLastInGroup) return 'rounded-3xl';
      if (isFirstInGroup) return 'rounded-3xl rounded-br-md';
      if (isMiddleInGroup) return 'rounded-3xl rounded-r-md';
      if (isLastInGroup) return 'rounded-3xl rounded-br-md';
      return 'rounded-3xl';
    } else {
      if (isFirstInGroup && isLastInGroup) return 'rounded-3xl';
      if (isFirstInGroup) return 'rounded-3xl rounded-bl-md';
      if (isMiddleInGroup) return 'rounded-3xl rounded-l-md';
      if (isLastInGroup) return 'rounded-3xl rounded-bl-md';
      return 'rounded-3xl';
    }
  }, [bare, isMe, isFirstInGroup, isLastInGroup, isMiddleInGroup]);

  const image = (
    <span className="relative block w-56 max-w-full aspect-[4/5] rounded-2xl overflow-hidden bg-vault-900 border border-white/10 shadow-md">
      {imageFailed ? (
        <span className="absolute inset-0 flex items-center justify-center text-center text-xs p-3 opacity-80">
          Photo unavailable
        </span>
      ) : (
        <ChatImage
          url={imageUrl}
          alt="Shared photo"
          loading="lazy"
          decoding="async"
          onLoad={onMediaLoaded}
          onError={() => setImageFailed(true)}
          isSpoiler={isSpoiler}
          className="absolute inset-0 w-full h-full object-cover"
          fallback={
            <span className="absolute inset-0 flex items-center justify-center text-center text-xs p-3 opacity-80">Photo unavailable</span>
          }
        />
      )}
      <div className="absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-black/70 to-transparent pointer-events-none" />
    </span>
  );

  return (
    <div
      className={`relative group flex flex-col ${isMe ? 'items-end' : 'items-start'} ${
        isFirstInGroup ? 'mt-3.5' : 'mt-0.5'
      } ${reactionGroups.length ? 'mb-2' : ''}`}
    >
      {/* Swipe to Reply Affordance Icon */}
      {dragOffset > 5 && (
        <div
          className="absolute left-0 top-1/2 -translate-y-1/2 flex items-center justify-center w-9 h-9 rounded-full bg-emerald text-vault-950 shadow-md transition-opacity"
          style={{
            transform: `translateY(-50%) scale(${Math.min(1, dragOffset / 40)})`,
            opacity: Math.min(1, dragOffset / 35),
          }}
        >
          <Reply className="w-4 h-4 fill-current stroke-[2.5]" />
        </div>
      )}

      {/* Double-tap-to-heart burst */}
      {showHeartBurst && (
        <div className="absolute inset-0 flex items-center justify-center z-20 pointer-events-none">
          <Heart className="w-16 h-16 text-rose-500 fill-rose-500 drop-shadow-lg anim-spring-pop" aria-hidden />
        </div>
      )}

      <div
        className={`relative flex items-center gap-1.5 max-w-[84%] sm:max-w-[76%] ${
          isMe ? 'flex-row-reverse' : ''
        }`}
        style={{
          transform: `translateX(${dragOffset}px)`,
          transition: isSwiping ? 'none' : 'transform 240ms cubic-bezier(0.16, 1, 0.3, 1)',
        }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
        onContextMenu={e => {
          e.preventDefault();
          onOpenActions(msg);
        }}
      >
        <div
          className={`relative min-w-0 ${bare ? 'p-0' : isImage && !isEphemeralImage ? 'p-1' : isEphemeralImage || isEphemeralVoice ? 'p-0 bg-transparent shadow-none' : 'px-3.5 py-2.5'} text-[15px] leading-[22px] break-words select-text ${
            msg.status ? 'opacity-70' : ''
          } ${
            bare || isEphemeralImage || isEphemeralVoice
              ? 'bg-transparent'
              : deleted
              ? 'bg-transparent border border-vault-750 text-vault-400 italic rounded-2xl'
              : isMe
              ? `${mineClass} font-normal shadow-sm ${bubbleRadiusClass}`
              : `bg-[#1B1D21] border border-white/[0.06] text-[#F4F5F6] shadow-sm ${bubbleRadiusClass}`
          }`}
        >
          {replyTarget !== undefined && !deleted && (
            <div
              className={`mb-1.5 px-2.5 py-1 rounded-lg border-l-2 text-xs ${
                isMe ? 'bg-black/20 border-emerald-300' : 'bg-black/30 border-emerald'
              }`}
            >
              <div className="font-bold opacity-90">{replyTarget ? (replyTargetIsMe ? 'You' : partnerName) : 'Original message'}</div>
              <div className="truncate opacity-80">{replyTarget ? previewText(replyTarget.content) : 'Earlier message'}</div>
            </div>
          )}

          {deleted ? (
            <span>This message was deleted</span>
          ) : sticker ? (
            sticker.kind === 'emoji' ? (
              <span className="block text-7xl leading-none animate-slide-up" role="img" aria-label={`Sticker: ${sticker.label}`}>{sticker.art}</span>
            ) : (
              <span
                className="block px-4 py-3 rounded-2xl bg-vault-900 border-2 border-emerald text-emerald text-2xl font-black tracking-wider -rotate-3 animate-slide-up"
                role="img"
                aria-label={`Sticker: ${sticker.label}`}
              >
                {sticker.art}
              </span>
            )
          ) : score ? (
            <div className="w-[220px] rounded-2xl bg-vault-900/90 backdrop-blur-md border border-amber-500/40 p-3.5 text-white shadow-lg">
              <div className="flex items-center gap-2 text-xs font-bold text-amber-400">
                <Trophy className="w-4 h-4" aria-hidden /> {COVER_GAMES.find(g => g.id === score.gameId)?.name ?? 'Game'}
              </div>
              <div className="text-3xl font-black font-mono mt-1">{score.score}</div>
              <div className="text-xs text-vault-300 mt-1">
                {isMe
                  ? 'Your best score. Can they beat it?'
                  : (() => {
                      const mine = getHighScore(score.gameId as CoverGameType);
                      if (!mine) return 'Beat that! Play it on the home screen.';
                      return mine > score.score ? `Your best is ${mine}. You're ahead.` : `Your best is ${mine}. Time to beat it!`;
                    })()}
              </div>
            </div>
          ) : gameRef ? (
            <ChatGameCard gameId={gameRef.id} myUserId={myUserId} partnerName={partnerName} onRematch={() => onRematch(gameRef.id as CoverGameType)} />
          ) : isEphemeralImage ? (
            <ViewOnceImageBubble
              isMe={isMe}
              isOpened={isViewOnceOpened}
              onOpen={() => onOpenViewOncePhoto(msg, imageUrl)}
              isLoading={claimingViewOnceId === msg.id}
              viewMode={ephemeralViewMode}
              viewsUsed={ephemeralViewsUsed}
            />
          ) : isEphemeralVoice ? (
            <ViewOnceAudioBubble
              isMe={isMe}
              isOpened={isViewOnceOpened}
              duration={voiceDuration}
              levels={voice?.levels ?? null}
              isPlaying={isPlaying}
              onTogglePlay={() => onToggleViewOnceAudio(msg, voiceUrl)}
              isLoading={claimingViewOnceId === msg.id}
              playProgress={playProgress}
              viewMode={ephemeralViewMode}
              viewsUsed={ephemeralViewsUsed}
            />
          ) : isImage ? (
            onOpenMedia && !imageFailed ? (
              <button
                type="button"
                onClick={() => void resolveChatMediaUrl(imageUrl).then(src => { if (src) onOpenMedia(src); })}
                className="block p-0 border-0 bg-transparent cursor-pointer rounded-2xl overflow-hidden"
                aria-label="Open photo"
              >
                {image}
              </button>
            ) : (
              image
            )
          ) : isVoice ? (
            <div className="flex items-center gap-3 min-w-[220px] py-1">
              <button
                type="button"
                onClick={() => onToggleAudio(msg.id, voiceUrl)}
                className={`w-11 h-11 shrink-0 rounded-full flex items-center justify-center ${
                  isMe ? 'bg-black/70 text-white border border-white/15' : 'bg-[#10B981] text-[#04120C]'
                } active:scale-95 transition-transform shadow-md`}
                aria-label={isPlaying ? 'Pause voice message' : 'Play voice message'}
              >
                {isPlaying ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current ml-0.5" />}
              </button>
              <div className="flex-1 space-y-1.5">
                {/* Interactive Scrubber Waveform */}
                <div
                  className="flex items-center gap-[2.5px] h-8 cursor-pointer py-1"
                  onClick={e => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    const x = e.clientX - rect.left;
                    const p = Math.max(0, Math.min(1, x / rect.width));
                    onScrubAudio(p);
                  }}
                  aria-hidden
                >
                  {(voice?.levels ?? Array.from({ length: WAVEFORM_BARS }, (_, i) => 0.25 + 0.2 * Math.abs(Math.sin(i * 1.7)))).map((level, i, all) => {
                    const played = isPlaying && i / all.length < playProgress;
                    return (
                      <span
                        key={i}
                        className={`flex-1 rounded-full transition-all ${
                          isMe ? 'bg-current' : 'bg-[#10B981]'
                        } ${played ? 'opacity-100 scale-y-105' : 'opacity-35'}`}
                        style={{ height: `${Math.max(16, Math.round(level * 100))}%` }}
                      />
                    );
                  })}
                </div>
                <div className="flex items-center justify-between text-[11px] font-mono">
                  <span className={isMe ? 'opacity-75' : 'text-vault-400'}>
                    {voiceDuration}
                  </span>
                  {isPlaying && (
                    <button
                      type="button"
                      onClick={e => {
                        e.stopPropagation();
                        onCycleSpeed();
                      }}
                      className="px-1.5 py-0.5 rounded bg-black/40 text-emerald text-[10px] font-bold border border-emerald/30 hover:bg-black/60"
                      aria-label="Change playback speed"
                    >
                      {audioSpeed}x
                    </button>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <span className="whitespace-pre-wrap">{msg.content}</span>
          )}

          {reactionGroups.length > 0 && (
            <div className={`absolute -bottom-3.5 ${isMe ? 'right-2' : 'left-2'} flex gap-1 z-10`}>
              {reactionGroups.map(g => (
                <button
                  key={g.emoji}
                  type="button"
                  onClick={() => onToggleReaction(msg, g.emoji)}
                  className={`h-6 px-2 rounded-full text-xs flex items-center gap-1 border shadow-md ${
                    g.mine ? 'bg-emerald/20 border-emerald text-emerald-300' : 'bg-vault-900 border-vault-750 text-white'
                  }`}
                  aria-label={`${g.emoji} ${g.count}${g.mine ? ', including you. Tap to remove' : ''}`}
                >
                  <span>{g.emoji}</span>
                  {g.count > 1 && <span className="font-semibold text-[11px]">{g.count}</span>}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Desktop context action affordance */}
        {!deleted && !msg.status && (
          <button
            type="button"
            onClick={() => onOpenActions(msg)}
            className="hidden md:flex opacity-0 group-hover:opacity-100 focus:opacity-100 w-8 h-8 rounded-full items-center justify-center text-vault-400 hover:text-white hover:bg-vault-800 shrink-0 transition-opacity"
            aria-label="Message actions"
          >
            <Reply className="w-4 h-4" aria-hidden />
          </button>
        )}
      </div>

      {msg.status === 'failed' ? (
        <button
          type="button"
          onClick={() => onRetry(msg)}
          className="flex items-center gap-1 text-[11px] text-rose-400 mt-1 px-1 min-h-[24px]"
        >
          <AlertCircle className="w-3.5 h-3.5" aria-hidden /> Not sent. Tap to retry
        </button>
      ) : (isLastInGroup || msg.status || isImage) && (
        <div className={`flex items-center gap-1.5 text-[11px] text-vault-400 font-mono mt-1 px-1.5 ${isMe ? 'justify-end' : 'justify-start'}`}>
          {msg.edited_at && !deleted && <span className="font-sans italic text-vault-500">edited</span>}
          <span>{formatTimestamp(msg.created_at)}</span>
          {isMe &&
            (msg.status ? (
              <span className="flex items-center gap-1 text-vault-500" aria-label={msg.status === 'queued' ? 'Waiting for connection' : 'Sending'}>
                <Clock className="w-3.5 h-3.5" aria-hidden />
                {msg.status === 'queued' && <span className="font-sans text-[10px]">Queued</span>}
              </span>
            ) : msg.is_read ? (
              <CheckCheck className="w-3.5 h-3.5 text-emerald" aria-label="Read" />
            ) : (
              <Check className="w-3.5 h-3.5 text-vault-500" aria-label="Sent" />
            ))}
        </div>
      )}
    </div>
  );
}

interface MessageActionSheetProps {
  msg: MessageItem;
  isMe: boolean;
  myReaction?: ReactionEmoji;
  onClose: () => void;
  onReact: (emoji: ReactionEmoji) => void;
  onReply: () => void;
  onCopy: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onDiscard: () => void;
  onDetails: () => void;
}

function MessageActionSheet({
  msg,
  isMe,
  myReaction,
  onClose,
  onReact,
  onReply,
  onCopy,
  onEdit,
  onDelete,
  onDiscard,
  onDetails,
}: MessageActionSheetProps) {
  const failed = msg.status === 'failed';
  const deleted = isDeleted(msg);
  const withinWindow = Date.now() - new Date(msg.created_at).getTime() < EDIT_WINDOW_MS;
  const isText = !msg.content.startsWith('[');
  const canEdit = isMe && !failed && !deleted && isText && withinWindow;
  const canDelete = isMe && !failed && !deleted && withinWindow;
  const [confirmDelete, setConfirmDelete] = useState(false);

  const item = 'w-full flex items-center gap-3 px-4 min-h-[48px] text-sm text-white hover:bg-vault-800 rounded-xl transition-colors';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Message actions"
      className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-end sm:items-center justify-center anim-fade"
      onClick={onClose}
      onKeyDown={e => { if (e.key === 'Escape') onClose(); }}
    >
      <div
        className="w-full sm:max-w-sm glass-panel rounded-t-2xl sm:rounded-2xl p-2.5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-2xl anim-sheet"
        onClick={e => e.stopPropagation()}
      >
        <p className="px-4 pt-2 pb-2.5 text-xs text-vault-400 truncate">{previewText(msg.content)}</p>

        {/* Floating Quick-Reactions Bar */}
        {!failed && !deleted && (
          <div className="flex justify-around px-2 py-2 mb-2 bg-vault-950/60 rounded-2xl border border-white/[0.06]">
            {REACTION_EMOJIS.map(e => (
              <button
                key={e}
                type="button"
                onClick={() => onReact(e)}
                className={`w-11 h-11 rounded-full text-2xl flex items-center justify-center transition-transform active:scale-90 hover:scale-110 ${
                  myReaction === e ? 'bg-emerald/25 ring-2 ring-emerald scale-105' : 'hover:bg-vault-800'
                }`}
                aria-label={myReaction === e ? `Remove ${e}` : `React ${e}`}
              >
                {e}
              </button>
            ))}
          </div>
        )}

        {failed ? (
          <button type="button" className={item} onClick={onDiscard}>
            <Trash2 className="w-4 h-4 text-rose-400" aria-hidden /> Remove unsent message
          </button>
        ) : (
          <>
            {!deleted && (
              <button type="button" className={item} onClick={onReply}>
                <Reply className="w-4 h-4 text-emerald" aria-hidden /> Reply
              </button>
            )}
            {!deleted && isText && (
              <button type="button" className={item} onClick={onCopy}>
                <Copy className="w-4 h-4 text-vault-300" aria-hidden /> Copy text
              </button>
            )}
            {canEdit && (
              <button type="button" className={item} onClick={onEdit}>
                <Pencil className="w-4 h-4 text-emerald" aria-hidden /> Edit message
              </button>
            )}
            <button type="button" className={item} onClick={onDetails}>
              <Info className="w-4 h-4 text-vault-300" aria-hidden /> Message details
            </button>
            {canDelete && (
              confirmDelete ? (
                <button type="button" className={`${item} text-rose-400 bg-rose-950/30`} onClick={onDelete}>
                  <Trash2 className="w-4 h-4" aria-hidden /> Tap again to delete for everyone
                </button>
              ) : (
                <button type="button" className={`${item} text-rose-400`} onClick={() => setConfirmDelete(true)}>
                  <Trash2 className="w-4 h-4" aria-hidden /> Delete for everyone
                </button>
              )
            )}
            {canDelete && msg.expires_at && (
              <p className="px-4 pt-1 text-xs text-vault-500">This chat has disappearing messages on. Moderators can still see messages deleted here.</p>
            )}
            {isMe && !deleted && !withinWindow && (
              <p className="px-4 pt-1 text-xs text-vault-500">Edit and delete are available for 15 minutes after sending.</p>
            )}
          </>
        )}
      </div>
    </div>
  );
}

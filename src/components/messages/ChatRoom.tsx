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
  SlidersHorizontal,
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
} from 'lucide-react';
import { CoverGameType, MessageItem, MessageReaction, ReactionEmoji, REACTION_EMOJIS, UserProfile } from '../../types';
import type { RealtimeChannel } from '@supabase/supabase-js';
import {
  deliver,
  enqueue,
  flushOutbox,
  newClientId,
  onOutboxEvent,
  pendingFor,
  startOutboxSync,
  OutboxItem,
} from '../../lib/chatOutbox';
import { useAuth } from '../../context/AuthContext';
import { mockBackend } from '../../lib/mockBackend';
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
  extraPreview,
  parseGame,
  parseScore,
  parseSticker,
  parseVoiceNote,
  themeById,
  WAVEFORM_BARS,
} from '../../lib/chatExtras';
import { ChatGameCard } from './ChatGameCard';
import { ChatExtrasSheet, ChatThemeSheet } from './ChatExtrasSheet';
import { COVER_GAMES, useGame } from '../../context/GameContext';

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
  onOpenMedia,
  initialAttachment,
  onClearInitialAttachment,
}) => {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [messages, setMessages] = useState<MessageItem[]>([]);
  const [inputContent, setInputContent] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [isUploadingMedia, setIsUploadingMedia] = useState(false);
  const [playingAudioId, setPlayingAudioId] = useState<string | null>(null);
  const [showContactModal, setShowContactModal] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [reactions, setReactions] = useState<Record<string, MessageReaction[]>>({});
  const [replyTo, setReplyTo] = useState<MessageItem | null>(null);
  const [editing, setEditing] = useState<MessageItem | null>(null);
  const [actionMsg, setActionMsg] = useState<MessageItem | null>(null);
  const messagesRef = useRef<MessageItem[]>([]);
  messagesRef.current = messages;
  const typingChannelRef = useRef<RealtimeChannel | null>(null);
  const lastTypingSentRef = useRef(0);
  const typingIdleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [disappearAfter, setDisappearAfter] = useState<number | null>(null);
  const [showTimerSheet, setShowTimerSheet] = useState(false);
  const [showExtras, setShowExtras] = useState(false);
  const [showThemeSheet, setShowThemeSheet] = useState(false);
  const [themeId, setThemeId] = useState<ChatThemeId>('default');
  const [audioProgress, setAudioProgress] = useState(0);
  const theme = themeById(themeId);
  const partnerPresence = usePresence([partner.id])[partner.id];
  const presenceLabel = describePresence(partnerPresence);
  const listRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const userId = user?.id;

  // Scrolling is done on the message list itself. (scrollIntoView also scrolled every scrollable
  // ancestor, including the app shell, which is what made the header jump in and out of view.)
  const stickToBottomRef = useRef(true);
  const hasScrolledInitiallyRef = useRef(false);

  const handleListScroll = useCallback(() => {
    const el = listRef.current;
    if (!el) return;
    stickToBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
  }, []);

  // After new messages are committed to the DOM: jump to the end on first load, then follow new
  // messages only while the reader is already at the bottom (so reading history is not disturbed).
  const lastMessage = messages[messages.length - 1];
  useLayoutEffect(() => {
    const el = listRef.current;
    if (!el || messages.length === 0) return;
    const mine = lastMessage?.sender_id === userId;
    if (!hasScrolledInitiallyRef.current) {
      hasScrolledInitiallyRef.current = true;
      el.scrollTop = el.scrollHeight;
      return;
    }
    if (stickToBottomRef.current || mine) {
      el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    }
  }, [messages.length, lastMessage, userId]);

  // Images load after they are laid out; keep the view pinned to the bottom when they do.
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

  // Disappearing-messages setting for this chat.
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

  // Drop messages from the screen as they expire (the server already hides them).
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
    }
  };

  // Your theme for this chat (private to you).
  useEffect(() => {
    if (!isSupabaseConfigured() || !userId) return;
    let cancelled = false;
    void supabase
      .from('conversation_members')
      .select('chat_theme')
      .eq('conversation_id', conversationId)
      .eq('user_id', userId)
      .maybeSingle()
      .then(({ data }) => {
        const t = (data as { chat_theme?: ChatThemeId } | null)?.chat_theme;
        if (!cancelled && t) setThemeId(t);
      });
    return () => { cancelled = true; };
  }, [conversationId, userId]);

  const pickTheme = async (id: ChatThemeId) => {
    setShowThemeSheet(false);
    const before = themeId;
    setThemeId(id);
    if (!isSupabaseConfigured()) return;
    const { error } = await supabase.rpc('set_chat_theme', { p_conversation_id: conversationId, p_theme: id });
    if (error) {
      setThemeId(before);
      showToast('Could not save theme', 'error');
    }
  };

  const startGame = useCallback(async () => {
    setShowExtras(false);
    const { error } = await supabase.rpc('start_chat_game', { p_conversation_id: conversationId });
    if (error) showToast(error.message || 'Could not start a game', 'error');
    else stickToBottomRef.current = true;
  }, [conversationId, showToast]);

  const loadMessages = useCallback(async () => {
    if (!userId) return;
    try {
      if (isSupabaseConfigured()) {
        const { data, error } = await supabase
          .from('messages')
          .select('*')
          .eq('conversation_id', conversationId)
          .order('created_at', { ascending: true });

        if (error) throw error;
        if (data) {
          const stored = data as unknown as MessageItem[];
          // Messages still waiting in the outbox (sent while offline) show as queued.
          const storedClientIds = new Set(stored.map(m => m.client_id).filter(Boolean));
          const waiting = pendingFor(conversationId, userId)
            .filter(item => !storedClientIds.has(item.client_id))
            .map(item => outboxToMessage(item, 'queued'));
          setMessages([...stored, ...waiting]);
          void loadReactions();
          // Read receipts go through an RPC: messages has no UPDATE policy (by design).
          const { error: readError } = await supabase.rpc('mark_conversation_read', {
            p_conversation_id: conversationId,
          });
          if (readError) console.warn('[chat] mark as read failed:', readError.code);
        }
      } else {
        const msgs = mockBackend.getMessages(conversationId);
        setMessages(msgs);
        mockBackend.markMessagesAsRead(conversationId, userId);
      }
    } catch (err) {
      console.error('Error loading messages:', err);
    }
  }, [conversationId, userId, loadReactions]);

  useEffect(() => {
    loadMessages();

    if (!isSupabaseConfigured()) {
      const unsubNew = mockBackend.subscribe(`chat:${conversationId}:new_message`, (newMsg: unknown) => {
        setMessages(prev => [...prev, newMsg as MessageItem]);
        if (userId) mockBackend.markMessagesAsRead(conversationId, userId);
      });

      const unsubRead = mockBackend.subscribe(`chat:${conversationId}:read`, () => {
        loadMessages();
      });

      return () => {
        unsubNew();
        unsubRead();
      };
    } else {
      const channel = supabase
        .channel(uniqueChannelName(`chat:${conversationId}`))
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conversationId}` },
          payload => {
            const newMsg = payload.new as unknown as MessageItem;
            setMessages(prev => {
              if (prev.some(m => m.id === newMsg.id)) return prev;
              // Replace our own optimistic copy instead of showing the message twice.
              if (newMsg.client_id) {
                const i = prev.findIndex(m => m.client_id === newMsg.client_id && m.sender_id === newMsg.sender_id);
                if (i >= 0) {
                  const next = prev.slice();
                  next[i] = newMsg;
                  return next;
                }
              }
              return [...prev, newMsg];
            });
            // The chat is open, so a message from the other person is read on arrival.
            if (newMsg.sender_id !== userId) {
              void supabase.rpc('mark_conversation_read', { p_conversation_id: conversationId });
            }
          }
        )
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conversationId}` },
          payload => {
            // Patch the changed row (e.g. a read receipt) instead of refetching the whole thread.
            const updated = payload.new as unknown as MessageItem;
            setMessages(prev => {
              const index = prev.findIndex(m => m.id === updated.id);
              if (index === -1) return prev;
              const current = prev[index];
              if (
                current.is_read === updated.is_read &&
                current.content === updated.content &&
                current.deleted_at === updated.deleted_at
              ) return prev;
              const next = prev.slice();
              next[index] = { ...current, ...updated };
              return next;
            });
          }
        )
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'conversations', filter: `id=eq.${conversationId}` },
          payload => {
            const row = payload.new as { disappear_after_seconds?: number | null };
            setDisappearAfter(row.disappear_after_seconds ?? null);
          }
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'message_reactions' },
          payload => {
            const row = (payload.eventType === 'DELETE' ? payload.old : payload.new) as {
              message_id?: string;
              user_id?: string;
              emoji?: ReactionEmoji;
            };
            const messageId = row?.message_id;
            const reactor = row?.user_id;
            if (!messageId || !reactor || !messagesRef.current.some(m => m.id === messageId)) return;
            setReactions(prev => {
              const list = (prev[messageId] ?? []).filter(r => r.user_id !== reactor);
              if (payload.eventType !== 'DELETE' && row.emoji) list.push({ user_id: reactor, emoji: row.emoji });
              return { ...prev, [messageId]: list };
            });
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [conversationId, loadMessages, userId]);

  // ---------------------------------------------------------------------------
  // Sending: the message shows at once; the outbox delivers it (and retries offline).
  // ---------------------------------------------------------------------------
  const applyOutboxResult = useCallback((clientId: string, patch: Partial<MessageItem> | MessageItem, replace = false) => {
    setMessages(prev => {
      const i = prev.findIndex(m => m.client_id === clientId && m.sender_id === userId);
      if (i < 0) return prev;
      const next = prev.slice();
      if (replace) {
        const stored = patch as MessageItem;
        // Realtime may already have added the stored copy; keep one.
        if (prev.some((m, j) => j !== i && m.id === stored.id)) {
          next.splice(i, 1);
          return next;
        }
        next[i] = stored;
      } else {
        next[i] = { ...next[i], ...patch };
      }
      return next;
    });
  }, [userId]);

  useEffect(() => {
    if (!isSupabaseConfigured() || !userId) return;
    startOutboxSync(() => userId);
    const off = onOutboxEvent(e => {
      if (e.type === 'sent') applyOutboxResult(e.clientId, e.message, true);
      else if (e.type === 'queued') applyOutboxResult(e.clientId, { status: 'queued' });
      else {
        applyOutboxResult(e.clientId, { status: 'failed' });
        showToast('Message not sent: ' + e.error, 'error');
      }
    });
    void flushOutbox(userId);
    return off;
  }, [userId, applyOutboxResult, showToast]);

  // ---------------------------------------------------------------------------
  // Typing indicator (Realtime broadcast: nothing is written to the database)
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!isSupabaseConfigured() || !userId) return;
    let cancelled = false;
    let hideTimer: ReturnType<typeof setTimeout> | undefined;
    const name = `typing:${conversationId}`;
    (async () => {
      // Both people must join the same channel name, so remove a stale copy first.
      const stale = supabase.getChannels().find(c => c.topic === `realtime:${name}`);
      if (stale) await supabase.removeChannel(stale);
      if (cancelled) return;
      const channel = supabase.channel(name, { config: { broadcast: { self: false } } });
      channel
        .on('broadcast', { event: 'typing' }, ({ payload }) => {
          if (!payload || payload.user_id !== partner.id) return;
          if (hideTimer) clearTimeout(hideTimer);
          setIsTyping(Boolean(payload.typing));
          // If the "stopped" signal is lost, don't show "typing" forever.
          if (payload.typing) hideTimer = setTimeout(() => setIsTyping(false), 6000);
        })
        .subscribe();
      typingChannelRef.current = channel;
    })();
    return () => {
      cancelled = true;
      if (hideTimer) clearTimeout(hideTimer);
      const channel = typingChannelRef.current;
      typingChannelRef.current = null;
      if (channel) void supabase.removeChannel(channel);
      setIsTyping(false);
    };
  }, [conversationId, userId, partner.id]);

  const sendTyping = useCallback((typing: boolean) => {
    const channel = typingChannelRef.current;
    if (!channel || !userId) return;
    const now = Date.now();
    if (typing && now - lastTypingSentRef.current < 2500) return; // at most one "typing" every 2.5 s
    if (!typing && lastTypingSentRef.current === 0) return;
    lastTypingSentRef.current = typing ? now : 0;
    void channel.send({ type: 'broadcast', event: 'typing', payload: { user_id: userId, typing } });
  }, [userId]);

  const handleInputChange = (value: string) => {
    setInputContent(value);
    if (editing) return;
    sendTyping(value.trim().length > 0);
    if (typingIdleTimerRef.current) clearTimeout(typingIdleTimerRef.current);
    typingIdleTimerRef.current = setTimeout(() => sendTyping(false), 4000);
  };

  useEffect(() => () => {
    if (typingIdleTimerRef.current) clearTimeout(typingIdleTimerRef.current);
  }, []);

  const handleSend = async (contentToSend?: string) => {
    const content = (contentToSend || inputContent).trim();
    if (!content || !user) return;

    if (!contentToSend) setInputContent('');
    sendTyping(false);

    if (editing && !contentToSend) {
      await saveEdit(editing, content);
      return;
    }

    const replyId = replyTo?.id ?? null;
    setReplyTo(null);

    if (isSupabaseConfigured()) {
      const item: OutboxItem = {
        client_id: newClientId(),
        conversation_id: conversationId,
        sender_id: user.id,
        content,
        reply_to_id: replyId,
        created_at: new Date().toISOString(),
      };
      enqueue(item);
      setMessages(prev => [...prev, outboxToMessage(item, 'sending')]);
      stickToBottomRef.current = true;
      await deliver(item);
      return;
    }

    try {
      const msg = { ...mockBackend.sendMessage(conversationId, user.id, content), reply_to_id: replyId };
      setMessages(prev => [...prev, msg]);

      // Simulated auto-reply in demo mode
      if (partner.uid === 'SOLAR-8120' || partner.uid === 'VORTEX-3391') {
        setTimeout(() => {
          setIsTyping(true);
          setTimeout(() => {
            setIsTyping(false);
            const responses = [
              'Received, thanks!',
              'Looks good to me.',
              'Got it, will check it out shortly.',
              'Message confirmed.',
            ];
            const autoReply = responses[Math.floor(Math.random() * responses.length)];
            mockBackend.sendMessage(conversationId, partner.id, autoReply);
          }, 1200);
        }, 500);
      }
    } catch (err) {
      console.error('Send message error:', err);
      showToast('Message send failed', 'error');
    }
  };

  const retrySend = useCallback((msg: MessageItem) => {
    if (!msg.client_id || !userId) return;
    const item: OutboxItem = {
      client_id: msg.client_id,
      conversation_id: conversationId,
      sender_id: userId,
      content: msg.content,
      reply_to_id: msg.reply_to_id ?? null,
      created_at: msg.created_at,
    };
    enqueue(item);
    applyOutboxResult(msg.client_id, { status: 'sending' });
    void deliver(item);
  }, [conversationId, userId, applyOutboxResult]);

  const discardFailed = (msg: MessageItem) => {
    setMessages(prev => prev.filter(m => m !== msg));
  };

  // ---------------------------------------------------------------------------
  // Reactions, edit, delete
  // ---------------------------------------------------------------------------
  const toggleReaction = useCallback(async (msg: MessageItem, emoji: ReactionEmoji) => {
    if (!userId || msg.status || msg.deleted_at) return;
    const mine = (reactions[msg.id] ?? []).find(r => r.user_id === userId);
    const next: ReactionEmoji | null = mine?.emoji === emoji ? null : emoji;
    const before = reactions[msg.id] ?? [];
    const updated = before.filter(r => r.user_id !== userId);
    if (next) updated.push({ user_id: userId, emoji: next });
    setReactions(prev => ({ ...prev, [msg.id]: updated }));
    if (!isSupabaseConfigured()) return;
    const { error } = await supabase.rpc('set_reaction', { p_message_id: msg.id, p_emoji: next });
    if (error) {
      setReactions(prev => ({ ...prev, [msg.id]: before }));
      showToast('Could not save reaction', 'error');
    }
  }, [reactions, userId, showToast]);

  const saveEdit = async (msg: MessageItem, text: string) => {
    setEditing(null);
    if (text === msg.content) return;
    const previous = msg.content;
    const edited = new Date().toISOString();
    setMessages(prev => prev.map(m => (m.id === msg.id ? { ...m, content: text, edited_at: edited } : m)));
    if (!isSupabaseConfigured()) return;
    const { error } = await supabase.rpc('edit_message', { p_message_id: msg.id, p_content: text });
    if (error) {
      setMessages(prev => prev.map(m => (m.id === msg.id ? { ...m, content: previous, edited_at: msg.edited_at } : m)));
      showToast(error.message || 'Could not edit message', 'error');
    }
  };

  const deleteForEveryone = async (msg: MessageItem) => {
    const before = msg;
    setMessages(prev => prev.map(m => (m.id === msg.id ? { ...m, content: '[DELETED]', deleted_at: new Date().toISOString() } : m)));
    setReactions(prev => ({ ...prev, [msg.id]: [] }));
    if (!isSupabaseConfigured()) return;
    const { error } = await supabase.rpc('delete_message_for_everyone', { p_message_id: msg.id });
    if (error) {
      setMessages(prev => prev.map(m => (m.id === msg.id ? before : m)));
      showToast(error.message || 'Could not delete message', 'error');
    }
  };

  const startReply = (msg: MessageItem) => {
    setEditing(null);
    setReplyTo(msg);
    inputRef.current?.focus();
  };

  const startEdit = (msg: MessageItem) => {
    setReplyTo(null);
    setEditing(msg);
    setInputContent(msg.content);
    inputRef.current?.focus();
  };

  const cancelComposerMode = () => {
    if (editing) setInputContent('');
    setEditing(null);
    setReplyTo(null);
  };

  const messagesById = useMemo(() => {
    const map: Record<string, MessageItem> = {};
    for (const m of messages) map[m.id] = m;
    return map;
  }, [messages]);

  // Process initial media attachment from camera
  useEffect(() => {
    if (initialAttachment && user) {
      const sendInitialMedia = async () => {
        setIsUploadingMedia(true);
        try {
          let mediaUrl = initialAttachment;
          if (initialAttachment.startsWith('data:')) {
            const res = await fetch(initialAttachment);
            const blob = await res.blob();
            const file = new File([blob], `capture-${Date.now()}.jpg`, { type: 'image/jpeg' });
            mediaUrl = await uploadChatMedia(file, conversationId);
          }
          await handleSend(`[IMAGE]${mediaUrl}`);
          showToast('Photo sent to chat', 'success');
        } catch (err) {
          console.error('Error sending initial photo:', err);
          showToast('Failed to attach photo', 'error');
        } finally {
          setIsUploadingMedia(false);
          if (onClearInitialAttachment) onClearInitialAttachment();
        }
      };
      sendInitialMedia();
    }
  }, [initialAttachment]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    e.target.value = '';
    setIsUploadingMedia(true);
    try {
      const mediaUrl = await uploadChatMedia(file, conversationId);
      await handleSend(`[IMAGE]${mediaUrl}`);
      showToast('Photo sent', 'success');
    } catch (err) {
      console.error('File upload error:', err);
      showToast('Photo upload failed', 'error');
    } finally {
      setIsUploadingMedia(false);
    }
  };

  const [isRecordingAudio, setIsRecordingAudio] = useState(false);
  const [audioSeconds, setAudioSeconds] = useState(0);
  // The recorder's onstop handler is created when recording starts, so it can't read audioSeconds
  // (it would always see 0, which is why voice notes were never sent). The length is captured
  // here when the user presses Send, before the counter resets.
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
            await handleSend(`[VOICE_NOTE:${dur}${levels ? `|w=${levels}` : ''}]${mediaUrl}`);
            showToast('Voice note shared', 'success');
          } catch (err) {
            console.error('Voice note upload error:', err);
            showToast('Voice note upload failed', 'error');
          } finally {
            setIsUploadingMedia(false);
          }
        }
      };

      recorder.start();
      setIsRecordingAudio(true);
    } catch (err) {
      console.error('Voice record error:', err);
      showToast('Microphone access denied', 'error');
    }
  };

  const handleStopVoiceRecord = (send: boolean) => {
    if (mediaRecorderRef.current && isRecordingAudio) {
      if (send) {
        recordedSecondsRef.current = audioSeconds;
        mediaRecorderRef.current.stop();
      } else {
        mediaRecorderRef.current.stream.getTracks().forEach(t => t.stop());
      }
      setIsRecordingAudio(false);
    }
  };

  const playingAudioIdRef = useRef<string | null>(null);
  playingAudioIdRef.current = playingAudioId;

  // Stable identity, so memoised message rows do not re-render when the parent does.
  const toggleAudio = useCallback((msgId: string, audioUrl: string) => {
    if (playingAudioIdRef.current === msgId || !audioUrl) {
      audioElementRef.current?.pause();
      setPlayingAudioId(prev => (prev === msgId ? null : audioUrl ? prev : msgId));
      return;
    }

    audioElementRef.current?.pause();

    const audio = new Audio(audioUrl);
    audioElementRef.current = audio;
    setPlayingAudioId(msgId);
    setAudioProgress(0);

    audio.ontimeupdate = () => {
      if (audio.duration && Number.isFinite(audio.duration)) setAudioProgress(audio.currentTime / audio.duration);
    };
    audio.onended = () => {
      setPlayingAudioId(null);
      setAudioProgress(0);
    };
    audio.onerror = () => setPlayingAudioId(null);
    audio.play().catch(() => setPlayingAudioId(null));
  }, []);

  useEffect(() => () => audioElementRef.current?.pause(), []);

  return (
    <div className="flex flex-col h-full bg-vault-950 border border-vault-800 rounded-2xl overflow-hidden select-none animate-fade-in">
      {/* 1. CHAT WORKSPACE HEADER */}
      <header className="h-16 px-4 sm:px-5 bg-vault-900 border-b border-vault-800 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={onBack}
            className="ib ib-s lg:hidden"
            aria-label="Back to conversations"
          >
            <ArrowLeft className="i" aria-hidden />
          </button>

          <Avatar
            name={partner.display_name}
            seed={partner.uid}
            src={partner.avatar_url}
            size={40}
            online={partnerPresence?.isOnline ?? false}
          />

          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <h2 className="t-h3 font-bold text-white leading-tight truncate m-0">
                {partner.display_name}
              </h2>
            </div>
            <div className="flex items-center gap-1.5 text-[11px] font-mono text-emerald leading-tight mt-0.5">
              <ShieldCheck className="w-3.5 h-3.5" aria-hidden />
              <span>{partner.uid}</span>
              {isTyping ? (
                <span className="text-emerald font-sans">typing…</span>
              ) : presenceLabel ? (
                <span className={`font-sans ${partnerPresence?.isOnline ? 'text-emerald' : 'text-vault-400'}`}>• {presenceLabel}</span>
              ) : (
                <span className="text-vault-500 font-sans hidden sm:inline">• Private Channel</span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setShowThemeSheet(true)}
            className="ib ib-s rounded-xl"
            aria-label="Chat theme"
            title="Chat theme"
          >
            <Palette className="i" aria-hidden />
          </button>
          {isSupabaseConfigured() && (
            <button
              type="button"
              onClick={() => setShowTimerSheet(true)}
              className={`ib ib-s rounded-xl ${disappearAfter ? 'text-emerald' : ''}`}
              aria-label={disappearAfter ? `Disappearing messages: ${timerLabel(disappearAfter)}` : 'Disappearing messages: off'}
              title="Disappearing messages"
            >
              <Timer className="i" aria-hidden />
            </button>
          )}
          <button
            type="button"
            onClick={() => setShowReportModal(true)}
            className="ib ib-s rounded-xl"
            aria-label={`Report ${partner.display_name}`}
            title="Report"
          >
            <Flag className="i" aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => setShowContactModal(true)}
            className="ib ib-s rounded-xl"
            aria-label="Chat & notification settings"
            title="Chat & notification settings"
          >
            <SlidersHorizontal className="i" aria-hidden />
          </button>
        </div>
      </header>

      {/* 2. MESSAGE STREAM (High Readability 15px/22px, 70% Max Width, Grouped) */}
      <div
        ref={listRef}
        onScroll={handleListScroll}
        className={`flex-1 overflow-y-auto overscroll-contain p-4 sm:p-6 ${theme.wallpaper} min-h-0 [-webkit-overflow-scrolling:touch]`}
      >
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
            return (
              <MessageRow
                key={msg.client_id ?? msg.id}
                msg={msg}
                isMe={msg.sender_id === userId}
                isFirstInGroup={!prevMsg || prevMsg.sender_id !== msg.sender_id}
                isLastInGroup={!nextMsg || nextMsg.sender_id !== msg.sender_id}
                isPlaying={playingAudioId === msg.id}
                onToggleAudio={toggleAudio}
                onOpenMedia={onOpenMedia}
                onMediaLoaded={handleMediaLoaded}
                reactions={reactions[msg.id]}
                replyTarget={msg.reply_to_id ? messagesById[msg.reply_to_id] ?? null : undefined}
                replyTargetIsMe={msg.reply_to_id ? messagesById[msg.reply_to_id]?.sender_id === userId : false}
                partnerName={partner.display_name}
                myUserId={userId}
                onOpenActions={setActionMsg}
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
          <div className="flex items-center gap-1.5 bg-vault-900 border border-vault-800 px-3.5 py-2 rounded-full w-20 text-emerald animate-pulse">
            <div className="w-1.5 h-1.5 bg-emerald rounded-full animate-bounce" />
            <div className="w-1.5 h-1.5 bg-emerald rounded-full animate-bounce [animation-delay:0.2s]" />
            <div className="w-1.5 h-1.5 bg-emerald rounded-full animate-bounce [animation-delay:0.4s]" />
          </div>
        )}

      </div>

      {/* 3. ALWAYS VISIBLE COMPOSER BAR */}
      <footer className="bg-vault-900 border-t border-vault-800 p-3 shrink-0">
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileUpload}
          accept="image/*"
          className="hidden"
          aria-label="File upload"
        />

        {(replyTo || editing) && !isRecordingAudio && (
          <div className="flex items-center gap-2 mb-2 pl-3 pr-1 py-1.5 rounded-xl bg-vault-950 border-l-2 border-emerald">
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

        {isRecordingAudio ? (
          <div className="flex items-center justify-between bg-red-950/80 border border-red-600/50 rounded-xl px-4 py-2.5 text-red-300 animate-pulse">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-ping" />
              <span className="text-xs font-mono font-bold">RECORDING {audioSeconds}s</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => handleStopVoiceRecord(false)}
                className="btn btn-g btn-sm text-vault-300"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleStopVoiceRecord(true)}
                className="btn btn-p btn-sm"
              >
                Send
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowExtras(true)}
              className="ib ib-s rounded-xl"
              aria-label="Stickers and games"
              title="Stickers and games"
            >
              <Smile className="w-5 h-5 text-vault-300" />
            </button>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploadingMedia}
              className="ib ib-s rounded-xl"
              aria-label="Attach photo"
              title="Attach photo"
            >
              {isUploadingMedia ? (
                <RotateCcw className="w-5 h-5 text-emerald animate-spin" />
              ) : (
                <ImageIcon className="w-5 h-5 text-vault-300" />
              )}
            </button>

            <button
              type="button"
              onClick={handleStartVoiceRecord}
              className="ib ib-s rounded-xl"
              aria-label="Record voice message"
              title="Record voice note"
            >
              <Mic className="w-5 h-5 text-emerald" />
            </button>

            <form
              onSubmit={e => {
                e.preventDefault();
                handleSend();
              }}
              className="flex-1 flex items-center gap-2"
            >
              <input
                ref={inputRef}
                type="text"
                value={inputContent}
                onChange={e => handleInputChange(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Escape' && (replyTo || editing)) cancelComposerMode();
                }}
                maxLength={4000}
                placeholder={editing ? 'Edit message…' : `Message ${partner.display_name}...`}
                className="inp flex-1 text-sm h-11"
              />
              <button
                type="submit"
                disabled={!inputContent.trim()}
                className="btn btn-p btn-sm !w-11 !h-11 !p-0 rounded-xl"
                aria-label="Send message"
              >
                <Send className="w-4 h-4 fill-current" />
              </button>
            </form>
          </div>
        )}
      </footer>

      {showExtras && (
        <ChatExtrasSheet
          canPlayGames={isSupabaseConfigured()}
          onClose={() => setShowExtras(false)}
          onSticker={id => { setShowExtras(false); void handleSend(`[STICKER:${id}]`); }}
          onStartGame={() => void startGame()}
          onShareScore={(gameId, score) => { setShowExtras(false); void handleSend(`[SCORE:${gameId}:${score}]`); }}
        />
      )}

      {showThemeSheet && (
        <ChatThemeSheet current={themeId} onPick={id => void pickTheme(id)} onClose={() => setShowThemeSheet(false)} />
      )}

      {showTimerSheet && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Disappearing messages"
          className="fixed inset-0 z-50 bg-black/70 flex items-end sm:items-center justify-center anim-fade"
          onClick={() => setShowTimerSheet(false)}
          onKeyDown={e => { if (e.key === 'Escape') setShowTimerSheet(false); }}
        >
          <div className="w-full sm:max-w-sm bg-vault-900 border border-vault-800 rounded-t-2xl sm:rounded-2xl p-2 pb-4 shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="px-4 pt-2 pb-3">
              <h3 className="t-body font-bold text-white m-0 flex items-center gap-2"><Timer className="w-4 h-4 text-emerald" aria-hidden /> Disappearing messages</h3>
              <p className="text-xs text-vault-400 mt-1 mb-0">
                New messages in this chat disappear for both of you after the time you pick. {partner.display_name} will see that you changed it.
                The app's moderators can still review disappeared and deleted messages and photos from this chat for safety reasons.
              </p>
            </div>
            {([null, 86400, 604800] as (number | null)[]).map(opt => (
              <button
                key={String(opt)}
                type="button"
                role="radio"
                aria-checked={disappearAfter === opt}
                onClick={() => void changeDisappearing(opt)}
                className="w-full flex items-center justify-between px-4 min-h-[48px] text-sm text-white hover:bg-vault-800 rounded-xl"
              >
                <span>{opt ? timerLabel(opt) : 'Off'}</span>
                {disappearAfter === opt && <Check className="w-4 h-4 text-emerald" aria-hidden />}
              </button>
            ))}
          </div>
        </div>
      )}

      {actionMsg && (
        <MessageActionSheet
          msg={actionMsg}
          isMe={actionMsg.sender_id === userId}
          myReaction={(reactions[actionMsg.id] ?? []).find(r => r.user_id === userId)?.emoji}
          onClose={() => setActionMsg(null)}
          onReact={emoji => { void toggleReaction(actionMsg, emoji); setActionMsg(null); }}
          onReply={() => { startReply(actionMsg); setActionMsg(null); }}
          onCopy={() => {
            void navigator.clipboard?.writeText(actionMsg.content).then(
              () => showToast('Copied', 'success'),
              () => showToast('Could not copy', 'error'),
            );
            setActionMsg(null);
          }}
          onEdit={() => { startEdit(actionMsg); setActionMsg(null); }}
          onDelete={() => { void deleteForEveryone(actionMsg); setActionMsg(null); }}
          onDiscard={() => { discardFailed(actionMsg); setActionMsg(null); }}
        />
      )}

      {showReportModal && (
        <ReportUserModal
          partner={partner}
          conversationId={conversationId}
          partnerMessages={messages.filter(m => m.sender_id === partner.id && !m.deleted_at && !isSystem(m.content))}
          onClose={() => setShowReportModal(false)}
        />
      )}

      {/* Contact Settings & Notification Modal */}
      {showContactModal && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex justify-end anim-fade"
        >
          <div className="w-full max-w-sm bg-vault-900 h-full border-l border-vault-800 shadow-2xl relative flex flex-col">
            <div className="p-3 border-b border-vault-800 flex items-center justify-between bg-vault-950">
              <span className="t-body font-bold text-white">Contact & Notification Settings</span>
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
    </div>
  );
};

const EDIT_WINDOW_MS = 15 * 60 * 1000;

/** An outbox entry shown in the thread before the server has it. */
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

const isSystem = (content: string) => content.startsWith('[SYSTEM:');

function timerLabel(seconds: number): string {
  return seconds >= 604800 ? '7 days' : '24 hours';
}

/** "[SYSTEM:disappearing:86400]" → "turned on disappearing messages (24 hours)". */
function systemText(content: string): string {
  const m = content.match(/^\[SYSTEM:disappearing:(\w+)\]$/);
  if (m) {
    return m[1] === 'off'
      ? 'turned off disappearing messages'
      : `turned on disappearing messages (${timerLabel(Number(m[1]))})`;
  }
  return 'updated the chat';
}

/** One-line description of a message, for reply quotes and banners. */
function previewText(content: string): string {
  if (content === '[DELETED]') return 'Deleted message';
  if (isSystem(content)) return 'Chat setting changed';
  const extra = extraPreview(content);
  if (extra) return extra;
  if (content.startsWith('[IMAGE]')) return '📷 Photo';
  if (content.startsWith('[VOICE_NOTE')) return '🎤 Voice message';
  return content;
}

interface MessageRowProps {
  msg: MessageItem;
  isMe: boolean;
  isFirstInGroup: boolean;
  isLastInGroup: boolean;
  isPlaying: boolean;
  onToggleAudio: (msgId: string, audioUrl: string) => void;
  onOpenMedia?: (url: string) => void;
  onMediaLoaded: () => void;
  reactions?: MessageReaction[];
  /** undefined: not a reply. null: a reply whose original isn't loaded or was removed. */
  replyTarget?: MessageItem | null;
  replyTargetIsMe: boolean;
  partnerName: string;
  myUserId?: string;
  onOpenActions: (msg: MessageItem) => void;
  onToggleReaction: (msg: MessageItem, emoji: ReactionEmoji) => void;
  onRetry: (msg: MessageItem) => void;
  /** Colour classes for your own bubbles (chat theme). */
  mineClass: string;
  /** 0..1 while this voice note plays. */
  playProgress: number;
  onRematch: () => void;
}

/**
 * One message. Memoised: typing in the composer or a change to another message does not
 * re-render every bubble. Image bubbles reserve their box before the image arrives, so the
 * thread does not jump when photos finish loading.
 *
 * Long-press (touch) or right-click opens the actions: react, reply, copy, edit, delete.
 */
const MessageRow = memo(function MessageRow({
  msg,
  isMe,
  isFirstInGroup,
  isLastInGroup,
  isPlaying,
  onToggleAudio,
  onOpenMedia,
  onMediaLoaded,
  reactions,
  replyTarget,
  replyTargetIsMe,
  partnerName,
  myUserId,
  onOpenActions,
  onToggleReaction,
  onRetry,
  mineClass,
  playProgress,
  onRematch,
}: MessageRowProps) {
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
  return <MessageBubble {...{ msg, isMe, isFirstInGroup, isLastInGroup, isPlaying, onToggleAudio, onOpenMedia, onMediaLoaded, reactions, replyTarget, replyTargetIsMe, partnerName, myUserId, onOpenActions, onToggleReaction, onRetry, mineClass, playProgress, onRematch }} />;
});

function MessageBubble({
  msg,
  isMe,
  isFirstInGroup,
  isLastInGroup,
  isPlaying,
  onToggleAudio,
  onOpenMedia,
  onMediaLoaded,
  reactions,
  replyTarget,
  replyTargetIsMe,
  partnerName,
  myUserId,
  onOpenActions,
  onToggleReaction,
  onRetry,
  mineClass,
  playProgress,
  onRematch,
}: MessageRowProps) {
  const [imageFailed, setImageFailed] = useState(false);
  const { getHighScore } = useGame();
  const deleted = isDeleted(msg);
  const isImage = !deleted && msg.content.startsWith('[IMAGE]');
  const voice = deleted ? undefined : parseVoiceNote(msg.content);
  const isVoice = Boolean(voice);
  const imageUrl = isImage ? msg.content.slice('[IMAGE]'.length) : '';
  const voiceDuration = voice?.duration ?? '0:00';
  const voiceUrl = voice?.url ?? '';
  const sticker = deleted ? undefined : parseSticker(msg.content);
  const score = deleted ? undefined : parseScore(msg.content);
  const gameRef = deleted ? undefined : parseGame(msg.content);
  // Stickers, games and score cards sit on the wallpaper, not in a bubble.
  const bare = Boolean(sticker || score || gameRef);

  // Long-press detection. Moving the finger (scrolling) cancels it; a completed long-press
  // swallows the following click so it doesn't also open the photo.
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pressStart = useRef<{ x: number; y: number } | null>(null);
  const longPressed = useRef(false);
  const cancelPress = () => {
    if (pressTimer.current) clearTimeout(pressTimer.current);
    pressTimer.current = null;
    pressStart.current = null;
  };
  const canAct = !msg.status || msg.status === 'failed';
  const pressHandlers = canAct
    ? {
        onPointerDown: (e: React.PointerEvent) => {
          if (e.pointerType === 'mouse') return;
          longPressed.current = false;
          pressStart.current = { x: e.clientX, y: e.clientY };
          pressTimer.current = setTimeout(() => {
            longPressed.current = true;
            navigator.vibrate?.(15);
            onOpenActions(msg);
          }, 450);
        },
        onPointerMove: (e: React.PointerEvent) => {
          const start = pressStart.current;
          if (start && Math.hypot(e.clientX - start.x, e.clientY - start.y) > 8) cancelPress();
        },
        onPointerUp: cancelPress,
        onPointerCancel: cancelPress,
        onContextMenu: (e: React.MouseEvent) => {
          e.preventDefault();
          cancelPress();
          onOpenActions(msg);
        },
        onClickCapture: (e: React.MouseEvent) => {
          if (longPressed.current) {
            e.stopPropagation();
            e.preventDefault();
            longPressed.current = false;
          }
        },
      }
    : {};

  // Group identical emojis: "❤️ 2".
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

  const image = (
    <span className="relative block w-56 max-w-full aspect-[4/5] rounded-lg overflow-hidden bg-black/20">
      {imageFailed ? (
        <span className="absolute inset-0 flex items-center justify-center text-center text-xs p-3 opacity-80">
          Photo unavailable
        </span>
      ) : (
        <img
          src={imageUrl}
          alt="Shared photo"
          loading="lazy"
          decoding="async"
          onLoad={onMediaLoaded}
          onError={() => setImageFailed(true)}
          className="absolute inset-0 w-full h-full object-cover"
        />
      )}
    </span>
  );

  return (
    <div className={`group flex flex-col ${isMe ? 'items-end' : 'items-start'} ${isFirstInGroup ? 'mt-3' : 'mt-0.5'} ${reactionGroups.length ? 'mb-2' : ''}`}>
      <div className={`relative flex items-center gap-1 max-w-[80%] ${isMe ? 'flex-row-reverse' : ''}`}>
        <div
          {...pressHandlers}
          className={`relative min-w-0 ${bare ? 'p-0' : isImage ? 'p-1.5' : 'p-3'} text-[15px] leading-[22px] break-words ${bare ? '' : 'shadow-sm'} select-text ${
            msg.status ? 'opacity-70' : ''
          } ${
            bare
              ? 'bg-transparent'
              : deleted
              ? 'bg-transparent border border-vault-750 text-vault-400 italic rounded-2xl'
              : isMe
              ? `${mineClass} font-medium ${isLastInGroup ? 'rounded-2xl rounded-br-xs' : 'rounded-2xl'}`
              : `bg-[#1B1D21] border border-[#1E2025] text-[#F4F5F6] ${isLastInGroup ? 'rounded-2xl rounded-bl-xs' : 'rounded-2xl'}`
          }`}
        >
          {replyTarget !== undefined && !deleted && (
            <div
              className={`mb-1.5 px-2 py-1 rounded-lg border-l-2 text-xs ${
                isMe ? 'bg-black/10 border-[#04120C]/60' : 'bg-black/20 border-emerald'
              }`}
            >
              <div className="font-bold opacity-90">{replyTarget ? (replyTargetIsMe ? 'You' : partnerName) : 'Original message'}</div>
              <div className="truncate opacity-80">{replyTarget ? previewText(replyTarget.content) : 'Not available'}</div>
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
            <div className="w-[216px] rounded-2xl bg-vault-900 border border-amber-500/40 p-3 text-white">
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
            <ChatGameCard gameId={gameRef.id} myUserId={myUserId} partnerName={partnerName} onRematch={onRematch} />
          ) : isImage ? (
            onOpenMedia && !imageFailed ? (
              <button type="button" onClick={() => onOpenMedia(imageUrl)} className="block p-0 border-0 bg-transparent cursor-pointer" aria-label="Open photo">
                {image}
              </button>
            ) : (
              image
            )
          ) : isVoice ? (
            <div className="flex items-center gap-3 min-w-[200px] py-1">
              <button
                type="button"
                onClick={() => onToggleAudio(msg.id, voiceUrl)}
                className={`w-11 h-11 shrink-0 rounded-full flex items-center justify-center ${
                  isMe ? 'bg-black/80 text-white' : 'bg-[#10B981] text-[#04120C]'
                } active:scale-90 transition-transform`}
                aria-label={isPlaying ? 'Pause voice message' : 'Play voice message'}
              >
                {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
              </button>
              <div className="flex-1 space-y-1">
                <div className="flex items-center gap-[2px] h-7" aria-hidden>
                  {(voice?.levels ?? Array.from({ length: WAVEFORM_BARS }, (_, i) => 0.25 + 0.2 * Math.abs(Math.sin(i * 1.7)))).map((level, i, all) => {
                    const played = isPlaying && i / all.length < playProgress;
                    return (
                      <span
                        key={i}
                        className={`flex-1 rounded-full ${isMe ? 'bg-current' : 'bg-[#10B981]'} ${played ? 'opacity-100' : 'opacity-35'}`}
                        style={{ height: `${Math.max(12, Math.round(level * 100))}%` }}
                      />
                    );
                  })}
                </div>
                <span className={`text-[11px] font-mono ${isMe ? 'opacity-75' : 'text-vault-400'}`}>
                  Voice message ({voiceDuration})
                </span>
              </div>
            </div>
          ) : (
            <span className="whitespace-pre-wrap">{msg.content}</span>
          )}

          {reactionGroups.length > 0 && (
            <div className={`absolute -bottom-3.5 ${isMe ? 'right-2' : 'left-2'} flex gap-1`}>
              {reactionGroups.map(g => (
                <button
                  key={g.emoji}
                  type="button"
                  onClick={() => onToggleReaction(msg, g.emoji)}
                  className={`h-6 px-1.5 rounded-full text-xs flex items-center gap-0.5 border shadow ${
                    g.mine ? 'bg-emerald/20 border-emerald' : 'bg-vault-900 border-vault-750'
                  }`}
                  aria-label={`${g.emoji} ${g.count}${g.mine ? ', including you. Tap to remove' : ''}`}
                >
                  <span>{g.emoji}</span>
                  {g.count > 1 && <span className="text-vault-200">{g.count}</span>}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Desktop: a visible button for the same actions (long-press isn't available with a mouse). */}
        {canAct && !deleted && (
          <button
            type="button"
            onClick={() => onOpenActions(msg)}
            className="hidden md:flex opacity-0 group-hover:opacity-100 focus:opacity-100 w-8 h-8 rounded-full items-center justify-center text-vault-400 hover:text-white hover:bg-vault-800 shrink-0"
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
      ) : (isLastInGroup || msg.status) && (
        <div className={`flex items-center gap-1.5 text-[11px] text-vault-500 font-mono mt-1 px-1 ${isMe ? 'justify-end' : 'justify-start'}`}>
          {msg.edited_at && !deleted && <span className="font-sans italic">edited</span>}
          <span>{formatTimestamp(msg.created_at)}</span>
          {isMe &&
            (msg.status ? (
              <span className="flex items-center gap-1" aria-label={msg.status === 'queued' ? 'Waiting for connection' : 'Sending'}>
                <Clock className="w-3.5 h-3.5" aria-hidden />
                {msg.status === 'queued' && <span className="font-sans">Waiting for connection</span>}
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
}

/** Bottom sheet with reactions and message actions. */
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
}: MessageActionSheetProps) {
  const failed = msg.status === 'failed';
  const deleted = isDeleted(msg);
  const withinWindow = Date.now() - new Date(msg.created_at).getTime() < EDIT_WINDOW_MS;
  const isText = !msg.content.startsWith('[');
  const canEdit = isMe && !failed && !deleted && isText && withinWindow;
  const canDelete = isMe && !failed && !deleted && withinWindow;
  const [confirmDelete, setConfirmDelete] = useState(false);

  const item = 'w-full flex items-center gap-3 px-4 min-h-[48px] text-sm text-white hover:bg-vault-800 rounded-xl';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Message actions"
      className="fixed inset-0 z-50 bg-black/70 flex items-end sm:items-center justify-center anim-fade"
      onClick={onClose}
      onKeyDown={e => { if (e.key === 'Escape') onClose(); }}
    >
      <div
        className="w-full sm:max-w-sm bg-vault-900 border border-vault-800 rounded-t-2xl sm:rounded-2xl p-2 pb-4 shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <p className="px-4 pt-2 pb-3 text-xs text-vault-400 truncate">{previewText(msg.content)}</p>

        {!failed && !deleted && (
          <div className="flex justify-around px-2 pb-2 mb-1 border-b border-vault-800">
            {REACTION_EMOJIS.map(e => (
              <button
                key={e}
                type="button"
                onClick={() => onReact(e)}
                className={`w-11 h-11 rounded-full text-2xl flex items-center justify-center transition-transform active:scale-90 ${
                  myReaction === e ? 'bg-emerald/25 ring-1 ring-emerald' : 'hover:bg-vault-800'
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
                <Reply className="w-4 h-4" aria-hidden /> Reply
              </button>
            )}
            {!deleted && isText && (
              <button type="button" className={item} onClick={onCopy}>
                <Copy className="w-4 h-4" aria-hidden /> Copy text
              </button>
            )}
            {canEdit && (
              <button type="button" className={item} onClick={onEdit}>
                <Pencil className="w-4 h-4" aria-hidden /> Edit
              </button>
            )}
            {canDelete && (
              confirmDelete ? (
                <button type="button" className={`${item} text-rose-400`} onClick={onDelete}>
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

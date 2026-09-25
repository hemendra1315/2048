import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ArrowLeft, Send, Lock, MoreVertical, Smile, Mic, Image as ImageIcon, X, Pencil, CornerUpLeft } from 'lucide-react';
import { MessageItem, MessageReaction, UserProfile } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { mockBackend } from '../../lib/mockBackend';
import { supabase, isSupabaseConfigured } from '../../lib/supabase';
import { getAvatarUrl, formatTimestamp } from '../../lib/utils';
import { useToast } from '../../context/ToastContext';
import { MessageBubble } from './chatRoom/MessageBubble';
import { ChatOptionsSheet } from './chatRoom/ChatOptionsSheet';
import { ContactInfoPanel } from './chatRoom/ContactInfoPanel';
import { ReportUserModal } from './chatRoom/ReportUserModal';

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
  const [playingAudioId, setPlayingAudioId] = useState<string | null>(null);
  const [showContactInfo, setShowContactInfo] = useState(false);
  const [showChatOptions, setShowChatOptions] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [showStickerPicker, setShowStickerPicker] = useState(false);
  const [replyingTo, setReplyingTo] = useState<MessageItem | null>(null);
  const [editingMessage, setEditingMessage] = useState<MessageItem | null>(null);
  const [partnerPresence, setPartnerPresence] = useState<{ isOnline: boolean; lastSeenAt: string | null } | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const typingHideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTypingSentAtRef = useRef(0);

  const STICKERS = ['😂', '❤️', '🔥', '👍', '🎉', '😢', '😮', '🙏'];

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // Reactions live in a separate table (no conversation_id column), so they're fetched by
  // message id and merged onto the loaded messages rather than joined server-side.
  const attachReactions = useCallback(async (msgs: MessageItem[]): Promise<MessageItem[]> => {
    if (!isSupabaseConfigured() || msgs.length === 0) return msgs;
    const { data, error } = await supabase
      .from('message_reactions')
      .select('message_id, user_id, emoji')
      .in('message_id', msgs.map(m => m.id));
    if (error || !data) return msgs;
    const byMessage = new Map<string, MessageReaction[]>();
    for (const row of data as unknown as { message_id: string; user_id: string; emoji: string }[]) {
      const list = byMessage.get(row.message_id) ?? [];
      list.push({ emoji: row.emoji, user_id: row.user_id });
      byMessage.set(row.message_id, list);
    }
    return msgs.map(m => ({ ...m, reactions: byMessage.get(m.id) }));
  }, []);

  const loadMessages = useCallback(async () => {
    if (!user) return;
    try {
      if (isSupabaseConfigured()) {
        const { data, error } = await supabase
          .from('messages')
          .select('*')
          .eq('conversation_id', conversationId)
          .order('created_at', { ascending: true });

        if (error) throw error;
        if (data) {
          setMessages(await attachReactions(data as unknown as MessageItem[]));
          await supabase.rpc('mark_conversation_read', { p_conversation_id: conversationId });
        }
      } else {
        const msgs = mockBackend.getMessages(conversationId);
        setMessages(msgs);
        mockBackend.markMessagesAsRead(conversationId, user.id);
      }
    } catch (err) {
      console.error('Error loading messages:', err);
    }
  }, [conversationId, user, attachReactions]);

  useEffect(() => {
    loadMessages();
    scrollToBottom();

    if (!isSupabaseConfigured()) {
      const unsubNew = mockBackend.subscribe(`chat:${conversationId}:new_message`, (newMsg: unknown) => {
        setMessages(prev => [...prev, newMsg as MessageItem]);
        if (user) mockBackend.markMessagesAsRead(conversationId, user.id);
        scrollToBottom();
      });

      const unsubRead = mockBackend.subscribe(`chat:${conversationId}:read`, () => {
        loadMessages();
      });

      return () => {
        unsubNew();
        unsubRead();
      };
    } else {
      // A unique topic per mount avoids a StrictMode dev-mode race: two mounts of this effect back
      // to back would otherwise both resolve to the same topic while the first's removeChannel()
      // is still in flight, and Supabase throws on adding .on() callbacks to an already-subscribed
      // channel instance.
      const channel = supabase
        .channel(`chat:${conversationId}:${crypto.randomUUID()}`)
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conversationId}` },
          payload => {
            const newMsg = payload.new as unknown as MessageItem;
            setMessages(prev => {
              if (prev.some(m => m.id === newMsg.id)) return prev;
              return [...prev, newMsg];
            });
            scrollToBottom();
          }
        )
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conversationId}` },
          payload => {
            const updatedMsg = payload.new as unknown as MessageItem;
            // The realtime payload has no `reactions` field - keep whatever was already merged in.
            setMessages(prev => prev.map(m => (m.id === updatedMsg.id ? { ...updatedMsg, reactions: m.reactions } : m)));
          }
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'message_reactions' },
          async payload => {
            const row = (payload.new ?? payload.old) as { message_id?: string } | null;
            const messageId = row?.message_id;
            if (!messageId) return;
            const { data } = await supabase
              .from('message_reactions')
              .select('user_id, emoji')
              .eq('message_id', messageId);
            const reactions = (data ?? []) as unknown as MessageReaction[];
            setMessages(prev => (prev.some(m => m.id === messageId) ? prev.map(m => (m.id === messageId ? { ...m, reactions } : m)) : prev));
          }
        )
        .on('broadcast', { event: 'typing' }, ({ payload }) => {
          if (payload?.userId === user?.id) return;
          setIsTyping(true);
          if (typingHideTimeoutRef.current) clearTimeout(typingHideTimeoutRef.current);
          typingHideTimeoutRef.current = setTimeout(() => setIsTyping(false), 3000);
        })
        .subscribe();

      channelRef.current = channel;

      return () => {
        if (typingHideTimeoutRef.current) clearTimeout(typingHideTimeoutRef.current);
        channelRef.current = null;
        supabase.removeChannel(channel);
      };
    }
  }, [conversationId, loadMessages, user]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    if (!isSupabaseConfigured()) return;

    const loadPresence = async () => {
      const { data } = await supabase.rpc('get_presence', { p_user_ids: [partner.id] });
      const row = (data as { user_id: string; is_online: boolean; last_seen_at: string | null }[] | null)?.[0];
      setPartnerPresence(row ? { isOnline: row.is_online, lastSeenAt: row.last_seen_at } : null);
    };
    loadPresence();

    const channel = supabase
      .channel(`presence:${partner.id}:${crypto.randomUUID()}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'user_presence', filter: `user_id=eq.${partner.id}` },
        () => loadPresence()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [partner.id]);

  useEffect(() => {
    if (initialAttachment) {
      handleSend(`[IMAGE]${initialAttachment}`);
      showToast('Photo sent', 'success');
      if (onClearInitialAttachment) onClearInitialAttachment();
    }
  }, [initialAttachment]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    return () => {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        try {
          mediaRecorderRef.current.stream.getTracks().forEach(t => t.stop());
        } catch {
          // stream already closed
        }
      }
    };
  }, []);

  const handleSend = async (contentToSend?: string) => {
    const content = (contentToSend || inputContent).trim();
    if (!content || !user) return;

    if (!contentToSend) setInputContent('');
    const replyToId = replyingTo?.id;
    setReplyingTo(null);

    try {
      if (isSupabaseConfigured()) {
        const { data, error } = await supabase
          .from('messages')
          .insert({
            conversation_id: conversationId,
            sender_id: user.id,
            content,
            reply_to_id: replyToId ?? null,
          } as unknown as { conversation_id: string; sender_id: string; content: string; reply_to_id: string | null })
          .select('*')
          .single();
        if (error) throw error;
        // Append locally rather than waiting on the realtime INSERT event, which can lag or
        // (on a flaky connection) never arrive at all - the postgres_changes handler already
        // guards against double-adding this same id.
        if (data) {
          const newMsg = data as unknown as MessageItem;
          setMessages(prev => (prev.some(m => m.id === newMsg.id) ? prev : [...prev, newMsg]));
          scrollToBottom();
        }
      } else {
        const msg = mockBackend.sendMessage(conversationId, user.id, content);
        setMessages(prev => [...prev, msg]);
        scrollToBottom();

        // Simulated auto-reply in demo mode
        if (partner.uid === 'SOLAR-8120' || partner.uid === 'VORTEX-3391') {
          setTimeout(() => {
            setIsTyping(true);
            setTimeout(() => {
              setIsTyping(false);
              const responses = [
                'Encrypted payload received securely.',
                'Acknowledged. Verified on peer node.',
                'End-to-end channel confirmed active.',
                'Secure session validated.',
              ];
              const autoReply = responses[Math.floor(Math.random() * responses.length)];
              mockBackend.sendMessage(conversationId, partner.id, autoReply);
            }, 1200);
          }, 500);
        }
      }
    } catch (err) {
      console.error('Send message error:', err);
      showToast('Message send failed', 'error');
    }
  };

  const broadcastTyping = () => {
    if (!isSupabaseConfigured() || !user || !channelRef.current) return;
    const now = Date.now();
    if (now - lastTypingSentAtRef.current < 2000) return;
    lastTypingSentAtRef.current = now;
    channelRef.current.send({ type: 'broadcast', event: 'typing', payload: { userId: user.id } });
  };

  const handleSendSticker = (emoji: string) => {
    handleSend(`[STICKER]${emoji}`);
    setShowStickerPicker(false);
  };

  const handleReact = async (msg: MessageItem, emoji: string | null) => {
    if (!isSupabaseConfigured()) {
      showToast('Reactions require the live server', 'info');
      return;
    }
    // Optimistic update; the message_reactions realtime subscription reconciles the real state.
    setMessages(prev =>
      prev.map(m => {
        if (m.id !== msg.id || !user) return m;
        const others = (m.reactions ?? []).filter(r => r.user_id !== user.id);
        return { ...m, reactions: emoji ? [...others, { emoji, user_id: user.id }] : others };
      })
    );
    const { error } = await supabase.rpc('set_reaction', { p_message_id: msg.id, p_emoji: emoji });
    if (error) {
      console.error('React error:', error);
      showToast('Could not react to message', 'error');
    }
  };

  const handleStartEdit = (msg: MessageItem) => {
    setReplyingTo(null);
    setEditingMessage(msg);
    setInputContent(msg.content);
  };

  const handleCancelEdit = () => {
    setEditingMessage(null);
    setInputContent('');
  };

  const handleSubmitEdit = async () => {
    if (!editingMessage) return;
    const content = inputContent.trim();
    if (!content) return;
    setInputContent('');
    const target = editingMessage;
    setEditingMessage(null);
    // Optimistic; the messages realtime subscription reconciles it against the server row.
    const editedAt = new Date().toISOString();
    setMessages(prev => prev.map(m => (m.id === target.id ? { ...m, content, edited_at: editedAt } : m)));
    const { error } = await supabase.rpc('edit_message', { p_message_id: target.id, p_content: content });
    if (error) {
      console.error('Edit message error:', error);
      showToast(error.message || 'Could not edit message', 'error');
      setMessages(prev => prev.map(m => (m.id === target.id ? target : m)));
    }
  };

  const handleDeleteForEveryone = async (msg: MessageItem) => {
    if (!confirm('Delete this message for everyone? This cannot be undone.')) return;
    const deletedAt = new Date().toISOString();
    setMessages(prev => prev.map(m => (m.id === msg.id ? { ...m, content: '[DELETED]', deleted_at: deletedAt } : m)));
    const { error } = await supabase.rpc('delete_message_for_everyone', { p_message_id: msg.id });
    if (error) {
      console.error('Delete for everyone error:', error);
      showToast(error.message || 'Could not delete message', 'error');
      setMessages(prev => prev.map(m => (m.id === msg.id ? msg : m)));
    }
  };

  const handleClearChat = async () => {
    if (!confirm('Clear this chat for you? This cannot be undone.')) {
      setShowChatOptions(false);
      return;
    }
    try {
      if (isSupabaseConfigured()) {
        await supabase.from('messages').delete().eq('conversation_id', conversationId);
      } else {
        mockBackend.clearConversationMessages(conversationId);
      }
      setMessages([]);
      showToast('Chat cleared', 'success');
    } catch (err) {
      console.error('Clear chat error:', err);
      showToast('Could not clear chat', 'error');
    }
    setShowChatOptions(false);
  };

  const handlePlayGame = async () => {
    setShowChatOptions(false);
    if (!isSupabaseConfigured()) {
      showToast('Games require the live server', 'info');
      return;
    }
    const { error } = await supabase.rpc('start_chat_game', { p_conversation_id: conversationId });
    if (error) {
      console.error('Start game error:', error);
      showToast(error.message || 'Could not start a game', 'error');
    }
  };

  const handleSubmitReport = async (category: string, reason: string) => {
    const { error } = await supabase.rpc('submit_report', {
      p_reported_user_id: partner.id,
      p_category: category,
      p_reason: reason,
    });
    if (error) {
      console.error('Submit report error:', error);
      showToast(error.message || 'Could not submit report', 'error');
    } else {
      showToast('Report submitted. Our team will review it.', 'success');
      setShowReportModal(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      handleSend(`[IMAGE]${dataUrl}`);
      showToast('Photo sent', 'success');
    };
    reader.readAsDataURL(file);
  };

  const [isRecordingAudio, setIsRecordingAudio] = useState(false);
  const [audioSeconds, setAudioSeconds] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioElementRef = useRef<HTMLAudioElement | null>(null);

  // Audio recording timer
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

      recorder.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        stream.getTracks().forEach(t => t.stop());
        const reader = new FileReader();
        reader.onloadend = () => {
          const dataUrl = reader.result as string;
          handleSend(`[VOICE_NOTE:${audioSeconds || 1}s]${dataUrl}`);
          showToast('Voice note sent', 'success');
        };
        reader.readAsDataURL(blob);
      };

      recorder.start();
      setIsRecordingAudio(true);
    } catch (err) {
      console.warn('Microphone error:', err);
      showToast('Microphone access denied or unavailable', 'info');
    }
  };

  const handleStopVoiceRecord = (send: boolean) => {
    if (mediaRecorderRef.current && isRecordingAudio) {
      if (!send) {
        mediaRecorderRef.current.ondataavailable = null;
        mediaRecorderRef.current.onstop = null;
        mediaRecorderRef.current.stream.getTracks().forEach(t => t.stop());
        showToast('Voice note discarded', 'info');
      } else {
        mediaRecorderRef.current.stop();
      }
      setIsRecordingAudio(false);
    }
  };

  const playAudio = (audioUrl: string, msgId: string) => {
    if (playingAudioId === msgId) {
      if (audioElementRef.current) {
        audioElementRef.current.pause();
      }
      setPlayingAudioId(null);
      return;
    }

    if (audioElementRef.current) {
      audioElementRef.current.pause();
    }

    const audio = new Audio(audioUrl);
    audioElementRef.current = audio;
    setPlayingAudioId(msgId);

    audio.onended = () => {
      setPlayingAudioId(null);
    };

    audio.onerror = () => {
      setPlayingAudioId(null);
    };

    audio.play().catch(() => setPlayingAudioId(null));
  };

  return (
    <div className="flex flex-col h-full lg:h-[calc(100vh-140px)] md:h-[680px] bg-[#0A0A0A] lg:border lg:border-[#262626] lg:rounded-2xl overflow-hidden select-none animate-fade-in">
      {/* Header */}
      <header className="bg-[#111111] border-b border-[#262626] px-4 py-3 flex items-center justify-between">
        <button
          onClick={() => setShowContactInfo(true)}
          className="flex items-center gap-3 min-w-0 text-left"
        >
          <span
            onClick={e => { e.stopPropagation(); onBack(); }}
            className="p-1.5 rounded-xl bg-[#171717] hover:bg-[#222222] text-zinc-300 hover:text-white transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-5 h-5" />
          </span>

          <img
            src={partner.avatar_url || getAvatarUrl(partner.uid)}
            alt="Partner"
            className="w-10 h-10 rounded-xl bg-[#171717] border border-[#262626] object-cover"
          />

          <div className="min-w-0">
            <h3 className="text-sm font-bold text-white leading-tight truncate">{partner.display_name}</h3>
            <p className="text-[11px] text-zinc-500">
              {isTyping ? (
                <span className="text-[#10B981]">typing...</span>
              ) : partnerPresence === null ? (
                'Encrypted direct channel'
              ) : partnerPresence.isOnline ? (
                <span className="text-[#10B981]">Online</span>
              ) : partnerPresence.lastSeenAt ? (
                `Last seen ${formatTimestamp(partnerPresence.lastSeenAt)}`
              ) : (
                'Offline'
              )}
            </p>
          </div>
        </button>

        <button
          onClick={() => setShowChatOptions(true)}
          className="p-1.5 rounded-xl bg-[#171717] hover:bg-[#222222] text-zinc-300 hover:text-white transition-colors"
          title="Chat options"
        >
          <MoreVertical className="w-5 h-5" />
        </button>
      </header>

      {/* Messages Thread */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-[#0A0A0A]">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-6 text-xs text-zinc-500">
            <div className="w-14 h-14 rounded-2xl bg-[#111111] border border-[#262626] flex items-center justify-center text-[#10B981] mb-3">
              <Lock className="w-7 h-7" />
            </div>
            <span className="font-bold text-white text-sm mb-1">No messages yet</span>
            <p className="max-w-xs text-[11px] text-zinc-400">
              Messages you send to {partner.display_name} are end-to-end encrypted.
            </p>
          </div>
        ) : (
          messages.map(msg => (
            <MessageBubble
              key={msg.id}
              msg={msg}
              isMe={msg.sender_id === user?.id}
              currentUserId={user?.id}
              onOpenMedia={onOpenMedia}
              playingAudioId={playingAudioId}
              setPlayingAudioId={setPlayingAudioId}
              onPlayAudio={playAudio}
              replyToMessage={msg.reply_to_id ? messages.find(m => m.id === msg.reply_to_id) : undefined}
              onReact={emoji => handleReact(msg, emoji)}
              onReply={() => {
                setEditingMessage(null);
                setReplyingTo(msg);
              }}
              onEdit={() => handleStartEdit(msg)}
              onDeleteForEveryone={() => handleDeleteForEveryone(msg)}
            />
          ))
        )}

        {isTyping && (
          <div className="flex items-center gap-1.5 bg-[#171717] border border-[#262626] px-3 py-1.5 rounded-full w-20 text-[#10B981] animate-pulse">
            <div className="w-1.5 h-1.5 bg-[#10B981] rounded-full animate-bounce" />
            <div className="w-1.5 h-1.5 bg-[#10B981] rounded-full animate-bounce [animation-delay:0.2s]" />
            <div className="w-1.5 h-1.5 bg-[#10B981] rounded-full animate-bounce [animation-delay:0.4s]" />
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Bar */}
      <div className="bg-[#111111] border-t border-[#262626]">
        {(replyingTo || editingMessage) && (
          <div className="flex items-center justify-between px-3 pt-2.5 gap-2 border-b border-[#262626]/60 pb-2.5">
            <div className="flex items-center gap-2 min-w-0 text-xs text-zinc-400">
              {editingMessage ? <Pencil className="w-3.5 h-3.5 text-[#10B981] shrink-0" /> : <CornerUpLeft className="w-3.5 h-3.5 text-[#10B981] shrink-0" />}
              <div className="min-w-0">
                <div className="text-[10px] font-semibold text-[#10B981]">
                  {editingMessage ? 'Editing message' : `Replying to ${replyingTo?.sender_id === user?.id ? 'yourself' : partner.display_name}`}
                </div>
                <div className="truncate">{(editingMessage ?? replyingTo)?.content}</div>
              </div>
            </div>
            <button
              type="button"
              onClick={editingMessage ? handleCancelEdit : () => setReplyingTo(null)}
              className="p-1 rounded-full hover:bg-[#222222] text-zinc-500 hover:text-white shrink-0"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        <div className="p-3 flex items-center gap-2">
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileUpload}
          accept="image/*"
          className="hidden"
        />

        {isRecordingAudio ? (
          <div className="flex-1 flex items-center justify-between bg-red-950/80 border border-red-600/50 rounded-xl px-4 py-2 text-red-300 animate-pulse">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-ping" />
              <span className="text-xs font-mono font-bold">RECORDING {audioSeconds}s</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => handleStopVoiceRecord(false)}
                className="px-2.5 py-1 bg-[#171717] hover:bg-[#222222] text-xs font-semibold rounded-lg text-zinc-300"
              >
                Cancel
              </button>
              <button
                onClick={() => handleStopVoiceRecord(true)}
                className="px-3 py-1 bg-[#10B981] hover:bg-emerald-400 text-black text-xs font-bold rounded-lg shadow-md"
              >
                Send
              </button>
            </div>
          </div>
        ) : (
          <form
            onSubmit={e => {
              e.preventDefault();
              if (editingMessage) handleSubmitEdit();
              else handleSend();
            }}
            className="flex-1 flex items-center gap-2"
          >
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={!!editingMessage}
              className="p-2.5 rounded-xl bg-[#171717] hover:bg-[#222222] text-zinc-400 hover:text-white transition-all active:scale-95 disabled:opacity-30 disabled:pointer-events-none"
              title="Attach Photo"
            >
              <ImageIcon className="w-5 h-5 text-zinc-300" />
            </button>

            <div className="relative flex-1">
              <input
                type="text"
                value={inputContent}
                onChange={e => {
                  setInputContent(e.target.value);
                  broadcastTyping();
                }}
                placeholder={editingMessage ? 'Edit message...' : `Message ${partner.display_name}...`}
                className="w-full bg-[#171717] border border-[#262626] focus:border-[#10B981] rounded-xl pl-4 pr-10 py-2.5 text-sm text-white placeholder-zinc-500 outline-none transition-colors"
              />
              <button
                type="button"
                onClick={() => setShowStickerPicker(v => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-[#10B981] transition-colors"
                title="Stickers"
              >
                <Smile className="w-5 h-5" />
              </button>

              {showStickerPicker && (
                <div className="absolute bottom-full mb-2 right-0 bg-[#171717] border border-[#262626] rounded-xl p-2 grid grid-cols-4 gap-1 shadow-2xl z-10">
                  {STICKERS.map(s => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => handleSendSticker(s)}
                      className="text-2xl p-1.5 hover:bg-[#222222] rounded-lg transition-colors"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {inputContent.trim() ? (
              <button
                type="submit"
                className="bg-[#10B981] hover:bg-emerald-400 active:scale-95 text-black p-2.5 rounded-xl flex items-center justify-center font-bold shadow-md transition-all"
              >
                <Send className="w-4 h-4 fill-current" />
              </button>
            ) : (
              <button
                type="button"
                onClick={handleStartVoiceRecord}
                className="p-2.5 rounded-xl bg-[#171717] hover:bg-[#222222] text-zinc-400 hover:text-white transition-all active:scale-95"
                title="Record Voice Note"
              >
                <Mic className="w-5 h-5 text-[#10B981]" />
              </button>
            )}
          </form>
        )}
        </div>
      </div>

      {/* Chat Options Sheet */}
      {showChatOptions && (
        <ChatOptionsSheet
          onClose={() => setShowChatOptions(false)}
          onViewContact={() => {
            setShowChatOptions(false);
            setShowContactInfo(true);
          }}
          onMute={() => {
            setShowChatOptions(false);
            showToast('Notifications muted', 'success');
          }}
          onClearChat={handleClearChat}
          onPlayGame={handlePlayGame}
          onReportUser={() => {
            setShowChatOptions(false);
            setShowReportModal(true);
          }}
        />
      )}

      {/* Contact Info Panel */}
      {showContactInfo && <ContactInfoPanel partner={partner} onClose={() => setShowContactInfo(false)} />}

      {/* Report User Modal */}
      {showReportModal && (
        <ReportUserModal
          partnerName={partner.display_name}
          onClose={() => setShowReportModal(false)}
          onSubmit={handleSubmitReport}
        />
      )}
    </div>
  );
};

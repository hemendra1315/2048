import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ArrowLeft, Send, Lock, MoreVertical, Smile, Mic, Image as ImageIcon } from 'lucide-react';
import { MessageItem, UserProfile } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { mockBackend } from '../../lib/mockBackend';
import { supabase, isSupabaseConfigured } from '../../lib/supabase';
import { getAvatarUrl } from '../../lib/utils';
import { useToast } from '../../context/ToastContext';
import { MessageBubble } from './chatRoom/MessageBubble';
import { ChatOptionsSheet } from './chatRoom/ChatOptionsSheet';
import { ContactInfoPanel } from './chatRoom/ContactInfoPanel';

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
  const [showStickerPicker, setShowStickerPicker] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const typingHideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTypingSentAtRef = useRef(0);

  const STICKERS = ['😂', '❤️', '🔥', '👍', '🎉', '😢', '😮', '🙏'];

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

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
          setMessages(data as unknown as MessageItem[]);
          await supabase
            .from('messages')
            .update({ is_read: true } as unknown as { is_read: boolean })
            .eq('conversation_id', conversationId)
            .neq('sender_id', user.id);
        }
      } else {
        const msgs = mockBackend.getMessages(conversationId);
        setMessages(msgs);
        mockBackend.markMessagesAsRead(conversationId, user.id);
      }
    } catch (err) {
      console.error('Error loading messages:', err);
    }
  }, [conversationId, user]);

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
      const channel = supabase
        .channel(`chat:${conversationId}`)
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
            setMessages(prev => prev.map(m => (m.id === updatedMsg.id ? updatedMsg : m)));
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

    try {
      if (isSupabaseConfigured()) {
        const { error } = await supabase.from('messages').insert({
          conversation_id: conversationId,
          sender_id: user.id,
          content,
        } as unknown as { conversation_id: string; sender_id: string; content: string });
        if (error) throw error;
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
              {isTyping ? <span className="text-[#10B981]">typing...</span> : 'Online'}
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
              onOpenMedia={onOpenMedia}
              playingAudioId={playingAudioId}
              setPlayingAudioId={setPlayingAudioId}
              onPlayAudio={playAudio}
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
      <div className="bg-[#111111] border-t border-[#262626] p-3 flex items-center gap-2">
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
          <form onSubmit={e => { e.preventDefault(); handleSend(); }} className="flex-1 flex items-center gap-2">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="p-2.5 rounded-xl bg-[#171717] hover:bg-[#222222] text-zinc-400 hover:text-white transition-all active:scale-95"
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
                placeholder={`Message ${partner.display_name}...`}
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
        />
      )}

      {/* Contact Info Panel */}
      {showContactInfo && <ContactInfoPanel partner={partner} onClose={() => setShowContactInfo(false)} />}
    </div>
  );
};

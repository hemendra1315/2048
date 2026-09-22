import React, { useState, useEffect, useRef, useCallback } from 'react';
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
} from 'lucide-react';
import { MessageItem, UserProfile } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { mockBackend } from '../../lib/mockBackend';
import { supabase, isSupabaseConfigured } from '../../lib/supabase';
import { formatTimestamp } from '../../lib/utils';
import { useToast } from '../../context/ToastContext';

interface ChatRoomProps {
  conversationId: string;
  partner: UserProfile;
  onBack: () => void;
  onOpenMedia?: (url: string) => void;
}

export const ChatRoom: React.FC<ChatRoomProps> = ({
  conversationId,
  partner,
  onBack,
  onOpenMedia,
}) => {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [messages, setMessages] = useState<MessageItem[]>([]);
  const [inputContent, setInputContent] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [playingAudioId, setPlayingAudioId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [conversationId, loadMessages, user]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

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

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      handleSend(`[IMAGE]${dataUrl}`);
      showToast('Encrypted photo shared', 'success');
    };
    reader.readAsDataURL(file);
  };

  const handleSendVoiceNote = () => {
    handleSend('[VOICE_NOTE:0:14]');
    showToast('Encrypted voice note transmitted', 'success');
  };

  return (
    <div className="flex flex-col h-[calc(100vh-140px)] md:h-[680px] bg-[#0A0A0A] border border-[#262626] rounded-2xl overflow-hidden select-none animate-fade-in">
      {/* Header */}
      <header className="bg-[#111111] border-b border-[#262626] px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-1.5 rounded-xl bg-[#171717] hover:bg-[#222222] text-zinc-300 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>

          <img
            src={partner.avatar_url || `https://api.dicebear.com/7.x/bottts/svg?seed=${partner.uid}`}
            alt="Partner"
            className="w-10 h-10 rounded-xl bg-[#171717] border border-[#262626] object-cover"
          />

          <div>
            <div className="flex items-center gap-1.5">
              <h3 className="text-sm font-bold text-white leading-tight">{partner.display_name}</h3>
              <span className="w-2 h-2 rounded-full bg-[#10B981]" />
            </div>
            <div className="flex items-center gap-1 text-[11px] font-mono text-[#10B981]">
              <ShieldCheck className="w-3 h-3" />
              <span>{partner.uid}</span>
              <span className="text-zinc-500 font-sans ml-1 text-[10px]">• E2E Encrypted</span>
            </div>
          </div>
        </div>
      </header>

      {/* Messages Thread */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-[#0A0A0A]">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-6 text-xs text-zinc-500">
            <div className="w-14 h-14 rounded-2xl bg-[#111111] border border-[#262626] flex items-center justify-center text-[#10B981] mb-3">
              <Lock className="w-7 h-7" />
            </div>
            <span className="font-bold text-white text-sm mb-1">Direct Encrypted Channel</span>
            <p className="max-w-xs text-[11px] text-zinc-400">
              Only you and {partner.display_name} have cryptographic clearance to this stream.
            </p>
          </div>
        ) : (
          messages.map(msg => {
            const isMe = msg.sender_id === user?.id;
            const isImage = msg.content.startsWith('[IMAGE]');
            const isVoice = msg.content.startsWith('[VOICE_NOTE');

            return (
              <div
                key={msg.id}
                className={`flex flex-col ${isMe ? 'items-end' : 'items-start'} animate-fade-in`}
              >
                <div
                  className={`max-w-[85%] sm:max-w-[70%] p-3 rounded-2xl text-sm leading-relaxed ${
                    isMe
                      ? 'bg-[#10B981] text-black font-medium rounded-br-xs shadow-md'
                      : 'bg-[#171717] border border-[#262626] text-white rounded-bl-xs shadow-sm'
                  }`}
                >
                  {isImage ? (
                    <div
                      onClick={() => onOpenMedia && onOpenMedia(msg.content.replace('[IMAGE]', ''))}
                      className="cursor-pointer rounded-xl overflow-hidden border border-black/20"
                    >
                      <img
                        src={msg.content.replace('[IMAGE]', '')}
                        alt="Encrypted attachment"
                        className="max-h-60 w-full object-cover rounded-lg"
                      />
                    </div>
                  ) : isVoice ? (
                    <div className="flex items-center gap-3 min-w-[180px] py-1">
                      <button
                        onClick={() => setPlayingAudioId(playingAudioId === msg.id ? null : msg.id)}
                        className={`w-8 h-8 rounded-full flex items-center justify-center ${
                          isMe ? 'bg-black text-[#10B981]' : 'bg-[#10B981] text-black'
                        }`}
                      >
                        {playingAudioId === msg.id ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
                      </button>
                      <div className="flex-1 space-y-1">
                        <div className="h-2 rounded-full bg-black/20 overflow-hidden">
                          <div
                            className={`h-full ${isMe ? 'bg-black' : 'bg-[#10B981]'} ${
                              playingAudioId === msg.id ? 'w-3/4 animate-pulse' : 'w-1/4'
                            }`}
                          />
                        </div>
                        <span className={`text-[10px] font-mono ${isMe ? 'text-black/70' : 'text-zinc-400'}`}>
                          Voice Note (0:14)
                        </span>
                      </div>
                    </div>
                  ) : (
                    <span>{msg.content}</span>
                  )}
                </div>

                {/* Meta info / Read receipt */}
                <div className="flex items-center gap-1 text-[10px] text-zinc-500 mt-1 px-1">
                  <span>{formatTimestamp(msg.created_at)}</span>
                  {isMe && (
                    msg.is_read ? (
                      <CheckCheck className="w-3.5 h-3.5 text-[#10B981]" />
                    ) : (
                      <Check className="w-3.5 h-3.5 text-zinc-500" />
                    )
                  )}
                </div>
              </div>
            );
          })
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

        <button
          onClick={() => fileInputRef.current?.click()}
          className="p-2.5 rounded-xl bg-[#171717] hover:bg-[#222222] text-zinc-400 hover:text-white transition-all active:scale-95"
          title="Attach Photo"
        >
          <ImageIcon className="w-5 h-5 text-zinc-300" />
        </button>

        <button
          onClick={handleSendVoiceNote}
          className="p-2.5 rounded-xl bg-[#171717] hover:bg-[#222222] text-zinc-400 hover:text-white transition-all active:scale-95"
          title="Send Voice Note"
        >
          <Mic className="w-5 h-5 text-[#10B981]" />
        </button>

        <form onSubmit={e => { e.preventDefault(); handleSend(); }} className="flex-1 flex items-center gap-2">
          <input
            type="text"
            value={inputContent}
            onChange={e => setInputContent(e.target.value)}
            placeholder={`Message ${partner.display_name}...`}
            className="flex-1 bg-[#171717] border border-[#262626] focus:border-[#10B981] rounded-xl px-4 py-2.5 text-sm text-white placeholder-zinc-500 outline-none transition-colors"
          />
          <button
            type="submit"
            disabled={!inputContent.trim()}
            className="bg-[#10B981] hover:bg-emerald-400 disabled:opacity-40 active:scale-95 text-black p-2.5 rounded-xl flex items-center justify-center font-bold shadow-md transition-all"
          >
            <Send className="w-4 h-4 fill-current" />
          </button>
        </form>
      </div>
    </div>
  );
};

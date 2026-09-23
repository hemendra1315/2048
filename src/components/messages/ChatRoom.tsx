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
  RotateCcw,
} from 'lucide-react';
import { MessageItem, UserProfile } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { mockBackend } from '../../lib/mockBackend';
import { supabase, isSupabaseConfigured } from '../../lib/supabase';
import { uploadChatMedia } from '../../lib/storageHelper';
import { uniqueChannelName } from '../../lib/realtime';
import { formatTimestamp } from '../../lib/utils';
import { useToast } from '../../context/ToastContext';
import { Avatar } from '../common/Avatar';

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
        .channel(uniqueChannelName(`chat:${conversationId}`))
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
          () => {
            loadMessages();
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [conversationId, loadMessages, user]);

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
      showToast('Encrypted photo shared', 'success');
    } catch (err) {
      console.error('File upload error:', err);
      showToast('Photo upload failed', 'error');
    } finally {
      setIsUploadingMedia(false);
    }
  };

  const [isRecordingAudio, setIsRecordingAudio] = useState(false);
  const [audioSeconds, setAudioSeconds] = useState(0);
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
        const dur = `${Math.floor(audioSeconds / 60)}:${(audioSeconds % 60).toString().padStart(2, '0')}`;

        if (audioSeconds >= 1) {
          try {
            setIsUploadingMedia(true);
            const audioFile = new File([audioBlob], `voice-${Date.now()}.webm`, { type: 'audio/webm' });
            const mediaUrl = await uploadChatMedia(audioFile, conversationId);
            await handleSend(`[VOICE_NOTE:${dur}]${mediaUrl}`);
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
        mediaRecorderRef.current.stop();
      } else {
        mediaRecorderRef.current.stream.getTracks().forEach(t => t.stop());
      }
      setIsRecordingAudio(false);
    }
  };

  const playAudio = (audioUrl: string, msgId: string) => {
    if (playingAudioId === msgId) {
      if (audioElementRef.current) audioElementRef.current.pause();
      setPlayingAudioId(null);
      return;
    }

    if (audioElementRef.current) audioElementRef.current.pause();

    const audio = new Audio(audioUrl);
    audioElementRef.current = audio;
    setPlayingAudioId(msgId);

    audio.onended = () => setPlayingAudioId(null);
    audio.onerror = () => setPlayingAudioId(null);
    audio.play().catch(() => setPlayingAudioId(null));
  };

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
            online={true}
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
              <span className="text-vault-500 font-sans hidden sm:inline">• E2E Encrypted</span>
            </div>
          </div>
        </div>
      </header>

      {/* 2. MESSAGE STREAM (High Readability 15px/22px, 70% Max Width, Grouped) */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-2 bg-vault-950 min-h-0">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-6 text-xs text-vault-500 gap-2">
            <div className="w-14 h-14 rounded-2xl bg-vault-900 border border-vault-750 flex items-center justify-center text-emerald mb-2 shadow-sm">
              <Lock className="w-7 h-7" aria-hidden />
            </div>
            <span className="font-bold text-white text-base">Direct Encrypted Stream</span>
            <p className="max-w-xs text-xs text-vault-400 m-0">
              Only you and {partner.display_name} have cryptographic clearance to this stream.
            </p>
          </div>
        ) : (
          messages.map((msg, index) => {
            const isMe = msg.sender_id === user?.id;
            const isImage = msg.content.startsWith('[IMAGE]');
            const isVoice = msg.content.startsWith('[VOICE_NOTE');
            const voiceMatch = msg.content.match(/^\[VOICE_NOTE:(.*?)\](.*)$/);
            const voiceDuration = voiceMatch ? voiceMatch[1] : '0:14';
            const voiceDataUrl = voiceMatch ? voiceMatch[2] : '';

            // Group consecutive messages from same sender
            const prevMsg = messages[index - 1];
            const nextMsg = messages[index + 1];
            const isFirstInGroup = !prevMsg || prevMsg.sender_id !== msg.sender_id;
            const isLastInGroup = !nextMsg || nextMsg.sender_id !== msg.sender_id;

            return (
              <div
                key={msg.id}
                className={`flex flex-col ${isMe ? 'items-end' : 'items-start'} ${
                  isFirstInGroup ? 'mt-3' : 'mt-0.5'
                }`}
              >
                <div
                  className={`max-w-[70%] p-3 text-[15px] leading-[22px] break-words shadow-sm ${
                    isMe
                      ? `bg-[#10B981] text-[#04120C] font-medium ${
                          isLastInGroup ? 'rounded-2xl rounded-br-xs' : 'rounded-2xl'
                        }`
                      : `bg-[#1B1D21] border border-[#1E2025] text-[#F4F5F6] ${
                          isLastInGroup ? 'rounded-2xl rounded-bl-xs' : 'rounded-2xl'
                        }`
                  }`}
                >
                  {isImage ? (
                    <div
                      onClick={() => onOpenMedia?.(msg.content.replace('[IMAGE]', ''))}
                      className="cursor-pointer rounded-xl overflow-hidden border border-black/10"
                    >
                      <img
                        src={msg.content.replace('[IMAGE]', '')}
                        alt="Encrypted attachment"
                        className="max-h-72 w-full object-cover rounded-lg"
                        loading="lazy"
                      />
                    </div>
                  ) : isVoice ? (
                    <div className="flex items-center gap-3 min-w-[200px] py-1">
                      <button
                        type="button"
                        onClick={() => voiceDataUrl ? playAudio(voiceDataUrl, msg.id) : setPlayingAudioId(playingAudioId === msg.id ? null : msg.id)}
                        className={`w-9 h-9 rounded-full flex items-center justify-center ${
                          isMe ? 'bg-[#04120C] text-[#10B981]' : 'bg-[#10B981] text-[#04120C]'
                        } active:scale-90 transition-transform`}
                        aria-label={playingAudioId === msg.id ? 'Pause voice message' : 'Play voice message'}
                      >
                        {playingAudioId === msg.id ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
                      </button>
                      <div className="flex-1 space-y-1">
                        <div className="h-2 rounded-full bg-black/20 overflow-hidden">
                          <div
                            className={`h-full ${isMe ? 'bg-[#04120C]' : 'bg-[#10B981]'} ${
                              playingAudioId === msg.id ? 'w-3/4 animate-pulse' : 'w-1/4'
                            }`}
                          />
                        </div>
                        <span className={`text-[11px] font-mono ${isMe ? 'text-[#04120C]/75' : 'text-vault-400'}`}>
                          Voice Note ({voiceDuration})
                        </span>
                      </div>
                    </div>
                  ) : (
                    <span>{msg.content}</span>
                  )}
                </div>

                {/* Timestamp & Read Receipts */}
                <div className={`flex items-center gap-1.5 text-[11px] text-vault-500 font-mono mt-1 px-1 ${isMe ? 'justify-end' : 'justify-start'}`}>
                  <span>{formatTimestamp(msg.created_at)}</span>
                  {isMe && (
                    msg.is_read ? (
                      <CheckCheck className="w-3.5 h-3.5 text-emerald" aria-label="Read" />
                    ) : (
                      <Check className="w-3.5 h-3.5 text-vault-500" aria-label="Sent" />
                    )
                  )}
                </div>
              </div>
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

        <div ref={messagesEndRef} />
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
                type="text"
                value={inputContent}
                onChange={e => setInputContent(e.target.value)}
                placeholder={`Message ${partner.display_name}...`}
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
    </div>
  );
};

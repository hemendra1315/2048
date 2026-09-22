import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ArrowLeft, Send, CheckCheck, Check, Shield } from 'lucide-react';
import { MessageItem, UserProfile } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { mockBackend } from '../../lib/mockBackend';
import { supabase, isSupabaseConfigured } from '../../lib/supabase';
import { formatTimestamp } from '../../lib/utils';

interface ChatRoomProps {
  conversationId: string;
  partner: UserProfile;
  onBack: () => void;
}

export const ChatRoom: React.FC<ChatRoomProps> = ({
  conversationId,
  partner,
  onBack,
}) => {
  const { user } = useAuth();
  const [messages, setMessages] = useState<MessageItem[]>([]);
  const [inputContent, setInputContent] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<number | null>(null);

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
          // Mark as read
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
      // Supabase Realtime Channel
      const channel = supabase
        .channel(`chat:${conversationId}`)
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conversationId}` },
          payload => {
            setMessages(prev => [...prev, payload.new as unknown as MessageItem]);
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

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    const content = inputContent.trim();
    if (!content || !user) return;

    setInputContent('');

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

        // Simulate intelligent automated response from Demo Friends
        if (partner.uid === 'SOLAR-8120' || partner.uid === 'VORTEX-3391') {
          setTimeout(() => {
            setIsTyping(true);
            setTimeout(() => {
              setIsTyping(false);
              const responses = [
                'Got your message through the Vault channel!',
                'Nice move! The stealth launcher keeps everything completely hidden.',
                'Confirmed. The connection is working flawlessly.',
                'Let me know if you checked out the new high scores!',
              ];
              const autoReply = responses[Math.floor(Math.random() * responses.length)];
              mockBackend.sendMessage(conversationId, partner.id, autoReply);
            }, 1400);
          }, 600);
        }
      }
    } catch (err) {
      console.error('Send message error:', err);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputContent(e.target.value);
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
  };

  return (
    <div className="fixed inset-0 z-40 bg-vault-950 flex flex-col max-w-md mx-auto">
      {/* Header */}
      <header className="bg-vault-900 border-b border-vault-800 px-4 py-3 flex items-center justify-between shadow-md">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-1.5 rounded-xl bg-vault-800 text-vault-200 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>

          <img
            src={partner.avatar_url || `https://api.dicebear.com/7.x/bottts/svg?seed=${partner.uid}`}
            alt="Partner"
            className="w-9 h-9 rounded-xl bg-vault-800 border border-vault-700 object-cover"
          />

          <div>
            <h3 className="text-sm font-bold text-white leading-tight">{partner.display_name}</h3>
            <div className="flex items-center gap-1 text-[11px] font-mono text-arcade-gold">
              <Shield className="w-3 h-3" />
              <span>{partner.uid}</span>
            </div>
          </div>
        </div>
      </header>

      {/* Messages Thread */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-6 text-xs text-vault-400">
            <div className="w-12 h-12 rounded-2xl bg-vault-900 border border-vault-800 flex items-center justify-center text-arcade-gold mb-2">
              <Shield className="w-6 h-6" />
            </div>
            <span className="font-bold text-white text-sm mb-1">Direct 1-to-1 Channel</span>
            <p className="max-w-xs text-[11px] text-vault-500">
              Only you and {partner.display_name} have access to this conversation. No public directory exists.
            </p>
          </div>
        ) : (
          messages.map(msg => {
            const isMe = msg.sender_id === user?.id;
            return (
              <div
                key={msg.id}
                className={`flex flex-col ${isMe ? 'items-end' : 'items-start'} animate-fade-in`}
              >
                <div
                  className={`max-w-[82%] px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed ${
                    isMe
                      ? 'bg-gradient-to-r from-amber-600 to-arcade-gold text-vault-950 font-medium rounded-br-xs shadow-md shadow-amber-500/10'
                      : 'bg-vault-900 border border-vault-800 text-vault-100 rounded-bl-xs shadow-sm'
                  }`}
                >
                  {msg.content}
                </div>

                <div className="flex items-center gap-1 text-[10px] text-vault-500 mt-1 px-1">
                  <span>{formatTimestamp(msg.created_at)}</span>
                  {isMe && (
                    msg.is_read ? (
                      <CheckCheck className="w-3 h-3 text-cyan-400" />
                    ) : (
                      <Check className="w-3 h-3 text-vault-500" />
                    )
                  )}
                </div>
              </div>
            );
          })
        )}

        {isTyping && (
          <div className="flex items-center gap-1.5 bg-vault-900 border border-vault-800 px-3 py-1.5 rounded-full w-20 text-vault-400 animate-pulse">
            <div className="w-1.5 h-1.5 bg-arcade-gold rounded-full animate-bounce" />
            <div className="w-1.5 h-1.5 bg-arcade-gold rounded-full animate-bounce [animation-delay:0.2s]" />
            <div className="w-1.5 h-1.5 bg-arcade-gold rounded-full animate-bounce [animation-delay:0.4s]" />
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Bar */}
      <form onSubmit={handleSend} className="bg-vault-900 border-t border-vault-800 p-3 flex gap-2">
        <input
          type="text"
          value={inputContent}
          onChange={handleInputChange}
          placeholder={`Message ${partner.display_name}...`}
          className="flex-1 bg-vault-950 border border-vault-700 focus:border-arcade-gold rounded-2xl px-4 py-2.5 text-sm text-white placeholder-vault-600 outline-none transition-colors"
        />
        <button
          type="submit"
          disabled={!inputContent.trim()}
          className="bg-arcade-gold hover:bg-amber-400 disabled:opacity-40 active:scale-95 text-vault-950 p-2.5 rounded-2xl flex items-center justify-center font-bold shadow-md transition-all"
        >
          <Send className="w-5 h-5 fill-current" />
        </button>
      </form>
    </div>
  );
};

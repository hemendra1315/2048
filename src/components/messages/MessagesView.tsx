import React, { useState, useEffect, useCallback } from 'react';
import { MessageSquare, Search, Shield, Plus } from 'lucide-react';
import { ConversationItem, UserProfile } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { mockBackend } from '../../lib/mockBackend';
import { supabase, isSupabaseConfigured } from '../../lib/supabase';
import { formatTimestamp } from '../../lib/utils';
import { ChatRoom } from './ChatRoom';

interface MessagesViewProps {
  initialPartnerId?: string | null;
  onClearInitialPartner?: () => void;
  onOpenConnectionsTab: () => void;
}

export const MessagesView: React.FC<MessagesViewProps> = ({
  initialPartnerId,
  onClearInitialPartner,
  onOpenConnectionsTab,
}) => {
  const { user } = useAuth();
  const [conversations, setConversations] = useState<ConversationItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeConversation, setActiveConversation] = useState<{
    id: string;
    partner: UserProfile;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  const loadConversations = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      if (isSupabaseConfigured()) {
        const { data: rawConvs } = await supabase
          .from('conversations')
          .select('*')
          .or(`user_a.eq.${user.id},user_b.eq.${user.id}`)
          .order('updated_at', { ascending: false });

        const convs = (rawConvs || []) as unknown as { id: string; user_a: string; user_b: string; created_at: string; updated_at: string }[];

        if (convs.length > 0) {
          const partnerIds = convs.map(c => (c.user_a === user.id ? c.user_b : c.user_a));
          const { data: rawProfiles } = await supabase
            .from('profiles')
            .select('*')
            .in('id', partnerIds);

          const profiles = (rawProfiles || []) as unknown as UserProfile[];

          const formatted: ConversationItem[] = convs.map(c => {
            const pId = c.user_a === user.id ? c.user_b : c.user_a;
            const partner = profiles?.find(p => p.id === pId) || {
              id: pId,
              uid: 'UNKNOWN',
              display_name: 'Contact',
              avatar_url: null,
              role: 'user',
              status: 'active',
              created_at: '',
              updated_at: '',
            };
            return {
              id: c.id,
              user_a: c.user_a,
              user_b: c.user_b,
              created_at: c.created_at,
              updated_at: c.updated_at,
              partner: partner as ConversationItem['partner'],
              unreadCount: 0,
            };
          });
          setConversations(formatted);
        } else {
          setConversations([]);
        }
      } else {
        const list = mockBackend.getConversations(user.id);
        setConversations(list);
      }
    } catch (err) {
      console.error('Error loading conversations:', err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    loadConversations();

    if (!isSupabaseConfigured()) {
      const unsub = mockBackend.subscribe('messages:updated', () => loadConversations());
      return unsub;
    }
  }, [loadConversations]);

  // Handle direct navigation to a chat partner
  useEffect(() => {
    if (initialPartnerId && user) {
      const convId = mockBackend.getOrCreateConversation(user.id, initialPartnerId);
      const partner = mockBackend.getProfileById(initialPartnerId);
      if (partner) {
        setActiveConversation({ id: convId, partner });
      }
      onClearInitialPartner?.();
    }
  }, [initialPartnerId, user, onClearInitialPartner]);

  const filteredConversations = conversations.filter(c =>
    c.partner.display_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.partner.uid.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (activeConversation) {
    return (
      <ChatRoom
        conversationId={activeConversation.id}
        partner={activeConversation.partner}
        onBack={() => {
          setActiveConversation(null);
          loadConversations();
        }}
      />
    );
  }

  return (
    <div className="space-y-4 pb-20 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-bold text-white">Direct Messages</h2>
          <p className="text-xs text-vault-400">Strict 1-to-1 encrypted threads</p>
        </div>

        <button
          onClick={onOpenConnectionsTab}
          className="flex items-center gap-1.5 bg-vault-900 hover:bg-vault-800 text-vault-200 border border-vault-700 text-xs font-semibold px-3 py-2 rounded-xl transition-all"
        >
          <Plus className="w-4 h-4 text-arcade-gold" />
          <span>New Chat</span>
        </button>
      </div>

      {/* Search Filter */}
      <div className="relative">
        <Search className="w-4 h-4 text-vault-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
        <input
          type="text"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          placeholder="Search conversations..."
          className="w-full bg-vault-900 border border-vault-800 focus:border-arcade-gold rounded-2xl pl-10 pr-4 py-2.5 text-xs text-white placeholder-vault-600 outline-none transition-colors"
        />
      </div>

      {/* Conversation List */}
      {loading ? (
        <div className="p-8 text-center text-xs text-vault-400">Loading conversation matrix...</div>
      ) : filteredConversations.length === 0 ? (
        <div className="bg-vault-900/60 border border-vault-800 rounded-3xl p-8 text-center">
          <MessageSquare className="w-10 h-10 text-vault-600 mx-auto mb-2" />
          <h4 className="text-sm font-bold text-white mb-1">No Active Conversations</h4>
          <p className="text-xs text-vault-400 mb-4 max-w-xs mx-auto">
            Start a direct message thread with any of your approved connections.
          </p>
          <button
            onClick={onOpenConnectionsTab}
            className="bg-arcade-gold hover:bg-amber-400 text-vault-950 font-bold text-xs px-4 py-2 rounded-xl shadow-md transition-all"
          >
            Browse Approved Connections
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {filteredConversations.map(conv => (
            <button
              key={conv.id}
              onClick={() => setActiveConversation({ id: conv.id, partner: conv.partner })}
              className="w-full bg-vault-900 border border-vault-800 hover:border-vault-700 active:scale-[0.99] p-3.5 rounded-2xl flex items-center justify-between text-left transition-all shadow-sm"
            >
              <div className="flex items-center gap-3">
                <div className="relative">
                  <img
                    src={conv.partner.avatar_url || `https://api.dicebear.com/7.x/bottts/svg?seed=${conv.partner.uid}`}
                    alt="Avatar"
                    className="w-12 h-12 rounded-2xl bg-vault-800 border border-vault-700 object-cover"
                  />
                  {conv.unreadCount > 0 && (
                    <span className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-cyan-400 border-2 border-vault-950 animate-pulse" />
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h4 className="text-sm font-bold text-white truncate">
                      {conv.partner.display_name}
                    </h4>
                    <span className="text-[10px] font-mono text-arcade-gold flex items-center gap-0.5">
                      <Shield className="w-2.5 h-2.5" />
                      {conv.partner.uid}
                    </span>
                  </div>

                  <p className="text-xs text-vault-400 truncate mt-0.5 max-w-[200px]">
                    {conv.lastMessage?.content || 'No messages yet in this channel'}
                  </p>
                </div>
              </div>

              <div className="flex flex-col items-end gap-1 shrink-0 ml-2">
                <span className="text-[10px] text-vault-500">
                  {conv.lastMessage ? formatTimestamp(conv.lastMessage.created_at) : ''}
                </span>
                {conv.unreadCount > 0 && (
                  <span className="px-2 py-0.5 bg-cyan-500 text-vault-950 text-[10px] font-bold rounded-full">
                    {conv.unreadCount}
                  </span>
                )}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

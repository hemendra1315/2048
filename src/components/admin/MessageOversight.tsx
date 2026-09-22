import React, { useState, useEffect } from 'react';
import { MessageSquare, Search, Eye, Calendar } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { AdminConversation, getProfileMap, listConversations, logConversationView } from '../../lib/adminApi';
import { formatDetailedDate } from '../../lib/utils';
import { UserProfile } from '../../types';

export const MessageOversight: React.FC = () => {
  const { user } = useAuth();
  const [conversations, setConversations] = useState<AdminConversation[]>([]);
  const [profiles, setProfiles] = useState<Record<string, UserProfile>>({});
  const [selectedConv, setSelectedConv] = useState<AdminConversation | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    Promise.all([listConversations(user.id), getProfileMap()])
      .then(([convs, map]) => {
        if (cancelled) return;
        setConversations(convs);
        setProfiles(map);
      })
      .catch(err => console.error('Conversation oversight load failed:', err));
    return () => {
      cancelled = true;
    };
  }, [user]);

  const inspect = (conv: AdminConversation) => {
    setSelectedConv(conv);
    // Opening a private conversation is recorded in the audit log.
    logConversationView(conv).catch(err => console.error('Audit log write failed:', err));
  };

  const filtered = conversations.filter(c => {
    const p1 = profiles[c.user_a];
    const p2 = profiles[c.user_b];
    return (
      Boolean(p1?.uid.toLowerCase().includes(searchQuery.toLowerCase())) ||
      Boolean(p2?.uid.toLowerCase().includes(searchQuery.toLowerCase())) ||
      Boolean(p1?.display_name.toLowerCase().includes(searchQuery.toLowerCase())) ||
      Boolean(p2?.display_name.toLowerCase().includes(searchQuery.toLowerCase()))
    );
  });

  return (
    <div className="space-y-4 pb-20 animate-fade-in">
      <div>
        <h2 className="text-base font-bold text-white">Central Message Oversight</h2>
        <p className="text-xs text-vault-400">Review 1-to-1 conversations across the platform (Audited)</p>
      </div>

      <div className="relative">
        <Search className="w-4 h-4 text-vault-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
        <input
          type="text"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          placeholder="Filter by Participant UID or Name..."
          className="w-full bg-vault-900 border border-vault-800 focus:border-amber-500 rounded-2xl pl-10 pr-4 py-2.5 text-xs text-white placeholder-vault-600 outline-none"
        />
      </div>

      <div className="space-y-2.5">
        {filtered.map(conv => {
          const uA = profiles[conv.user_a];
          const uB = profiles[conv.user_b];

          return (
            <div
              key={conv.id}
              className="bg-vault-900 border border-vault-800 rounded-2xl p-4 flex flex-col gap-3 shadow-sm"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs font-bold text-white">
                  <span className="font-mono text-arcade-gold">{uA?.uid}</span>
                  <span className="text-vault-500">↔</span>
                  <span className="font-mono text-arcade-gold">{uB?.uid}</span>
                </div>

                <span className="text-[10px] text-vault-400 bg-vault-950 px-2 py-0.5 rounded-md border border-vault-800">
                  {conv.messages.length} Messages
                </span>
              </div>

              <div className="flex items-center justify-between text-xs text-vault-400 pt-2 border-t border-vault-800">
                <div className="flex items-center gap-1.5 text-[11px]">
                  <Calendar className="w-3 h-3 text-vault-500" />
                  <span>Last Active: {formatDetailedDate(conv.updated_at)}</span>
                </div>

                <button
                  onClick={() => inspect(conv)}
                  className="px-3 py-1 bg-vault-800 hover:bg-vault-700 text-arcade-gold rounded-lg font-bold text-xs flex items-center gap-1 border border-vault-700 transition-all"
                >
                  <Eye className="w-3.5 h-3.5" /> Inspect
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Inspection Modal */}
      {selectedConv && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-vault-900 border border-vault-700/80 rounded-3xl w-full max-w-md max-h-[85vh] flex flex-col shadow-2xl p-5">
            <div className="flex items-center justify-between pb-3 border-b border-vault-800 mb-3">
              <div className="flex items-center gap-2">
                <MessageSquare className="w-5 h-5 text-arcade-gold" />
                <h3 className="text-sm font-bold text-white">Conversation Audit Inspector</h3>
              </div>
              <button
                onClick={() => setSelectedConv(null)}
                className="text-xs text-vault-400 hover:text-white"
              >
                Close
              </button>
            </div>

            {/* Message Stream */}
            <div className="flex-1 overflow-y-auto space-y-2.5 p-1">
              {selectedConv.messages.map(m => {
                const author = profiles[m.sender_id];
                return (
                  <div key={m.id} className="bg-vault-950 p-3 rounded-xl border border-vault-800 text-xs">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-bold text-arcade-gold font-mono">{author?.uid} ({author?.display_name})</span>
                      <span className="text-[10px] text-vault-500">{formatDetailedDate(m.created_at)}</span>
                    </div>
                    <p className="text-vault-200 leading-relaxed">{m.content}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

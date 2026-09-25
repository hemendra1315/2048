import React from 'react';
import { MessageSquare, Search, Eye } from 'lucide-react';
import { ConversationItem, MessageItem, UserProfile } from '../../../types';
import { logAdminAction } from '../../../lib/adminApi';
import { formatDetailedDate, getAvatarUrl } from '../../../lib/utils';

type ConversationWithDetail = ConversationItem & { partnerProfile: UserProfile; messages: MessageItem[] };

interface ChatsTabProps {
  currentUser: UserProfile;
  currentAdminId: string | undefined;
  conversations: ConversationWithDetail[];
  selectedConv: ConversationWithDetail | null;
  setSelectedConv: (conv: ConversationWithDetail | null) => void;
  chatSearch: string;
  setChatSearch: (value: string) => void;
}

export const ChatsTab: React.FC<ChatsTabProps> = ({
  currentUser,
  currentAdminId,
  conversations,
  selectedConv,
  setSelectedConv,
  chatSearch,
  setChatSearch,
}) => {
  const filteredMessages = selectedConv
    ? selectedConv.messages.filter(m => m.content.toLowerCase().includes(chatSearch.toLowerCase()))
    : [];

  return (
    <div className="space-y-3 animate-fade-in">
      {conversations.length === 0 ? (
        <div className="bg-vault-900 border border-vault-800 rounded-2xl p-8 text-center text-xs text-vault-400">
          No conversations found in Supabase for this user.
        </div>
      ) : (
        <div className="space-y-2">
          {conversations.map(c => {
            const lastMsg = c.messages[c.messages.length - 1];
            return (
              <div
                key={c.id}
                onClick={async () => {
                  setSelectedConv(c);
                  setChatSearch('');
                  if (currentAdminId) {
                    await logAdminAction(currentAdminId, 'OPEN_CONVERSATION_INSPECTOR', currentUser.id, c.id, {
                      partner: c.partnerProfile.uid,
                    });
                  }
                }}
                className="bg-vault-900 hover:bg-vault-850 border border-vault-800 rounded-2xl p-3.5 cursor-pointer transition-all shadow-sm flex items-center justify-between"
              >
                <div className="flex items-center gap-3">
                  <img
                    src={c.partnerProfile.avatar_url || getAvatarUrl(c.partnerProfile.uid)}
                    alt="Partner"
                    className="w-10 h-10 rounded-xl bg-vault-800 object-cover border border-vault-700"
                  />
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-bold text-white">{c.partnerProfile.display_name}</span>
                      <span className="text-[10px] font-mono text-arcade-gold font-bold">
                        {c.partnerProfile.uid}
                      </span>
                    </div>
                    <p className="text-[11px] text-vault-400 truncate max-w-[200px] mt-0.5">
                      {lastMsg ? lastMsg.content : 'No messages'}
                    </p>
                    <div className="text-[9px] text-vault-500 mt-0.5">
                      ID: {c.id} • Active: {formatDetailedDate(c.updated_at)}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-[10px] bg-vault-950 px-2 py-0.5 rounded-md border border-vault-800 text-vault-300">
                    {c.messages.length} msgs
                  </span>
                  <Eye className="w-4 h-4 text-arcade-gold" />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Full Conversation Inspector Modal */}
      {selectedConv && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-vault-900 border border-vault-700/80 rounded-3xl w-full max-w-md max-h-[85vh] flex flex-col shadow-2xl p-4.5">
            {/* Header */}
            <div className="flex items-center justify-between pb-3 border-b border-vault-800 mb-3">
              <div className="flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-arcade-gold" />
                <h4 className="text-xs font-bold text-white">
                  Chat: {currentUser.uid} ↔ {selectedConv.partnerProfile.uid}
                </h4>
              </div>
              <button
                onClick={() => setSelectedConv(null)}
                className="text-xs text-vault-400 hover:text-white font-bold"
              >
                Close
              </button>
            </div>

            {/* In-Chat Message Search */}
            <div className="relative mb-3">
              <Search className="w-3.5 h-3.5 text-vault-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={chatSearch}
                onChange={e => setChatSearch(e.target.value)}
                placeholder="Search in conversation transcripts..."
                className="w-full bg-vault-950 border border-vault-800 rounded-xl pl-9 pr-3 py-1.5 text-xs text-white placeholder-vault-600 outline-none"
              />
            </div>

            {/* Message Stream */}
            <div className="flex-1 overflow-y-auto space-y-2 p-1 max-h-[50vh]">
              {filteredMessages.length === 0 ? (
                <div className="text-center text-xs text-vault-500 py-6">No matching messages found</div>
              ) : (
                filteredMessages.map(m => {
                  const isTargetUser = m.sender_id === currentUser.id;
                  return (
                    <div
                      key={m.id}
                      className={`p-2.5 rounded-xl border text-xs ${
                        isTargetUser
                          ? 'bg-amber-950/30 border-amber-800/40 text-amber-100'
                          : 'bg-vault-950 border-vault-800 text-vault-200'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-bold font-mono text-[10px] text-arcade-gold">
                          {isTargetUser
                            ? `@${currentUser.username || 'user'} (${currentUser.uid})`
                            : `@${selectedConv.partnerProfile.username || 'partner'} (${selectedConv.partnerProfile.uid})`}
                        </span>
                        <span className="text-[9px] text-vault-500">{formatDetailedDate(m.created_at)}</span>
                      </div>
                      <p className="leading-relaxed break-words">{m.content}</p>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

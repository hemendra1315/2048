import React, { useEffect, useRef } from 'react';
import { ArrowLeft, Lock } from 'lucide-react';
import { MessageItem, UserProfile } from '../../types';
import { formatTimestamp } from '../../lib/utils';
import { Avatar } from '../common/Avatar';
import { readableMessagePreview } from '../../lib/chatExtras';

interface ConversationViewerProps {
  conversationId: string;
  partnerProfile: UserProfile;
  currentUserProfile: UserProfile;
  messages: MessageItem[];
  highlightMessageId?: string | null;
  onBack: () => void;
}

export const ConversationViewer: React.FC<ConversationViewerProps> = ({
  partnerProfile,
  currentUserProfile,
  messages,
  highlightMessageId,
  onBack,
}) => {
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (highlightMessageId) {
      const el = document.getElementById(`admin-msg-${highlightMessageId}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.classList.add('ring-2', 'ring-purple-500', 'bg-purple-950/40');
        setTimeout(() => {
          el.classList.remove('ring-2', 'ring-purple-500', 'bg-purple-950/40');
        }, 3000);
        return;
      }
    }
    // Default scroll to bottom
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages, highlightMessageId]);

  return (
    <div className="flex flex-col h-[75vh] max-h-[750px] bg-vault-950 border border-vault-800 rounded-2xl overflow-hidden shadow-2xl animate-fade-in">
      {/* Header */}
      <header className="p-3.5 bg-vault-900 border-b border-vault-800 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            className="p-1.5 rounded-xl bg-vault-950 hover:bg-vault-800 text-vault-300 hover:text-white border border-vault-800 transition-colors"
            aria-label="Back to conversations"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>

          <Avatar
            name={partnerProfile.display_name}
            seed={partnerProfile.uid}
            src={partnerProfile.avatar_url}
            size={40}
          />

          <div>
            <h3 className="text-sm font-bold text-white m-0 truncate">
              {partnerProfile.display_name}
            </h3>
            <p className="text-[11px] text-vault-400 font-mono m-0">
              @{partnerProfile.username || partnerProfile.uid} · Read-Only Transcript
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1 text-[11px] font-mono text-vault-400 px-2.5 py-1 rounded-full bg-vault-950 border border-vault-800">
          <Lock className="w-3 h-3 text-emerald" />
          <span>Encrypted Log</span>
        </div>
      </header>

      {/* Message Stream */}
      <div
        ref={listRef}
        className="flex-1 overflow-y-auto p-4 space-y-3 bg-[#080808]"
      >
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-6 text-xs text-vault-500 gap-1.5">
            <Lock className="w-6 h-6 text-vault-600 mb-1" />
            <span className="font-bold text-white">No Messages</span>
            <p className="text-vault-400 m-0">No recorded chat history for this conversation.</p>
          </div>
        ) : (
          messages.map(msg => {
            const isMe = msg.sender_id === currentUserProfile.id;
            const isHighlighted = msg.id === highlightMessageId;
            const isImage = msg.content.startsWith('[IMAGE') || msg.content.includes('[IMAGE');
            const imageUrl = isImage
              ? msg.content.replace(/^\[(IMAGE:VIEW_ONCE|IMAGE:ALLOW_REPLAY|IMAGE:SPOILER|IMAGE:spoiler|IMAGE)\]/, '')
              : '';

            return (
              <div
                key={msg.id}
                id={`admin-msg-${msg.id}`}
                className={`flex flex-col transition-all duration-300 rounded-xl p-1 ${
                  isMe ? 'items-end' : 'items-start'
                } ${isHighlighted ? 'ring-2 ring-purple-500 bg-purple-950/40' : ''}`}
              >
                <div className="text-[10px] text-vault-400 font-mono mb-1 px-1">
                  {isMe ? currentUserProfile.display_name : partnerProfile.display_name} · {formatTimestamp(msg.created_at)}
                </div>

                <div
                  className={`max-w-[80%] rounded-2xl px-3.5 py-2.5 text-sm ${
                    isMe
                      ? 'bg-gradient-to-br from-purple-600 to-pink-600 text-white rounded-br-sm'
                      : 'bg-vault-900 border border-vault-800 text-vault-100 rounded-bl-sm'
                  }`}
                >
                  {isImage ? (
                    <div className="space-y-1.5">
                      <img
                        src={imageUrl}
                        alt="Chat attachment"
                        className="rounded-xl max-h-60 max-w-full object-cover"
                        loading="lazy"
                      />
                      {msg.content.startsWith('[IMAGE:VIEW_ONCE]') && (
                        <span className="text-[10px] block opacity-80 font-mono">1 View Once Photo</span>
                      )}
                    </div>
                  ) : (
                    <span className="whitespace-pre-wrap">{readableMessagePreview(msg.content)}</span>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

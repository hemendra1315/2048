import React from 'react';
import { Image as ImageIcon, Mic, Pin } from 'lucide-react';
import { ConversationItem } from '../../../types';
import { formatTimestamp, getAvatarUrl } from '../../../lib/utils';

interface ConversationRowProps {
  conversation: ConversationItem;
  isSelected: boolean;
  onClick: () => void;
  onTogglePin: () => void;
}

export const ConversationRow: React.FC<ConversationRowProps> = ({ conversation: c, isSelected, onClick, onTogglePin }) => (
  <div
    onClick={onClick}
    className={`group relative flex items-center justify-between p-3 border rounded-2xl cursor-pointer transition-all active:scale-98 ${
      isSelected
        ? 'bg-[#171717] border-[#10B981] shadow-sm'
        : 'bg-[#111111] border-[#262626] hover:bg-[#171717] hover:border-zinc-600'
    }`}
  >
    <button
      type="button"
      onClick={e => {
        e.stopPropagation();
        onTogglePin();
      }}
      title={c.pinnedAt ? 'Unpin chat' : 'Pin chat'}
      className={`absolute top-2 right-2 p-1 rounded-full transition-opacity ${
        c.pinnedAt ? 'text-[#10B981] opacity-100' : 'text-zinc-600 opacity-0 group-hover:opacity-100 hover:text-zinc-300'
      }`}
    >
      <Pin className={`w-3.5 h-3.5 ${c.pinnedAt ? 'fill-current' : ''}`} />
    </button>

    <div className="flex items-center gap-3 min-w-0">
      <div className="relative">
        <img
          src={c.partner.avatar_url || getAvatarUrl(c.partner.uid)}
          alt={c.partner.display_name}
          className="w-11 h-11 rounded-xl bg-[#171717] border border-[#262626] object-cover"
        />
        <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-[#10B981] border-2 border-[#111111]" />
      </div>

      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <h4 className="text-sm font-bold text-white truncate leading-tight">{c.partner.display_name}</h4>
          <span className="text-[10px] font-mono text-[#10B981]">{c.partner.uid}</span>
        </div>

        <p className="text-xs text-[#A1A1AA] truncate mt-0.5 flex items-center gap-1">
          {c.lastMessage?.content.startsWith('[IMAGE]') ? (
            <>
              <ImageIcon className="w-3.5 h-3.5 text-[#10B981]" />
              <span>Encrypted photo</span>
            </>
          ) : c.lastMessage?.content.startsWith('[VOICE_NOTE') ? (
            <>
              <Mic className="w-3.5 h-3.5 text-[#10B981]" />
              <span>Voice message (0:14)</span>
            </>
          ) : c.lastMessage?.content === '[DELETED]' ? (
            <span className="italic">This message was deleted</span>
          ) : (
            c.lastMessage?.content || 'Encrypted direct channel ready'
          )}
        </p>
      </div>
    </div>

    <div className="flex flex-col items-end gap-1 text-right pl-2 pr-5">
      <span className="text-[10px] text-zinc-500 whitespace-nowrap">
        {c.lastMessage ? formatTimestamp(c.lastMessage.created_at) : ''}
      </span>
      {c.unreadCount > 0 && (
        <span className="px-2 py-0.5 bg-[#10B981] text-black font-bold text-[10px] rounded-full">
          {c.unreadCount}
        </span>
      )}
    </div>
  </div>
);

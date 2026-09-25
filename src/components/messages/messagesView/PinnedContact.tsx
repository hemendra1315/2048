import React from 'react';
import { ConversationItem } from '../../../types';
import { getAvatarUrl } from '../../../lib/utils';

interface PinnedContactProps {
  conversation: ConversationItem;
  isSelected: boolean;
  onClick: () => void;
}

export const PinnedContact: React.FC<PinnedContactProps> = ({ conversation, isSelected, onClick }) => (
  <button
    onClick={onClick}
    className={`flex flex-col items-center gap-1.5 p-2 rounded-xl border min-w-[76px] transition-all active:scale-95 ${
      isSelected ? 'bg-[#171717] border-[#10B981]' : 'bg-[#111111] border-[#262626] hover:border-[#10B981]/60'
    }`}
  >
    <div className="relative">
      <img
        src={conversation.partner.avatar_url || getAvatarUrl(conversation.partner.uid)}
        alt={conversation.partner.display_name}
        className="w-11 h-11 rounded-xl bg-[#171717] border border-[#262626] object-cover"
      />
      <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-[#10B981] border-2 border-[#111111]" />
    </div>
    <span className="text-[11px] font-semibold text-zinc-300 truncate max-w-[68px]">
      {conversation.partner.display_name.split(' ')[0]}
    </span>
  </button>
);

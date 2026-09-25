import React from 'react';
import { Info, BellOff, Trash2, Gamepad2, Flag } from 'lucide-react';

interface ChatOptionsSheetProps {
  onClose: () => void;
  onViewContact: () => void;
  onMute: () => void;
  onClearChat: () => void;
  onPlayGame: () => void;
  onReportUser: () => void;
}

export const ChatOptionsSheet: React.FC<ChatOptionsSheetProps> = ({
  onClose,
  onViewContact,
  onMute,
  onClearChat,
  onPlayGame,
  onReportUser,
}) => (
  <div className="fixed inset-0 z-50 bg-black/70 flex items-end justify-center" onClick={onClose}>
    <div
      className="bg-[#111111] border-t border-[#262626] rounded-t-2xl w-full max-w-lg p-3 space-y-1.5 animate-fade-in"
      onClick={e => e.stopPropagation()}
    >
      <button
        onClick={onViewContact}
        className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm text-white hover:bg-[#171717] transition-colors"
      >
        <Info className="w-4 h-4 text-zinc-400" />
        View contact
      </button>
      <button
        onClick={onPlayGame}
        className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm text-white hover:bg-[#171717] transition-colors"
      >
        <Gamepad2 className="w-4 h-4 text-zinc-400" />
        Play Tic-Tac-Toe
      </button>
      <button
        onClick={onMute}
        className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm text-white hover:bg-[#171717] transition-colors"
      >
        <BellOff className="w-4 h-4 text-zinc-400" />
        Mute notifications
      </button>
      <button
        onClick={onClearChat}
        className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm text-red-400 hover:bg-[#171717] transition-colors"
      >
        <Trash2 className="w-4 h-4" />
        Clear chat
      </button>
      <button
        onClick={onReportUser}
        className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm text-red-400 hover:bg-[#171717] transition-colors"
      >
        <Flag className="w-4 h-4" />
        Report user
      </button>
      <div className="pt-1.5 border-t border-[#262626]">
        <button
          onClick={onClose}
          className="w-full px-4 py-3 rounded-xl text-sm font-semibold text-zinc-300 hover:bg-[#171717] transition-colors text-center"
        >
          Cancel
        </button>
      </div>
    </div>
  </div>
);

import React from 'react';
import { Link2, Copy } from 'lucide-react';

interface AddFriendModalProps {
  onClose: () => void;
  inviteQrDataUrl: string | null;
  onCopyInviteLink: () => void;
  newChatUidInput: string;
  setNewChatUidInput: (value: string) => void;
  onSubmit: (e: React.FormEvent) => void;
}

export const AddFriendModal: React.FC<AddFriendModalProps> = ({
  onClose,
  inviteQrDataUrl,
  onCopyInviteLink,
  newChatUidInput,
  setNewChatUidInput,
  onSubmit,
}) => (
  <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
    <div className="bg-[#111111] border border-[#262626] rounded-2xl p-6 max-w-sm w-full space-y-5 animate-fade-in shadow-2xl max-h-[90vh] overflow-y-auto">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-white">Add a friend</h3>
        <button onClick={onClose} className="text-zinc-500 hover:text-white text-sm">
          ✕
        </button>
      </div>

      {/* Share my invite */}
      <div className="space-y-3 text-center">
        <p className="text-xs text-[#A1A1AA]">Share this to let someone message you</p>

        <div className="flex items-center justify-center p-3 bg-white rounded-2xl w-fit mx-auto">
          {inviteQrDataUrl ? (
            <img src={inviteQrDataUrl} alt="Your invite QR code" className="w-40 h-40" />
          ) : (
            <div className="w-40 h-40 animate-pulse bg-zinc-200 rounded-lg" />
          )}
        </div>

        <button
          onClick={onCopyInviteLink}
          className="w-full flex items-center justify-center gap-2 py-2.5 bg-[#171717] hover:bg-[#222222] border border-[#262626] rounded-xl text-white text-xs font-bold transition-all active:scale-98"
        >
          <Link2 className="w-4 h-4 text-[#10B981]" />
          <span>Copy my invite link</span>
          <Copy className="w-3.5 h-3.5 opacity-60" />
        </button>
      </div>

      <div className="flex items-center gap-3 text-zinc-600">
        <div className="flex-1 h-px bg-[#262626]" />
        <span className="text-[10px] uppercase font-mono tracking-widest">or</span>
        <div className="flex-1 h-px bg-[#262626]" />
      </div>

      {/* Have someone else's invite */}
      <form onSubmit={onSubmit} className="space-y-3">
        <p className="text-xs text-[#A1A1AA]">Paste a friend's invite link or UID</p>
        <input
          type="text"
          placeholder="Invite link or UID..."
          value={newChatUidInput}
          onChange={e => setNewChatUidInput(e.target.value)}
          className="w-full py-2.5 px-4 bg-[#171717] border border-[#262626] focus:border-[#10B981] rounded-xl text-white font-mono text-sm placeholder:text-zinc-600 focus:outline-none"
        />

        <button
          type="submit"
          className="w-full py-2.5 bg-[#10B981] hover:bg-emerald-400 active:scale-98 text-black text-xs font-bold rounded-xl shadow-lg transition-all"
        >
          Start Chat
        </button>
      </form>
    </div>
  </div>
);

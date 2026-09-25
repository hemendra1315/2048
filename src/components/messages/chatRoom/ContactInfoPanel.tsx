import React from 'react';
import { X, Lock } from 'lucide-react';
import { UserProfile } from '../../../types';
import { getAvatarUrl } from '../../../lib/utils';

interface ContactInfoPanelProps {
  partner: UserProfile;
  onClose: () => void;
}

export const ContactInfoPanel: React.FC<ContactInfoPanelProps> = ({ partner, onClose }) => (
  <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={onClose}>
    <div
      className="bg-[#111111] border border-[#262626] rounded-2xl w-full max-w-sm p-6 space-y-4 animate-fade-in"
      onClick={e => e.stopPropagation()}
    >
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-white">Contact info</h3>
        <button onClick={onClose} className="text-zinc-500 hover:text-white">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex flex-col items-center gap-2 py-2">
        <img
          src={partner.avatar_url || getAvatarUrl(partner.uid)}
          alt={partner.display_name}
          className="w-20 h-20 rounded-2xl bg-[#171717] border border-[#262626] object-cover"
        />
        <h4 className="text-base font-bold text-white">{partner.display_name}</h4>
        <p className="text-xs font-mono text-zinc-500">{partner.uid}</p>
      </div>

      <div className="flex items-start gap-3 p-3 bg-[#171717] rounded-xl">
        <Lock className="w-4 h-4 text-[#10B981] mt-0.5 shrink-0" />
        <p className="text-xs text-zinc-400">
          Messages and calls in this chat are end-to-end encrypted. Only you and {partner.display_name} can read or
          listen to them.
        </p>
      </div>
    </div>
  </div>
);

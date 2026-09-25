import React from 'react';
import { ShieldAlert, Loader2 } from 'lucide-react';
import { UserProfile } from '../../../types';

type ModalMode = 'suspend' | 'ban' | 'unban';

interface ModerationModalProps {
  currentUser: UserProfile;
  modalMode: ModalMode;
  actionReason: string;
  setActionReason: (value: string) => void;
  modSubmitting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export const ModerationModal: React.FC<ModerationModalProps> = ({
  currentUser,
  modalMode,
  actionReason,
  setActionReason,
  modSubmitting,
  onCancel,
  onConfirm,
}) => (
  <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in">
    <div className="bg-vault-900 border border-vault-700/80 rounded-3xl w-full max-w-sm p-6 flex flex-col shadow-2xl">
      <div className="flex items-center gap-2 text-rose-400 font-bold mb-1">
        <ShieldAlert className="w-5 h-5" />
        <span>Confirm Disciplinary Action</span>
      </div>
      <p className="text-xs text-vault-300 mb-4">
        Apply <strong>{modalMode.toUpperCase()}</strong> to <strong>{currentUser.display_name}</strong> (
        {currentUser.uid})
      </p>

      <label className="block text-[10px] font-bold text-vault-400 uppercase tracking-wider mb-1">
        Reason / Moderator Notes (Audited to Supabase)
      </label>
      <input
        type="text"
        value={actionReason}
        onChange={e => setActionReason(e.target.value)}
        placeholder="e.g. Policy violation or suspicious activity"
        className="w-full bg-vault-950 border border-vault-700 focus:border-amber-500 rounded-xl px-3.5 py-2 text-xs text-white placeholder-vault-600 outline-none mb-4"
      />

      <div className="flex gap-2">
        <button
          type="button"
          disabled={modSubmitting}
          onClick={onCancel}
          className="flex-1 py-2 bg-vault-800 hover:bg-vault-700 text-vault-300 rounded-xl text-xs font-bold"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={modSubmitting}
          onClick={onConfirm}
          className={`flex-1 py-2 rounded-xl text-xs font-bold shadow-md flex items-center justify-center gap-1 ${
            modalMode === 'unban'
              ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
              : 'bg-rose-600 hover:bg-rose-500 text-white'
          }`}
        >
          {modSubmitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
          <span>Confirm {modalMode.toUpperCase()}</span>
        </button>
      </div>
    </div>
  </div>
);

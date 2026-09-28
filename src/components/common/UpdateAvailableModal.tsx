import React from 'react';
import { Download, X, Sparkles } from 'lucide-react';
import type { AppUpdateNotice } from '../../lib/appUpdateApi';
import { lightImpact, mediumImpact } from '../../lib/haptics';

interface UpdateAvailableModalProps {
  notice: AppUpdateNotice;
  onDismiss: () => void;
}

/** Shown once per unlock (see App.tsx) when a newer version than the installed one has
 *  been published by an admin. Dismissing it doesn't clear the notice -- App.tsx remembers
 *  that this specific version was dismissed so it won't nag again until a newer one ships. */
export const UpdateAvailableModal: React.FC<UpdateAvailableModalProps> = ({ notice, onDismiss }) => {
  const handleUpdate = () => {
    mediumImpact();
    window.open(notice.update_url, '_blank', 'noopener,noreferrer');
  };

  return (
    <div
      className="fixed inset-0 z-[100000] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in"
      onClick={onDismiss}
    >
      <div
        className="w-full max-w-sm rounded-3xl bg-vault-950 border border-purple-700/40 shadow-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="relative p-6 pb-5 bg-gradient-to-br from-purple-950/80 via-vault-950 to-vault-950">
          <button
            type="button"
            onClick={() => {
              lightImpact();
              onDismiss();
            }}
            className="absolute top-4 right-4 p-1.5 rounded-lg text-vault-500 hover:text-vault-200 hover:bg-vault-900 transition-colors"
            aria-label="Dismiss"
          >
            <X className="w-4 h-4" />
          </button>

          <div className="w-12 h-12 rounded-2xl bg-purple-600/20 border border-purple-500/40 flex items-center justify-center text-purple-400 mb-3">
            <Sparkles className="w-6 h-6" />
          </div>
          <h2 className="text-lg font-black text-white m-0">Update Available</h2>
          <p className="text-xs text-vault-400 mt-1 m-0">
            Version {notice.latest_version} is ready to install.
          </p>
        </div>

        {notice.release_notes && (
          <div className="px-6 py-4 border-t border-vault-900">
            <p className="text-xs text-vault-300 leading-relaxed whitespace-pre-line m-0">{notice.release_notes}</p>
          </div>
        )}

        <div className="p-4 pt-3 flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              lightImpact();
              onDismiss();
            }}
            className="flex-1 py-2.5 rounded-xl bg-vault-900 hover:bg-vault-850 text-vault-300 hover:text-white border border-vault-800 text-xs font-bold transition-colors"
          >
            Later
          </button>
          <button
            type="button"
            onClick={handleUpdate}
            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white font-bold text-xs shadow-lg active:scale-95 transition-transform"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Update Now</span>
          </button>
        </div>
      </div>
    </div>
  );
};

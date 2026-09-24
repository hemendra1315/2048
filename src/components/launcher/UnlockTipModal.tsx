import React from 'react';
import { Gamepad2, Timer } from 'lucide-react';
import { useVault } from '../../context/VaultContext';

interface UnlockTipModalProps {
  onDismiss: () => void;
}

export const UnlockTipModal: React.FC<UnlockTipModalProps> = ({ onDismiss }) => {
  const { preferences } = useVault();
  const appName = preferences.custom_app_name || 'Retro Arcade';

  return (
    <div className="fixed inset-0 z-[60] bg-black/85 backdrop-blur-lg flex items-center justify-center p-4 animate-fade-in">
      <div className="bg-vault-900 border border-vault-700/80 rounded-3xl w-full max-w-xs p-6 flex flex-col items-center text-center shadow-2xl">
        <div className="w-16 h-16 rounded-2xl bg-vault-800/80 border border-vault-700/60 flex items-center justify-center text-arcade-gold mb-4 shadow-inner relative">
          <Gamepad2 className="w-8 h-8" />
          <div className="absolute -bottom-1.5 -right-1.5 w-7 h-7 rounded-full bg-emerald-950 border border-emerald-500/60 flex items-center justify-center">
            <Timer className="w-3.5 h-3.5 text-emerald-400" />
          </div>
        </div>

        <h3 className="text-base font-bold text-white mb-1.5">One thing to remember</h3>
        <p className="text-xs text-vault-400 leading-relaxed mb-5">
          Your app looks like <span className="text-white font-semibold">{appName}</span> to anyone else.
          To get back in next time, just hold the title at the top of that screen for about a second.
        </p>

        <button
          onClick={onDismiss}
          className="w-full bg-arcade-gold hover:bg-amber-400 active:scale-95 text-vault-950 font-bold py-2.5 rounded-xl text-sm transition-all shadow-md shadow-amber-500/20"
        >
          Got it
        </button>
      </div>
    </div>
  );
};

import React from 'react';
import { Lock } from 'lucide-react';
import { useVault } from '../../context/VaultContext';

export const PanicButton: React.FC = () => {
  const { panicLock } = useVault();

  return (
    <button
      onClick={panicLock}
      className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-950/80 hover:bg-rose-900 active:scale-95 text-rose-300 hover:text-rose-100 border border-rose-600/50 rounded-full shadow-lg shadow-rose-950/50 text-xs font-bold transition-all"
      title="Panic Lock: Instant cover mode"
    >
      <Lock className="w-3.5 h-3.5" />
      <span>LOCK</span>
    </button>
  );
};

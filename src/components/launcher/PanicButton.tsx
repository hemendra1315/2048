import React from 'react';
import { Lock } from 'lucide-react';
import { useVault } from '../../context/VaultContext';

/** Locks the app immediately and returns to the game screen. */
export const PanicButton: React.FC = () => {
  const { panicLock } = useVault();

  return (
    <button type="button" onClick={panicLock} className="btn btn-s btn-sm" title="Lock now" aria-label="Lock now">
      <Lock className="i i-sm" aria-hidden />
      <span>Lock</span>
    </button>
  );
};

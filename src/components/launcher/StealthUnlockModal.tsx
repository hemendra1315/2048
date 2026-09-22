import React, { useState, useEffect } from 'react';
import { Lock, X, Delete, ArrowRight, ShieldCheck } from 'lucide-react';
import { useVault } from '../../context/VaultContext';

export const StealthUnlockModal: React.FC = () => {
  const { unlockModalOpen, closeUnlockModal, verifyAndUnlock } = useVault();
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorShake, setErrorShake] = useState(false);

  useEffect(() => {
    if (unlockModalOpen) {
      setPin('');
      setErrorShake(false);
    }
  }, [unlockModalOpen]);

  if (!unlockModalOpen) return null;

  const handleKeyPress = (num: string) => {
    if (pin.length < 8) {
      setPin(prev => prev + num);
    }
  };

  const handleDelete = () => {
    setPin(prev => prev.slice(0, -1));
  };

  const handleVerify = async () => {
    if (!pin) return;
    setLoading(true);
    const success = await verifyAndUnlock(pin);
    setLoading(false);
    if (!success) {
      setErrorShake(true);
      setTimeout(() => setErrorShake(false), 500);
      setPin('');
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-lg flex items-center justify-center p-4 animate-fade-in">
      <div
        className={`bg-vault-900 border border-vault-700/80 rounded-3xl w-full max-w-xs p-6 flex flex-col items-center shadow-2xl relative transition-transform ${
          errorShake ? 'translate-x-2' : ''
        }`}
      >
        <button
          onClick={closeUnlockModal}
          className="absolute top-4 right-4 p-1 rounded-full text-vault-400 hover:text-white hover:bg-vault-800 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Security Shield Icon */}
        <div className="w-14 h-14 rounded-2xl bg-vault-800/80 border border-vault-700/60 flex items-center justify-center text-arcade-gold mb-3 shadow-inner">
          <ShieldCheck className="w-7 h-7" />
        </div>

        <h3 className="text-base font-bold text-white mb-0.5">Security Clearance</h3>
        <p className="text-xs text-vault-400 mb-5 text-center">
          Enter Vault Security PIN (Default: 2048)
        </p>

        {/* PIN Dots Indicator */}
        <div className="flex gap-3 mb-6">
          {[0, 1, 2, 3].map(idx => (
            <div
              key={idx}
              className={`w-3.5 h-3.5 rounded-full border-2 transition-all ${
                pin.length > idx
                  ? 'bg-arcade-gold border-arcade-gold scale-110 shadow-sm shadow-arcade-gold/50'
                  : 'border-vault-700 bg-vault-950'
              }`}
            />
          ))}
        </div>

        {/* Keypad */}
        <div className="grid grid-cols-3 gap-2.5 w-full max-w-[240px] mb-4">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(n => (
            <button
              key={n}
              onClick={() => handleKeyPress(n)}
              className="w-full aspect-square rounded-2xl bg-vault-950/80 hover:bg-vault-800 active:bg-vault-700 active:scale-95 text-lg font-bold text-vault-100 border border-vault-800 transition-all flex items-center justify-center shadow-sm"
            >
              {n}
            </button>
          ))}
          <button
            onClick={handleDelete}
            className="w-full aspect-square rounded-2xl bg-vault-950/80 hover:bg-vault-800 active:scale-95 text-vault-400 flex items-center justify-center border border-vault-800 transition-all"
          >
            <Delete className="w-5 h-5" />
          </button>
          <button
            onClick={() => handleKeyPress('0')}
            className="w-full aspect-square rounded-2xl bg-vault-950/80 hover:bg-vault-800 active:bg-vault-700 active:scale-95 text-lg font-bold text-vault-100 border border-vault-800 transition-all flex items-center justify-center shadow-sm"
          >
            0
          </button>
          <button
            onClick={handleVerify}
            disabled={loading || pin.length === 0}
            className="w-full aspect-square rounded-2xl bg-arcade-gold hover:bg-amber-400 disabled:opacity-40 active:scale-95 text-vault-950 flex items-center justify-center font-bold transition-all shadow-md shadow-amber-500/20"
          >
            {loading ? <Lock className="w-5 h-5 animate-spin" /> : <ArrowRight className="w-5 h-5 stroke-[2.5]" />}
          </button>
        </div>
      </div>
    </div>
  );
};

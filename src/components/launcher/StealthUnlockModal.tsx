import React, { useState, useEffect, useRef } from 'react';
import { Lock, X, ArrowRight, ShieldCheck, Eye, EyeOff } from 'lucide-react';
import { useVault } from '../../context/VaultContext';
import { useAuth } from '../../context/AuthContext';

export const StealthUnlockModal: React.FC = () => {
  const { unlockModalOpen, closeUnlockModal, verifyAndUnlock } = useVault();
  const { user } = useAuth();
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorShake, setErrorShake] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (unlockModalOpen) {
      setPassword('');
      setShowPassword(false);
      setErrorShake(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [unlockModalOpen]);

  if (!unlockModalOpen) return null;

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password || loading) return;
    setLoading(true);
    const success = await verifyAndUnlock(password);
    setLoading(false);
    if (!success) {
      setErrorShake(true);
      setTimeout(() => setErrorShake(false), 500);
      setPassword('');
      inputRef.current?.focus();
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-lg flex items-center justify-center p-4 animate-fade-in">
      <form
        onSubmit={handleVerify}
        className={`bg-vault-900 border border-vault-700/80 rounded-3xl w-full max-w-xs p-6 flex flex-col items-center shadow-2xl relative transition-transform ${
          errorShake ? 'translate-x-2' : ''
        }`}
      >
        <button
          type="button"
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
          {user ? 'Enter your vault password' : 'Enter vault password (Default: 2048)'}
        </p>

        {/* Password Field */}
        <div className="relative w-full mb-4">
          <Lock className="w-4 h-4 text-vault-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            ref={inputRef}
            type={showPassword ? 'text' : 'password'}
            autoComplete="current-password"
            maxLength={72}
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="Password"
            className="w-full bg-vault-950 border border-vault-700 focus:border-arcade-gold rounded-xl pl-10 pr-10 py-2.5 text-sm text-white placeholder-vault-600 outline-none transition-colors"
          />
          <button
            type="button"
            onClick={() => setShowPassword(s => !s)}
            aria-label={showPassword ? 'Hide password' : 'Show password'}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-vault-500 hover:text-vault-200 transition-colors"
          >
            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>

        <button
          type="submit"
          disabled={loading || password.length === 0}
          className="w-full bg-arcade-gold hover:bg-amber-400 disabled:opacity-40 active:scale-95 text-vault-950 font-bold py-2.5 rounded-xl text-sm flex items-center justify-center gap-2 transition-all shadow-md shadow-amber-500/20"
        >
          {loading ? <Lock className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4 stroke-[2.5]" />}
          <span>Unlock</span>
        </button>
      </form>
    </div>
  );
};

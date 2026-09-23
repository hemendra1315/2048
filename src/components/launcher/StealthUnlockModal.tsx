import React, { useState, useEffect, useRef } from 'react';
import { Lock, X, Eye, EyeOff, RotateCcw } from 'lucide-react';
import { useVault } from '../../context/VaultContext';
import { useAuth } from '../../context/AuthContext';

export const StealthUnlockModal: React.FC = () => {
  const { unlockModalOpen, closeUnlockModal, verifyAndUnlock, proceedToSignIn } = useVault();
  const { user } = useAuth();
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorShake, setErrorShake] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!unlockModalOpen) return;
    // Signed out: there is nothing to unlock, so go straight to the sign-in screen.
    if (!user) {
      proceedToSignIn();
      return;
    }
    setPassword('');
    setShowPassword(false);
    setErrorShake(false);
    const t = window.setTimeout(() => inputRef.current?.focus(), 50);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeUnlockModal();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener('keydown', onKey);
    };
  }, [unlockModalOpen, user, proceedToSignIn, closeUnlockModal]);

  if (!unlockModalOpen || !user) return null;

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
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/70" onClick={closeUnlockModal} aria-hidden="true" />
      <form
        onSubmit={handleVerify}
        role="dialog"
        aria-modal="true"
        aria-labelledby="unlock-title"
        className={`sheet anim-sheet absolute left-0 right-0 bottom-0 mx-auto max-w-md px-5 pt-2.5 pb-7 flex flex-col gap-4 transition-transform ${
          errorShake ? 'translate-x-2' : ''
        }`}
      >
        <div className="w-9 h-1 rounded-full bg-vault-700 self-center" aria-hidden="true" />
        <div className="flex items-center justify-between">
          <h2 id="unlock-title" className="t-h2 m-0">Enter password</h2>
          <button type="button" className="ib" aria-label="Close" onClick={closeUnlockModal}>
            <X className="i" aria-hidden />
          </button>
        </div>
        <label className="field">
          <span className="lab">Password</span>
          <span className="inp">
            <Lock className="i i-sm c3" aria-hidden />
            <input
              ref={inputRef}
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              maxLength={72}
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Password"
              className="flex-1 min-w-0 bg-transparent border-0 outline-none text-vault-50 text-base"
            />
            <button
              type="button"
              onClick={() => setShowPassword(v => !v)}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              className="ib -mr-3"
            >
              {showPassword ? <EyeOff className="i" aria-hidden /> : <Eye className="i" aria-hidden />}
            </button>
          </span>
        </label>
        <button type="submit" disabled={loading || password.length === 0} className="btn btn-p btn-block" aria-busy={loading}>
          {loading ? <RotateCcw className="i i-sm animate-spin" aria-hidden /> : null}
          {loading ? 'Checking…' : 'Unlock'}
        </button>
      </form>
    </div>
  );
};

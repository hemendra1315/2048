import React, { useState, useEffect, useRef } from 'react';
import { Lock, X, ArrowRight, ShieldCheck, Fingerprint } from 'lucide-react';
import { useVault } from '../../context/VaultContext';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { BiometricService } from '../../lib/biometrics';

export const StealthUnlockModal: React.FC = () => {
  const { unlockModalOpen, closeUnlockModal, verifyAndUnlock, unlockWithBiometric } = useVault();
  const { user } = useAuth();
  const { showToast } = useToast();
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [biometricLoading, setBiometricLoading] = useState(false);
  const [errorShake, setErrorShake] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (unlockModalOpen) {
      setPassword('');
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

  const handleBiometricUnlock = async () => {
    setBiometricLoading(true);
    try {
      const avail = await BiometricService.isAvailable();
      if (!avail.available) {
        showToast('Biometric hardware not detected. Enter your PIN.', 'info');
        return;
      }
      // unlockWithBiometric runs a real, server-verified WebAuthn ceremony - it only
      // unlocks on a signature match against the enrolled credential, never on
      // hardware presence alone.
      await unlockWithBiometric();
    } catch {
      showToast('Biometrics unavailable. Enter your PIN.', 'info');
    } finally {
      setBiometricLoading(false);
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

        <h3 className="text-base font-bold text-white mb-0.5">Enter your PIN</h3>
        <p className="text-xs text-vault-400 mb-5 text-center">
          {user ? 'Unlock to continue' : 'Default PIN: 2048'}
        </p>

        {/* PIN Field */}
        <div className="relative w-full mb-4">
          <Lock className="w-4 h-4 text-vault-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            ref={inputRef}
            type="password"
            inputMode="numeric"
            autoComplete="current-password"
            maxLength={8}
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="PIN"
            className="w-full bg-vault-950 border border-vault-700 focus:border-arcade-gold rounded-xl pl-10 pr-4 py-2.5 text-sm text-white text-center tracking-[0.4em] placeholder-vault-600 placeholder:tracking-normal outline-none transition-colors"
          />
        </div>

        <button
          type="submit"
          disabled={loading || password.length === 0}
          className="w-full bg-arcade-gold hover:bg-amber-400 disabled:opacity-40 active:scale-95 text-vault-950 font-bold py-2.5 rounded-xl text-sm flex items-center justify-center gap-2 transition-all shadow-md shadow-amber-500/20"
        >
          {loading ? <Lock className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4 stroke-[2.5]" />}
          <span>Unlock</span>
        </button>

        {user?.biometric_enabled && (
          <button
            type="button"
            onClick={handleBiometricUnlock}
            disabled={biometricLoading}
            className="w-full mt-2.5 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold text-vault-200 bg-vault-800/80 hover:bg-vault-700 active:scale-95 disabled:opacity-40 transition-all"
          >
            <Fingerprint className="w-4 h-4 text-emerald-400" />
            <span>{biometricLoading ? 'Scanning...' : 'Use fingerprint instead'}</span>
          </button>
        )}
      </form>
    </div>
  );
};

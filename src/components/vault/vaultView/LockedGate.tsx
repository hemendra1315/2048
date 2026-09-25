import React from 'react';
import { ArrowLeft, Lock, ShieldCheck, Fingerprint, KeyRound, FolderLock } from 'lucide-react';

interface LockedGateProps {
  onClose?: () => void;
  isAuthenticating: boolean;
  onUnlockWithBiometrics: () => void;
  pinInput: string;
  setPinInput: (value: string) => void;
  pinError: boolean;
  setPinError: (value: boolean) => void;
  onPinSubmit: (e: React.FormEvent) => void;
}

export const LockedGate: React.FC<LockedGateProps> = ({
  onClose,
  isAuthenticating,
  onUnlockWithBiometrics,
  pinInput,
  setPinInput,
  pinError,
  setPinError,
  onPinSubmit,
}) => (
  <div className="relative flex flex-col items-center justify-center min-h-[540px] p-6 bg-[#0A0A0A] border border-[#262626] rounded-2xl animate-fade-in text-center select-none">
    {onClose && (
      <button
        onClick={onClose}
        className="absolute top-4 left-4 p-1.5 rounded-xl bg-[#171717] hover:bg-[#222222] text-zinc-300 hover:text-white transition-colors"
      >
        <ArrowLeft className="w-5 h-5" />
      </button>
    )}
    <div className="w-20 h-20 rounded-3xl bg-[#111111] border border-[#262626] flex items-center justify-center text-[#10B981] mb-6 shadow-2xl relative">
      <Lock className="w-10 h-10" />
      <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-emerald-950 border border-[#10B981] flex items-center justify-center">
        <ShieldCheck className="w-3 h-3 text-[#10B981]" />
      </div>
    </div>

    <h2 className="text-xl font-bold text-white tracking-tight">Private Vault</h2>
    <p className="text-xs text-[#A1A1AA] max-w-sm mt-2 mb-6">
      Enter your PIN or use your fingerprint to view what's inside.
    </p>

    {/* Biometric Trigger */}
    <button
      onClick={onUnlockWithBiometrics}
      disabled={isAuthenticating}
      className="w-full max-w-xs flex items-center justify-center gap-2.5 py-3.5 px-4 bg-[#171717] hover:bg-[#222222] active:scale-98 border border-[#262626] rounded-xl text-white text-sm font-semibold transition-all mb-4 shadow-lg"
    >
      <Fingerprint className="w-5 h-5 text-[#10B981]" />
      <span>{isAuthenticating ? 'Scanning...' : 'Unlock with Biometrics'}</span>
    </button>

    <div className="flex items-center gap-3 w-full max-w-xs my-2 text-zinc-600">
      <div className="flex-1 h-px bg-[#262626]" />
      <span className="text-[10px] uppercase font-mono tracking-widest text-[#A1A1AA]">or PIN</span>
      <div className="flex-1 h-px bg-[#262626]" />
    </div>

    {/* PIN Form */}
    <form onSubmit={onPinSubmit} className="w-full max-w-xs space-y-3">
      <div className="relative">
        <input
          type="password"
          inputMode="numeric"
          maxLength={8}
          placeholder="Enter PIN (Default: 2048)"
          value={pinInput}
          onChange={e => {
            setPinInput(e.target.value);
            setPinError(false);
          }}
          className={`w-full py-3 px-4 bg-[#111111] border ${
            pinError ? 'border-red-500 text-red-300' : 'border-[#262626] text-white focus:border-[#10B981]'
          } rounded-xl text-center text-sm font-mono tracking-widest placeholder:text-zinc-600 placeholder:tracking-normal focus:outline-none transition-all`}
        />
        <KeyRound className="w-4 h-4 text-zinc-500 absolute left-3.5 top-3.5 pointer-events-none" />
      </div>

      <button
        type="submit"
        className="w-full py-3 bg-[#10B981] hover:bg-emerald-400 active:scale-98 text-black text-sm font-bold rounded-xl shadow-lg transition-all"
      >
        Unlock
      </button>
    </form>

    <div className="mt-8 flex items-center gap-2 text-[11px] text-zinc-500">
      <FolderLock className="w-3.5 h-3.5 text-[#10B981]" />
      <span>Hidden from Photos and the rest of the app</span>
    </div>
  </div>
);

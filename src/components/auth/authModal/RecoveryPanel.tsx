import React from 'react';
import { RefreshCw, KeyRound, ArrowLeft, Eye, EyeOff } from 'lucide-react';

interface RecoveryPanelProps {
  recoveryIdent: string;
  setRecoveryIdent: (value: string) => void;
  recoveryCodeInput: string;
  setRecoveryCodeInput: (value: string) => void;
  recoveryNewPassword: string;
  setRecoveryNewPassword: (value: string) => void;
  showPassword: boolean;
  toggleShowPassword: () => void;
  loading: boolean;
  onSubmit: (e: React.FormEvent) => void;
  onBackToLogin: () => void;
}

export const RecoveryPanel: React.FC<RecoveryPanelProps> = ({
  recoveryIdent,
  setRecoveryIdent,
  recoveryCodeInput,
  setRecoveryCodeInput,
  recoveryNewPassword,
  setRecoveryNewPassword,
  showPassword,
  toggleShowPassword,
  loading,
  onSubmit,
  onBackToLogin,
}) => (
  <div>
    <div className="flex flex-col items-center text-center mb-5">
      <div className="w-12 h-12 rounded-2xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-arcade-gold mb-2">
        <RefreshCw className="w-6 h-6" />
      </div>
      <h3 className="text-lg font-bold text-white">Reset Vault Password</h3>
      <p className="text-xs text-vault-400 mt-1">Enter your Recovery Key to set a new password</p>
    </div>

    <form onSubmit={onSubmit} className="space-y-3.5">
      <div>
        <label className="block text-[11px] font-semibold text-vault-300 uppercase tracking-wider mb-1">
          Username or UID
        </label>
        <input
          type="text"
          required
          value={recoveryIdent}
          onChange={e => setRecoveryIdent(e.target.value)}
          placeholder="e.g. alex or CIPHER-4921"
          className="w-full bg-vault-950 border border-vault-700 focus:border-arcade-gold rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-vault-600 outline-none"
        />
      </div>

      <div>
        <label className="block text-[11px] font-semibold text-vault-300 uppercase tracking-wider mb-1">
          Recovery Key
        </label>
        <input
          type="text"
          required
          value={recoveryCodeInput}
          onChange={e => setRecoveryCodeInput(e.target.value.toUpperCase())}
          placeholder="RC-XXXX-XXXX-XXXX"
          className="w-full bg-vault-950 border border-vault-700 focus:border-arcade-gold rounded-xl px-3.5 py-2.5 text-sm text-white font-mono placeholder-vault-600 outline-none"
        />
      </div>

      <div>
        <label className="block text-[11px] font-semibold text-vault-300 uppercase tracking-wider mb-1">
          New Password (min 8 characters)
        </label>
        <div className="relative">
          <input
            type={showPassword ? 'text' : 'password'}
            maxLength={72}
            required
            autoComplete="new-password"
            value={recoveryNewPassword}
            onChange={e => setRecoveryNewPassword(e.target.value)}
            placeholder="••••••••"
            className="w-full bg-vault-950 border border-vault-700 focus:border-arcade-gold rounded-xl pl-3.5 pr-10 py-2.5 text-sm text-white outline-none"
          />
          <button
            type="button"
            onClick={toggleShowPassword}
            aria-label={showPassword ? 'Hide password' : 'Show password'}
            className="absolute right-3.5 top-1/2 -translate-y-1/2 text-vault-500 hover:text-vault-200 transition-colors"
          >
            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
      </div>

      <button
        type="submit"
        disabled={loading}
        className="w-full bg-arcade-gold hover:bg-amber-400 active:scale-95 disabled:opacity-50 text-vault-950 font-bold py-3 rounded-xl shadow-lg shadow-amber-500/20 text-sm transition-all flex items-center justify-center gap-2 mt-2"
      >
        <KeyRound className="w-4 h-4" />
        <span>Reset Password & Unlock</span>
      </button>
    </form>

    <div className="mt-5 pt-4 border-t border-vault-800 text-center">
      <button
        type="button"
        onClick={onBackToLogin}
        className="text-xs text-vault-400 hover:text-arcade-gold transition-colors inline-flex items-center gap-1"
      >
        <ArrowLeft className="w-3 h-3" /> Back to Sign In
      </button>
    </div>
  </div>
);

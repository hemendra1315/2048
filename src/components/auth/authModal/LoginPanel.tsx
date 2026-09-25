import React from 'react';
import { Shield, Fingerprint, Lock, User, KeyRound, HelpCircle, Eye, EyeOff, Sparkles, ShieldAlert } from 'lucide-react';

interface LoginPanelProps {
  identifier: string;
  setIdentifier: (value: string) => void;
  password: string;
  setPassword: (value: string) => void;
  showPassword: boolean;
  toggleShowPassword: () => void;
  loading: boolean;
  isBiometricsSupported: boolean;
  showDemoAccounts: boolean;
  onSubmit: (e: React.FormEvent) => void;
  onBiometricAuth: () => void;
  onQuickDemo: (role: 'user' | 'admin' | 'friend') => void;
  onForgotPassword: () => void;
  onCreateAccount: () => void;
  onPanicLock: () => void;
}

export const LoginPanel: React.FC<LoginPanelProps> = ({
  identifier,
  setIdentifier,
  password,
  setPassword,
  showPassword,
  toggleShowPassword,
  loading,
  isBiometricsSupported,
  showDemoAccounts,
  onSubmit,
  onBiometricAuth,
  onQuickDemo,
  onForgotPassword,
  onCreateAccount,
  onPanicLock,
}) => (
  <div>
    {/* Header */}
    <div className="flex flex-col items-center text-center mb-6">
      <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-arcade-gold to-amber-600 flex items-center justify-center text-vault-950 font-bold shadow-lg shadow-amber-500/20 mb-3">
        <Shield className="w-7 h-7" />
      </div>
      <h2 className="text-xl font-bold text-white tracking-tight">Vault Access Gate</h2>
      <p className="text-xs text-vault-400 mt-1">Authenticate via Biometrics or Password</p>
    </div>

    {/* Biometric Quick Trigger (if supported) */}
    {isBiometricsSupported && (
      <div className="mb-5">
        <button
          type="button"
          onClick={onBiometricAuth}
          disabled={loading}
          className="w-full bg-vault-800/90 hover:bg-vault-750 border border-arcade-gold/40 hover:border-arcade-gold p-3.5 rounded-2xl flex items-center justify-center gap-3 text-vault-100 transition-all active:scale-98 group shadow-md"
        >
          <div className="w-9 h-9 rounded-xl bg-arcade-gold/20 flex items-center justify-center text-arcade-gold group-hover:scale-110 transition-transform">
            <Fingerprint className="w-5 h-5 animate-pulse" />
          </div>
          <div className="text-left">
            <div className="text-xs font-bold text-white">Unlock with Fingerprint</div>
            <div className="text-[10px] text-vault-400">Touch sensor to access Vault</div>
          </div>
        </button>
      </div>
    )}

    {/* Quick Demo Switcher (local development with the mock backend only) */}
    {showDemoAccounts && (
      <div className="bg-vault-950/80 border border-vault-800 rounded-2xl p-2.5 mb-5 text-center">
        <div className="text-[10px] font-bold text-arcade-gold uppercase tracking-wider mb-2 flex items-center justify-center gap-1">
          <Sparkles className="w-3 h-3" /> Quick Switch Identity
        </div>
        <div className="grid grid-cols-3 gap-1.5">
          <button
            type="button"
            onClick={() => onQuickDemo('user')}
            className="py-1.5 px-2 bg-vault-800 hover:bg-vault-700 text-xs font-semibold rounded-xl text-vault-200 border border-vault-700 active:scale-95 transition-all"
          >
            @alex
          </button>
          <button
            type="button"
            onClick={() => onQuickDemo('friend')}
            className="py-1.5 px-2 bg-vault-800 hover:bg-vault-700 text-xs font-semibold rounded-xl text-vault-200 border border-vault-700 active:scale-95 transition-all"
          >
            @elena
          </button>
          <button
            type="button"
            onClick={() => onQuickDemo('admin')}
            className="py-1.5 px-2 bg-amber-950/80 hover:bg-amber-900 text-xs font-bold rounded-xl text-amber-300 border border-amber-600/50 active:scale-95 transition-all flex items-center justify-center gap-1"
          >
            <ShieldAlert className="w-3 h-3" /> Admin
          </button>
        </div>
      </div>
    )}

    {/* Password Login Form */}
    <form onSubmit={onSubmit} className="space-y-3.5">
      <div>
        <label className="block text-[11px] font-semibold text-vault-300 uppercase tracking-wider mb-1">
          Username or UID
        </label>
        <div className="relative">
          <User className="w-4 h-4 text-vault-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            required
            value={identifier}
            onChange={e => setIdentifier(e.target.value)}
            placeholder="e.g. alex or CIPHER-4921"
            className="w-full bg-vault-950 border border-vault-700 focus:border-arcade-gold rounded-xl pl-10 pr-3.5 py-2.5 text-sm text-white placeholder-vault-600 outline-none transition-colors"
          />
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="text-[11px] font-semibold text-vault-300 uppercase tracking-wider">Password</label>
          <button
            type="button"
            onClick={onForgotPassword}
            className="text-[11px] text-arcade-gold hover:underline flex items-center gap-1"
          >
            <HelpCircle className="w-3 h-3" /> Forgot password?
          </button>
        </div>
        <div className="relative">
          <KeyRound className="w-4 h-4 text-vault-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type={showPassword ? 'text' : 'password'}
            maxLength={72}
            required
            autoComplete="current-password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="••••••••"
            className="w-full bg-vault-950 border border-vault-700 focus:border-arcade-gold rounded-xl pl-10 pr-10 py-2.5 text-sm text-white placeholder-vault-600 outline-none transition-colors"
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
        <Lock className="w-4 h-4" />
        <span>Authorize & Enter Vault</span>
      </button>
    </form>

    {/* Toggle & Panic Exit */}
    <div className="mt-5 flex flex-col items-center gap-3 pt-4 border-t border-vault-800">
      <button
        type="button"
        onClick={onCreateAccount}
        className="text-xs text-vault-400 hover:text-arcade-gold transition-colors"
      >
        First time here? <span className="text-arcade-gold font-semibold">Create Frictionless Account</span>
      </button>

      <button
        type="button"
        onClick={onPanicLock}
        className="text-[11px] text-rose-400/80 hover:text-rose-300 flex items-center gap-1 transition-colors"
      >
        <Lock className="w-3 h-3" /> Return to Cover Game
      </button>
    </div>
  </div>
);

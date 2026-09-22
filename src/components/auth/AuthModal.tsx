import React, { useState } from 'react';
import { Shield, UserPlus, LogIn, Lock, Mail, User, Sparkles, ShieldAlert } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useVault } from '../../context/VaultContext';

export const AuthModal: React.FC = () => {
  const { login, register, loading } = useAuth();
  const { panicLock } = useVault();
  const [isRegister, setIsRegister] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isRegister) {
      if (!displayName.trim()) return;
      await register(displayName, email, password);
    } else {
      if (!email.trim()) return;
      await login(email, password);
    }
  };

  const handleQuickDemo = async (role: 'user' | 'admin' | 'friend') => {
    if (role === 'admin') {
      await login('admin@vault.app');
    } else if (role === 'friend') {
      await login('elena@vault.app');
    } else {
      await login('user@vault.app');
    }
  };

  return (
    <div className="min-h-screen bg-vault-950 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-sm bg-vault-900 border border-vault-700/80 rounded-3xl p-6 shadow-2xl relative">
        {/* Header */}
        <div className="flex flex-col items-center text-center mb-6">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-arcade-gold to-amber-600 flex items-center justify-center text-vault-950 font-bold shadow-lg shadow-amber-500/20 mb-3">
            <Shield className="w-7 h-7" />
          </div>
          <h2 className="text-xl font-bold text-white tracking-tight">
            {isRegister ? 'Create Vault Identity' : 'Vault Access Gate'}
          </h2>
          <p className="text-xs text-vault-400 mt-1">
            {isRegister
              ? 'Receive an encrypted human-readable UID'
              : 'Sign in to access private social matrix'}
          </p>
        </div>

        {/* Quick Demo Credentials Bar */}
        <div className="bg-vault-950/80 border border-vault-800 rounded-2xl p-2.5 mb-5 text-center">
          <div className="text-[10px] font-bold text-arcade-gold uppercase tracking-wider mb-2 flex items-center justify-center gap-1">
            <Sparkles className="w-3 h-3" /> Quick Switch Identity
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            <button
              type="button"
              onClick={() => handleQuickDemo('user')}
              className="py-1.5 px-2 bg-vault-800 hover:bg-vault-700 text-xs font-semibold rounded-xl text-vault-200 border border-vault-700 active:scale-95 transition-all"
            >
              Demo User
            </button>
            <button
              type="button"
              onClick={() => handleQuickDemo('friend')}
              className="py-1.5 px-2 bg-vault-800 hover:bg-vault-700 text-xs font-semibold rounded-xl text-vault-200 border border-vault-700 active:scale-95 transition-all"
            >
              Elena
            </button>
            <button
              type="button"
              onClick={() => handleQuickDemo('admin')}
              className="py-1.5 px-2 bg-amber-950/80 hover:bg-amber-900 text-xs font-bold rounded-xl text-amber-300 border border-amber-600/50 active:scale-95 transition-all flex items-center justify-center gap-1"
            >
              <ShieldAlert className="w-3 h-3" /> Admin
            </button>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-3.5">
          {isRegister && (
            <div>
              <label className="block text-[11px] font-semibold text-vault-300 uppercase tracking-wider mb-1">
                Display Name
              </label>
              <div className="relative">
                <User className="w-4 h-4 text-vault-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  required
                  value={displayName}
                  onChange={e => setDisplayName(e.target.value)}
                  placeholder="e.g. Cipher One"
                  className="w-full bg-vault-950 border border-vault-700 focus:border-arcade-gold rounded-xl pl-10 pr-3.5 py-2.5 text-sm text-white placeholder-vault-600 outline-none transition-colors"
                />
              </div>
            </div>
          )}

          <div>
            <label className="block text-[11px] font-semibold text-vault-300 uppercase tracking-wider mb-1">
              Email
            </label>
            <div className="relative">
              <Mail className="w-4 h-4 text-vault-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="email"
                required
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="user@vault.app"
                className="w-full bg-vault-950 border border-vault-700 focus:border-arcade-gold rounded-xl pl-10 pr-3.5 py-2.5 text-sm text-white placeholder-vault-600 outline-none transition-colors"
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-vault-300 uppercase tracking-wider mb-1">
              Password
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-vault-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="password"
                required
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-vault-950 border border-vault-700 focus:border-arcade-gold rounded-xl pl-10 pr-3.5 py-2.5 text-sm text-white placeholder-vault-600 outline-none transition-colors"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-arcade-gold hover:bg-amber-400 active:scale-95 disabled:opacity-50 text-vault-950 font-bold py-3 rounded-xl shadow-lg shadow-amber-500/20 text-sm transition-all flex items-center justify-center gap-2 mt-2"
          >
            {isRegister ? <UserPlus className="w-4 h-4" /> : <LogIn className="w-4 h-4" />}
            <span>{isRegister ? 'Generate UID & Join' : 'Authorize Entrance'}</span>
          </button>
        </form>

        {/* Toggle & Panic Exit */}
        <div className="mt-5 flex flex-col items-center gap-3 pt-4 border-t border-vault-800">
          <button
            type="button"
            onClick={() => setIsRegister(!isRegister)}
            className="text-xs text-vault-400 hover:text-arcade-gold transition-colors"
          >
            {isRegister ? 'Already have a Vault UID? Sign In' : "Don't have an identity? Register here"}
          </button>

          <button
            type="button"
            onClick={panicLock}
            className="text-[11px] text-rose-400/80 hover:text-rose-300 flex items-center gap-1 transition-colors"
          >
            <Lock className="w-3 h-3" /> Return to Cover Game
          </button>
        </div>
      </div>
    </div>
  );
};

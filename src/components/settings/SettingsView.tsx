import React, { useState } from 'react';
import { Gamepad2, Shield, KeyRound, LogOut, Check, Lock, Palette } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useVault } from '../../context/VaultContext';
import { useGame, COVER_GAMES } from '../../context/GameContext';
import { useToast } from '../../context/ToastContext';
import { CoverGameType } from '../../types';

export const SettingsView: React.FC = () => {
  const { user, logout, isSuperAdmin, updateProfile } = useAuth();
  const { preferences, updatePreferences, updateSecret, panicLock } = useVault();
  const { currentGame, setCurrentGame } = useGame();
  const { showToast } = useToast();

  const [appName, setAppName] = useState(preferences.custom_app_name || 'Retro Arcade');
  const [oldPin, setOldPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [pinUpdating, setPinUpdating] = useState(false);

  const handleSaveAppName = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!appName.trim()) return;
    await updatePreferences({ custom_app_name: appName.trim() });
  };

  const handleUpdatePin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPin.length < 4) {
      showToast('PIN must be at least 4 digits', 'error');
      return;
    }
    if (newPin !== confirmPin) {
      showToast('New PINs do not match', 'error');
      return;
    }

    setPinUpdating(true);
    try {
      await updateSecret(oldPin, newPin);
      setOldPin('');
      setNewPin('');
      setConfirmPin('');
    } catch {
      // Error toast already triggered in context
    } finally {
      setPinUpdating(false);
    }
  };

  return (
    <div className="space-y-4 pb-24 animate-fade-in">
      {/* Header */}
      <div>
        <h2 className="text-base font-bold text-white">App Customization & Security</h2>
        <p className="text-xs text-vault-400">Configure disguise layer & access parameters</p>
      </div>

      {/* 1. App Name Disguise */}
      <div className="bg-vault-900 border border-vault-800 rounded-3xl p-5 shadow-sm space-y-3">
        <div className="flex items-center gap-2">
          <Gamepad2 className="w-5 h-5 text-arcade-gold" />
          <h3 className="text-sm font-bold text-white">Launcher Disguise Name</h3>
        </div>
        <p className="text-xs text-vault-400">
          This title appears on the cover screen to camouflage the social vault.
        </p>

        <form onSubmit={handleSaveAppName} className="flex gap-2">
          <input
            type="text"
            value={appName}
            onChange={e => setAppName(e.target.value)}
            placeholder="e.g. Retro Arcade, Math Brain..."
            className="flex-1 bg-vault-950 border border-vault-700 focus:border-arcade-gold rounded-xl px-3.5 py-2 text-xs text-white placeholder-vault-600 outline-none transition-colors"
          />
          <button
            type="submit"
            className="bg-arcade-gold hover:bg-amber-400 active:scale-95 text-vault-950 font-bold px-4 py-2 rounded-xl text-xs flex items-center gap-1 shadow-sm transition-all"
          >
            <Check className="w-4 h-4 stroke-[3]" />
            <span>Save</span>
          </button>
        </form>
      </div>

      {/* 2. Default Cover Game */}
      <div className="bg-vault-900 border border-vault-800 rounded-3xl p-5 shadow-sm space-y-3">
        <div className="flex items-center gap-2">
          <Palette className="w-5 h-5 text-arcade-gold" />
          <h3 className="text-sm font-bold text-white">Default Cover Game</h3>
        </div>
        <p className="text-xs text-vault-400">
          Choose which game opens automatically when the app starts.
        </p>

        <div className="grid grid-cols-2 gap-2">
          {COVER_GAMES.map(g => (
            <button
              key={g.id}
              type="button"
              onClick={() => {
                setCurrentGame(g.id as CoverGameType);
                updatePreferences({ selected_game: g.id as CoverGameType });
              }}
              className={`p-3 rounded-2xl border text-left flex items-center justify-between transition-all ${
                currentGame === g.id
                  ? 'bg-vault-800 border-arcade-gold text-white font-bold shadow-sm'
                  : 'bg-vault-950/60 border-vault-800 text-vault-400 hover:border-vault-700'
              }`}
            >
              <span className="text-xs truncate">{g.name}</span>
              {currentGame === g.id && <Check className="w-4 h-4 text-arcade-gold shrink-0" />}
            </button>
          ))}
        </div>
      </div>

      {/* 3. Change Vault Security PIN (Hashed) */}
      <div className="bg-vault-900 border border-vault-800 rounded-3xl p-5 shadow-sm space-y-3">
        <div className="flex items-center gap-2">
          <KeyRound className="w-5 h-5 text-arcade-gold" />
          <h3 className="text-sm font-bold text-white">Update Security PIN</h3>
        </div>
        <p className="text-xs text-vault-400">
          Stored with cryptographic bcrypt/salted hash. No plaintext is recoverable.
        </p>

        <form onSubmit={handleUpdatePin} className="space-y-2.5">
          <input
            type="password"
            required
            value={oldPin}
            onChange={e => setOldPin(e.target.value)}
            placeholder="Current PIN (Default: 2048)"
            className="w-full bg-vault-950 border border-vault-700 focus:border-arcade-gold rounded-xl px-3.5 py-2 text-xs text-white placeholder-vault-600 outline-none transition-colors"
          />
          <div className="grid grid-cols-2 gap-2">
            <input
              type="password"
              required
              value={newPin}
              onChange={e => setNewPin(e.target.value)}
              placeholder="New PIN (min 4 digits)"
              className="w-full bg-vault-950 border border-vault-700 focus:border-arcade-gold rounded-xl px-3.5 py-2 text-xs text-white placeholder-vault-600 outline-none transition-colors"
            />
            <input
              type="password"
              required
              value={confirmPin}
              onChange={e => setConfirmPin(e.target.value)}
              placeholder="Confirm New PIN"
              className="w-full bg-vault-950 border border-vault-700 focus:border-arcade-gold rounded-xl px-3.5 py-2 text-xs text-white placeholder-vault-600 outline-none transition-colors"
            />
          </div>

          <button
            type="submit"
            disabled={pinUpdating || !oldPin || !newPin}
            className="w-full bg-vault-800 hover:bg-vault-700 active:scale-95 disabled:opacity-40 text-vault-100 font-bold py-2 rounded-xl text-xs border border-vault-700 transition-all flex items-center justify-center gap-2"
          >
            <Shield className="w-4 h-4 text-arcade-gold" />
            <span>{pinUpdating ? 'Hashing & Updating...' : 'Update PIN'}</span>
          </button>
        </form>
      </div>

      {/* Biometric Unlock Settings */}
      <div className="bg-vault-900 border border-vault-800 rounded-3xl p-5 shadow-sm space-y-3">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Shield className="w-4 h-4 text-arcade-gold" />
              <span>Biometric / Fingerprint Unlock</span>
            </h3>
            <p className="text-xs text-vault-400">
              Prompt biometric hardware immediately upon launching Vault
            </p>
          </div>
          <button
            type="button"
            onClick={async () => {
              const nextState = !user?.biometric_enabled;
              await updateProfile({ biometric_enabled: nextState });
            }}
            className={`w-12 h-7 rounded-full transition-colors relative p-0.5 ${
              user?.biometric_enabled ? 'bg-arcade-gold' : 'bg-vault-800 border border-vault-700'
            }`}
          >
            <div
              className={`w-6 h-6 rounded-full bg-white transition-transform ${
                user?.biometric_enabled ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </div>
      </div>

      {/* 4. Account Info & Session Actions */}
      <div className="bg-vault-900 border border-vault-800 rounded-3xl p-5 shadow-sm space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs font-bold text-white">{user?.display_name}</div>
            <div className="text-[11px] font-mono text-arcade-gold mt-0.5">{user?.uid}</div>
          </div>
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-vault-950 border border-vault-700 text-vault-400">
            {isSuperAdmin ? 'SUPER ADMIN' : 'USER'}
          </span>
        </div>

        <div className="flex gap-2 pt-2 border-t border-vault-800">
          <button
            onClick={panicLock}
            className="flex-1 bg-vault-950 hover:bg-vault-800 text-vault-200 border border-vault-700 font-bold py-2.5 rounded-xl text-xs flex items-center justify-center gap-1.5 transition-all"
          >
            <Lock className="w-4 h-4 text-rose-400" />
            <span>Engage Cover Lock</span>
          </button>
          <button
            onClick={logout}
            className="flex-1 bg-rose-950/60 hover:bg-rose-900/80 text-rose-200 border border-rose-800/60 font-bold py-2.5 rounded-xl text-xs flex items-center justify-center gap-1.5 transition-all"
          >
            <LogOut className="w-4 h-4" />
            <span>Sign Out</span>
          </button>
        </div>
      </div>
    </div>
  );
};

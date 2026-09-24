import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  Fingerprint,
  Gamepad2,
  Clock,
  Eye,
  Smartphone,
  Copy,
  LogOut,
  CheckCircle2,
  FolderLock,
  ChevronRight,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { useVault } from '../../context/VaultContext';
import { CoverGameType } from '../../types';
import { getAvatarUrl } from '../../lib/utils';

interface ProfileViewProps {
  onOpenVault?: () => void;
}

export const ProfileView: React.FC<ProfileViewProps> = ({ onOpenVault }) => {
  const { user, isSuperAdmin, logout, enrollBiometrics, disableBiometrics } = useAuth();
  const { showToast } = useToast();
  const { preferences, updatePreferences, panicLock } = useVault();

  const [biometricsEnabled, setBiometricsEnabled] = useState(user?.biometric_enabled ?? false);
  const [readReceipts, setReadReceipts] = useState(true);

  useEffect(() => {
    if (user?.biometric_enabled !== undefined) {
      setBiometricsEnabled(user.biometric_enabled);
    }
  }, [user]);

  const copyUid = () => {
    if (user?.uid) {
      navigator.clipboard.writeText(user.uid);
      showToast(`UID ${user.uid} copied to clipboard`, 'success');
    }
  };

  const handleToggleBiometrics = async () => {
    try {
      if (!biometricsEnabled) {
        await enrollBiometrics();
        setBiometricsEnabled(true);
      } else {
        await disableBiometrics();
        setBiometricsEnabled(false);
      }
    } catch {
      // Toast shown by AuthContext
    }
  };

  const handleLogout = () => {
    logout();
    panicLock();
    showToast('Signed out', 'info');
  };

  return (
    <div className="space-y-4 pb-24 animate-fade-in select-none">
      {/* Identity Card */}
      <div className="p-5 bg-[#111111] border border-[#262626] rounded-2xl relative overflow-hidden">
        <div className="flex items-center gap-4">
          <img
            src={user?.avatar_url || getAvatarUrl(user?.uid || 'vault')}
            alt="Avatar"
            className="w-16 h-16 rounded-2xl bg-[#171717] border border-[#262626] object-cover"
          />

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-white truncate">
                {user?.display_name || 'Account'}
              </h2>
              {isSuperAdmin && (
                <span className="px-2 py-0.5 bg-amber-950 text-amber-300 border border-amber-600/50 rounded text-[10px] font-bold">
                  SUPER ADMIN
                </span>
              )}
            </div>

            {/* UID Pill */}
            <button
              onClick={copyUid}
              className="mt-1.5 flex items-center gap-1.5 px-2.5 py-1 bg-[#171717] hover:bg-[#222222] border border-[#262626] rounded-lg text-xs font-mono text-[#10B981] transition-all active:scale-95"
              title="Click to copy UID"
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>{user?.uid || 'CIPHER-4921'}</span>
              <Copy className="w-3 h-3 opacity-60 ml-1" />
            </button>
          </div>
        </div>

        {/* Verification Status */}
        <div className="mt-4 pt-4 border-t border-[#262626] flex items-center justify-between text-xs">
          <div className="flex items-center gap-1.5 text-zinc-400">
            <CheckCircle2 className="w-4 h-4 text-[#10B981]" />
            <span>Account verified</span>
          </div>
          <span className="font-mono text-[11px] text-zinc-500">Encrypted</span>
        </div>
      </div>

      {/* Security Settings Section */}
      <div className="bg-[#111111] border border-[#262626] rounded-2xl p-4 space-y-3">
        <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-wider px-1">
          Security & Access Gate
        </h3>

        {/* Biometrics Toggle */}
        <div className="flex items-center justify-between p-3 rounded-xl bg-[#171717] border border-[#262626]">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-[#222222] text-[#10B981]">
              <Fingerprint className="w-4 h-4" />
            </div>
            <div>
              <p className="text-xs font-semibold text-white">Biometric Unlock</p>
              <p className="text-[11px] text-zinc-500">Touch ID / Face ID / WebAuthn</p>
            </div>
          </div>
          <button
            onClick={handleToggleBiometrics}
            className={`w-11 h-6 flex items-center rounded-full p-1 transition-colors ${
              biometricsEnabled ? 'bg-[#10B981]' : 'bg-[#262626]'
            }`}
          >
            <div
              className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform ${
                biometricsEnabled ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </div>

        {/* Private Vault Access */}
        {onOpenVault && (
          <button
            onClick={onOpenVault}
            className="w-full flex items-center justify-between p-3 rounded-xl bg-[#171717] border border-[#262626] hover:border-[#10B981]/50 transition-all"
          >
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-[#222222] text-[#10B981]">
                <FolderLock className="w-4 h-4" />
              </div>
              <div className="text-left">
                <p className="text-xs font-semibold text-white">Private Vault</p>
                <p className="text-[11px] text-zinc-500">PIN or biometric protected</p>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-zinc-500" />
          </button>
        )}

        {/* Stealth Cover Game Selector */}
        <div className="flex items-center justify-between p-3 rounded-xl bg-[#171717] border border-[#262626]">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-[#222222] text-amber-400">
              <Gamepad2 className="w-4 h-4" />
            </div>
            <div>
              <p className="text-xs font-semibold text-white">Stealth Camouflage Cover</p>
              <p className="text-[11px] text-zinc-500">Decoy game for app launcher</p>
            </div>
          </div>
          <select
            value={preferences.selected_game || 'game_2048'}
            onChange={e => {
              const game = e.target.value as CoverGameType;
              updatePreferences({ selected_game: game });
            }}
            className="bg-[#222222] text-xs font-semibold text-white px-2.5 py-1.5 rounded-lg border border-[#262626] focus:outline-none focus:border-[#10B981]"
          >
            <option value="game_2048">2048 Game</option>
            <option value="snake">Snake Retro</option>
            <option value="tic_tac_toe">Tic Tac Toe</option>
          </select>
        </div>

        {/* Auto Lock Timer */}
        <div className="flex items-center justify-between p-3 rounded-xl bg-[#171717] border border-[#262626]">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-[#222222] text-cyan-400">
              <Clock className="w-4 h-4" />
            </div>
            <div>
              <p className="text-xs font-semibold text-white">Auto-Lock Inactivity Timer</p>
              <p className="text-[11px] text-zinc-500">Automatically seal vault</p>
            </div>
          </div>
          <select
            value={preferences.auto_lock_seconds ?? 60}
            onChange={e => {
              const secs = Number(e.target.value);
              updatePreferences({ auto_lock_seconds: secs });
            }}
            className="bg-[#222222] text-xs font-semibold text-white px-2.5 py-1.5 rounded-lg border border-[#262626] focus:outline-none focus:border-[#10B981]"
          >
            <option value={30}>30 seconds</option>
            <option value={60}>1 minute</option>
            <option value={300}>5 minutes</option>
          </select>
        </div>
      </div>

      {/* Privacy Controls Section */}
      <div className="bg-[#111111] border border-[#262626] rounded-2xl p-4 space-y-3">
        <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-wider px-1">
          Privacy & Message Receipts
        </h3>

        <div className="flex items-center justify-between p-3 rounded-xl bg-[#171717] border border-[#262626]">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-[#222222] text-zinc-300">
              <Eye className="w-4 h-4" />
            </div>
            <div>
              <p className="text-xs font-semibold text-white">Read Receipts</p>
              <p className="text-[11px] text-zinc-500">Send double-check ✓✓ indicators</p>
            </div>
          </div>
          <button
            onClick={() => {
              setReadReceipts(!readReceipts);
              showToast(`Read receipts ${!readReceipts ? 'enabled' : 'disabled'}`, 'info');
            }}
            className={`w-11 h-6 flex items-center rounded-full p-1 transition-colors ${
              readReceipts ? 'bg-[#10B981]' : 'bg-[#262626]'
            }`}
          >
            <div
              className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform ${
                readReceipts ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </div>

        {/* Active Device Info */}
        <div className="p-3 rounded-xl bg-[#171717] border border-[#262626] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-[#222222] text-zinc-300">
              <Smartphone className="w-4 h-4" />
            </div>
            <div>
              <p className="text-xs font-semibold text-white">Current Hardware Node</p>
              <p className="text-[11px] text-zinc-500">Web Client • End-to-End Encrypted</p>
            </div>
          </div>
          <span className="text-[10px] font-mono text-[#10B981] px-2 py-0.5 rounded bg-emerald-950 border border-[#10B981]/30">
            ACTIVE
          </span>
        </div>
      </div>

      {/* Sign Out (use the LOCK button in the header for an instant cover switch) */}
      <div className="p-4 bg-[#111111] border border-[#262626] rounded-2xl">
        <button
          onClick={handleLogout}
          className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-red-950/40 hover:bg-red-950/80 border border-red-800/40 rounded-xl text-xs font-semibold text-red-400 transition-all active:scale-95"
        >
          <LogOut className="w-4 h-4" />
          <span>Sign Out</span>
        </button>
      </div>
    </div>
  );
};

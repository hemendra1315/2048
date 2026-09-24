import React, { useState, useEffect } from 'react';
import {
  Radio,
  Ban,
  ArrowLeft,
  Shield,
  KeyRound,
  LogOut,
  Lock,
  Gamepad2,
  Clock,
  Eye,
  Check,
  Smartphone,
  ChevronRight,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useVault } from '../../context/VaultContext';
import { useGame, COVER_GAMES } from '../../context/GameContext';
import { useToast } from '../../context/ToastContext';
import { getPresenceSharing, setPresenceSharing, getReadReceiptSharing, setReadReceiptSharing } from '../../lib/presence';
import { isSupabaseConfigured } from '../../lib/supabase';
import { listBlocked, unblockUser } from '../../lib/blocks';
import { UserProfile } from '../../types';
import { CoverGameType } from '../../types';
import { useBackHandler } from '../../lib/backButton';

interface SettingsViewProps {
  onBack?: () => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({ onBack }) => {
  const { user, logout, enrollBiometrics, disableBiometrics } = useAuth();
  const { preferences, updatePreferences, updateSecret, panicLock } = useVault();
  const { currentGame, setCurrentGame } = useGame();
  const { showToast } = useToast();

  const [appName, setAppName] = useState(preferences.custom_app_name || 'Games');
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordUpdating, setPasswordUpdating] = useState(false);
  const [readReceipts, setReadReceipts] = useState(true);
  const [shareOnline, setShareOnline] = useState(true);
  const [shareOnlineSaving, setShareOnlineSaving] = useState(false);
  const [blocked, setBlocked] = useState<{ profile: UserProfile; blockedAt: string }[]>([]);
  const [showBlocked, setShowBlocked] = useState(false);

  useEffect(() => {
    if (!user || !isSupabaseConfigured()) return;
    let cancelled = false;
    void listBlocked(user.id).then(list => { if (!cancelled) setBlocked(list); }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [user]);

  const handleUnblock = async (p: UserProfile) => {
    if (!user) return;
    try {
      await unblockUser(user.id, p.id);
      setBlocked(prev => prev.filter(b => b.profile.id !== p.id));
      showToast(`Unblocked ${p.display_name}`, 'success');
    } catch {
      showToast('Could not unblock', 'error');
    }
  };

  useEffect(() => {
    let cancelled = false;
    void getPresenceSharing().then(v => { if (!cancelled) setShareOnline(v); });
    void getReadReceiptSharing().then(v => { if (!cancelled) setReadReceipts(v); });
    return () => { cancelled = true; };
  }, []);

  const handleToggleReadReceipts = async () => {
    const next = !readReceipts;
    setReadReceipts(next);
    if (!isSupabaseConfigured()) return;
    try {
      await setReadReceiptSharing(next);
      showToast(next ? 'Read receipts on' : 'Read receipts off. You also won’t see when others read yours', 'info');
    } catch {
      setReadReceipts(!next);
      showToast('Could not change read receipts', 'error');
    }
  };

  const handleToggleShareOnline = async () => {
    const next = !shareOnline;
    setShareOnline(next);
    setShareOnlineSaving(true);
    try {
      await setPresenceSharing(next);
      showToast(next ? 'Your online status is visible to your chats' : 'Online status hidden. You also won’t see others’', 'info');
    } catch {
      setShareOnline(!next);
      showToast('Could not change online status', 'error');
    } finally {
      setShareOnlineSaving(false);
    }
  };
  const [biometricsLoading, setBiometricsLoading] = useState(false);

  const handleSaveAppName = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!appName.trim()) return;
    await updatePreferences({ custom_app_name: appName.trim() });
    showToast('Launcher disguise updated', 'success');
  };

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 8) {
      showToast('Password must be at least 8 characters', 'error');
      return;
    }
    if (newPassword !== confirmPassword) {
      showToast('New passwords do not match', 'error');
      return;
    }

    setPasswordUpdating(true);
    try {
      await updateSecret(oldPassword, newPassword);
      setOldPassword('');
      setNewPassword('');
      setConfirmPassword('');
      showToast('Unlock password updated', 'success');
    } catch {
      // Error toast already triggered in context
    } finally {
      setPasswordUpdating(false);
    }
  };

  const handleToggleBiometrics = async () => {
    setBiometricsLoading(true);
    try {
      if (user?.biometric_enabled) {
        await disableBiometrics();
      } else {
        await enrollBiometrics();
      }
    } catch {
      // Toast reported by AuthContext
    } finally {
      setBiometricsLoading(false);
    }
  };

  const handleLogout = () => {
    logout();
    panicLock();
    showToast('Signed out', 'info');
  };

  const dismissKeyboard = () => {
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
  };

  useBackHandler(showBlocked, () => setShowBlocked(false));

  return (
    <div
      onScroll={dismissKeyboard}
      onTouchMove={dismissKeyboard}
      className="flex flex-col gap-6 pb-4 animate-fade-in select-none"
    >
      {/* Top Header */}
      <header className="flex items-center gap-3">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="ib"
            aria-label="Back to profile"
          >
            <ArrowLeft className="i" aria-hidden />
          </button>
        )}
        <h1 className="t-h1 m-0">Settings</h1>
      </header>

      {/* 1. ACCOUNT SECTION */}
      <section className="flex flex-col gap-2">
        <h2 className="t-over px-1 m-0">Account</h2>
        <div className="card overflow-hidden">
          <div className="set-row">
            <div className="flex-1 min-w-0">
              <span className="t-body block">{user?.display_name || 'User'}</span>
              <span className="t-cap c3 font-mono">{user?.uid}</span>
            </div>
            <span className="tag tag-em mono">Active</span>
          </div>
          <div className="divider ml-4" />
          <div className="set-row">
            <span className="t-body flex-1">Username</span>
            <span className="t-sm c2 font-mono">@{user?.username || user?.uid || 'user'}</span>
          </div>
        </div>
      </section>

      {/* 2. SECURITY & PASSKEYS */}
      <section className="flex flex-col gap-2">
        <h2 className="t-over px-1 m-0">Security & Biometrics</h2>
        <div className="card overflow-hidden">
          {/* Biometrics Switch */}
          <button
            type="button"
            role="switch"
            aria-checked={Boolean(user?.biometric_enabled)}
            disabled={biometricsLoading}
            onClick={handleToggleBiometrics}
            className="set-row w-full text-left"
          >
            <Shield className="i c2" aria-hidden />
            <div className="flex-1 min-w-0">
              <span className="t-body block">Biometric / Passkey unlock</span>
              <span className="t-cap c3">Sign in with fingerprint, face or screen lock</span>
            </div>
            <span
              className={user?.biometric_enabled ? 'switch switch-on' : 'switch'}
              aria-hidden="true"
            />
          </button>

          <div className="divider ml-[52px]" />

          {/* Auto-lock Timeout */}
          <div className="set-row">
            <Clock className="i c2" aria-hidden />
            <span className="t-body flex-1">Auto-lock timer</span>
            <select
              value={preferences.auto_lock_seconds ?? 60}
              onChange={e => {
                const secs = Number(e.target.value);
                updatePreferences({ auto_lock_seconds: secs });
              }}
              aria-label="Auto-lock timer"
              className="bg-vault-850 text-xs font-semibold text-vault-100 px-3 py-2 rounded-xl border border-vault-700 focus:outline-none focus:border-cy"
            >
              <option value={30}>30 seconds</option>
              <option value={60}>1 minute</option>
              <option value={300}>5 minutes</option>
            </select>
          </div>

          <div className="divider ml-[52px]" />

          {/* Quick Panic Lock */}
          <button
            type="button"
            onClick={panicLock}
            className="set-row w-full text-left"
          >
            <Lock className="i c2 text-gold" aria-hidden />
            <span className="t-body flex-1">Lock app now</span>
            <ChevronRight className="i i-sm c3" aria-hidden />
          </button>
        </div>
      </section>

      {/* 3. CAMOUFLAGE & DISGUISE */}
      <section className="flex flex-col gap-2">
        <h2 className="t-over px-1 m-0">Camouflage Disguise</h2>
        <div className="card p-4 flex flex-col gap-4">
          <div className="field">
            <label htmlFor="disguise-name" className="lab">Launcher App Name</label>
            <form onSubmit={handleSaveAppName} className="flex gap-2">
              <input
                id="disguise-name"
                type="text"
                value={appName}
                onChange={e => setAppName(e.target.value)}
                placeholder="e.g. Games"
                className="inp flex-1 text-sm"
              />
              <button
                type="submit"
                className="btn btn-s btn-sm"
                aria-label="Save disguise name"
              >
                <Check className="i i-sm" aria-hidden />
                <span>Save</span>
              </button>
            </form>
          </div>

          <div className="field">
            <span className="lab">Default Cover Game</span>
            <div className="grid grid-cols-2 gap-2 mt-1">
              {COVER_GAMES.map(g => (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => {
                    setCurrentGame(g.id as CoverGameType);
                    updatePreferences({ selected_game: g.id as CoverGameType });
                  }}
                  className={`btn btn-sm justify-between ${
                    currentGame === g.id ? 'btn-s !border-emerald !text-white' : 'btn-s text-vault-400'
                  }`}
                >
                  <span className="truncate">{g.name}</span>
                  {currentGame === g.id && <Check className="i i-sm text-emerald shrink-0" aria-hidden />}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* 4. CHANGE VAULT UNLOCK PASSWORD */}
      <section className="flex flex-col gap-2">
        <h2 className="t-over px-1 m-0">Change Unlock Password</h2>
        <div className="card p-4 flex flex-col gap-3">
          <form onSubmit={handleUpdatePassword} className="flex flex-col gap-3">
            <div className="field">
              <label htmlFor="current-pw" className="lab">Current Password</label>
              <input
                id="current-pw"
                type="password"
                required
                value={oldPassword}
                onChange={e => setOldPassword(e.target.value)}
                placeholder="••••••••"
                className="inp text-sm"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="field">
                <label htmlFor="new-pw" className="lab">New Password</label>
                <input
                  id="new-pw"
                  type="password"
                  required
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  placeholder="Min 8 characters"
                  className="inp text-sm"
                />
              </div>
              <div className="field">
                <label htmlFor="confirm-pw" className="lab">Confirm Password</label>
                <input
                  id="confirm-pw"
                  type="password"
                  required
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  placeholder="Repeat new password"
                  className="inp text-sm"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={passwordUpdating || !oldPassword || !newPassword}
              className="btn btn-s btn-block mt-1"
            >
              <KeyRound className="i i-sm" aria-hidden />
              <span>{passwordUpdating ? 'Updating...' : 'Update Password'}</span>
            </button>
          </form>
        </div>
      </section>

      {/* 5. PRIVACY */}
      <section className="flex flex-col gap-2">
        <h2 className="t-over px-1 m-0">Privacy</h2>
        <div className="card overflow-hidden">
          {isSupabaseConfigured() && (
            <>
              <button
                type="button"
                role="switch"
                aria-checked={shareOnline}
                disabled={shareOnlineSaving}
                onClick={() => void handleToggleShareOnline()}
                className="set-row w-full text-left"
              >
                <Radio className="i c2" aria-hidden />
                <div className="flex-1 min-w-0">
                  <span className="t-body block">Online status & last seen</span>
                  <span className="t-cap c3">
                    Show people you chat with when you're online. If you turn this off, you won't see theirs either.
                  </span>
                </div>
                <span className={shareOnline ? 'switch switch-on' : 'switch'} aria-hidden="true" />
              </button>
              <div className="divider ml-[52px]" />
            </>
          )}
          <button
            type="button"
            role="switch"
            aria-checked={readReceipts}
            onClick={() => void handleToggleReadReceipts()}
            className="set-row w-full text-left"
          >
            <Eye className="i c2" aria-hidden />
            <div className="flex-1 min-w-0">
              <span className="t-body block">Read receipts</span>
              <span className="t-cap c3">Let people see when you've read their messages. If off, you won't see theirs either.</span>
            </div>
            <span
              className={readReceipts ? 'switch switch-on' : 'switch'}
              aria-hidden="true"
            />
          </button>

          <div className="divider ml-[52px]" />

          {isSupabaseConfigured() && (
            <>
              <button
                type="button"
                onClick={() => setShowBlocked(v => !v)}
                aria-expanded={showBlocked}
                className="set-row w-full text-left"
              >
                <Ban className="i c2" aria-hidden />
                <div className="flex-1 min-w-0">
                  <span className="t-body block">Blocked people</span>
                  <span className="t-cap c3">{blocked.length ? `${blocked.length} blocked` : 'Nobody blocked'}</span>
                </div>
              </button>
              {showBlocked && blocked.length > 0 && (
                <ul className="list-none m-0 px-4 pb-3 flex flex-col gap-2">
                  {blocked.map(b => (
                    <li key={b.profile.id} className="flex items-center justify-between gap-3">
                      <span className="min-w-0">
                        <span className="block text-sm text-white truncate">{b.profile.display_name}</span>
                        <span className="block text-xs text-vault-500 font-mono">{b.profile.uid}</span>
                      </span>
                      <button type="button" onClick={() => void handleUnblock(b.profile)} className="btn btn-s btn-sm min-h-[36px]">
                        Unblock
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <div className="divider ml-[52px]" />
            </>
          )}

          <div className="set-row">
            <Smartphone className="i c2" aria-hidden />
            <div className="flex-1 min-w-0">
              <span className="t-body block">Local Cache</span>
              <span className="t-cap c3">Protected cache on device</span>
            </div>
            <span className="tag tag-em mono">Protected</span>
          </div>
        </div>
      </section>

      {/* 6. DANGEROUS ACTIONS */}
      <section className="flex flex-col gap-2">
        <h2 className="t-over px-1 m-0 text-danger">Actions</h2>
        <div className="card overflow-hidden">
          <button
            type="button"
            onClick={panicLock}
            className="set-row w-full text-left"
          >
            <Gamepad2 className="i c2" aria-hidden />
            <span className="t-body flex-1">Lock to cover game</span>
            <ChevronRight className="i i-sm c3" aria-hidden />
          </button>

          <div className="divider ml-4" />

          <button
            type="button"
            onClick={handleLogout}
            className="set-row w-full text-left !text-[#FF8A93] hover:!text-red-300"
          >
            <LogOut className="i" aria-hidden />
            <span className="t-body flex-1 font-semibold">Sign Out</span>
          </button>
        </div>
      </section>

      {/* App Version Footer */}
      <p className="t-cap mono text-center m-0">Games 2.4.0 (240)</p>
    </div>
  );
};

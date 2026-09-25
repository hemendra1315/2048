import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { UserPreferences } from '../types';
import { useAuth } from './AuthContext';
import { mockBackend } from '../lib/mockBackend';
import { supabase, isSupabaseConfigured, isMockBackendAllowed } from '../lib/supabase';

interface UnlockResult {
  ok: boolean;
  error?: 'invalid' | 'locked' | 'not_authenticated' | 'too_short' | 'too_long';
  locked_until?: string | null;
}

function unlockErrorMessage(result: UnlockResult | null): string {
  switch (result?.error) {
    case 'locked': {
      const mins = result.locked_until
        ? Math.max(1, Math.ceil((new Date(result.locked_until).getTime() - Date.now()) / 60000))
        : 15;
      return `Too many wrong PIN attempts. Try again in ${mins} minute(s).`;
    }
    case 'too_short':
      return 'Unlock PIN must be at least 4 digits';
    case 'too_long':
      return 'Unlock PIN is too long';
    case 'not_authenticated':
      return 'Session expired. Sign in again.';
    default:
      return 'Incorrect PIN';
  }
}
import { useToast } from './ToastContext';
import { getInviteUidFromUrl } from '../lib/invite';

interface VaultContextType {
  isUnlocked: boolean;
  unlockModalOpen: boolean;
  preferences: UserPreferences;
  openUnlockModal: () => void;
  closeUnlockModal: () => void;
  verifyAndUnlock: (secret: string) => Promise<boolean>;
  unlockWithBiometric: () => Promise<boolean>;
  panicLock: () => void;
  updatePreferences: (updates: Partial<UserPreferences>) => Promise<void>;
  updateSecret: (oldSecret: string, newSecret: string) => Promise<void>;
}

const VaultContext = createContext<VaultContextType | undefined>(undefined);

export const VaultProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { user, loginWithBiometrics } = useAuth();
  const { showToast } = useToast();
  const [isUnlocked, setIsUnlocked] = useState(() => !!getInviteUidFromUrl());
  const [unlockModalOpen, setUnlockModalOpen] = useState(false);
  const [preferences, setPreferences] = useState<UserPreferences>({
    id: 'default',
    user_id: user?.id || 'guest',
    custom_app_name: 'Retro Arcade',
    selected_icon: 'arcade_gamepad',
    selected_game: 'game_2048',
    unlock_method: 'pin',
    unlock_secret_hash: '',
    theme_preference: 'dark_modern',
    auto_lock_seconds: 60,
  });

  const loadPreferences = useCallback(async () => {
    if (!user) return;
    try {
      if (isSupabaseConfigured()) {
        const { data, error } = await supabase
          .from('user_preferences')
          .select('*')
          .eq('user_id', user.id)
          .single();
        if (data && !error) {
          setPreferences(data as unknown as UserPreferences);
        }
      } else {
        const p = mockBackend.getUserPreferences(user.id);
        setPreferences(p);
      }
    } catch (err) {
      console.error('Error loading user preferences:', err);
    }
  }, [user]);

  useEffect(() => {
    loadPreferences();
  }, [loadPreferences]);

  const openUnlockModal = () => setUnlockModalOpen(true);
  const closeUnlockModal = () => setUnlockModalOpen(false);

  const panicLock = useCallback(() => {
    setIsUnlocked(false);
    setUnlockModalOpen(false);
    showToast('Locked', 'info');
  }, [showToast]);

  // Global auto-lock inactivity timer
  useEffect(() => {
    if (!isUnlocked) return;

    const timeoutSecs = preferences.auto_lock_seconds || 60;
    let timer: NodeJS.Timeout;

    const resetTimer = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        setIsUnlocked(false);
        setUnlockModalOpen(false);
        showToast('Locked due to inactivity', 'info');
      }, timeoutSecs * 1000);
    };

    resetTimer();

    const activityEvents = ['mousedown', 'keydown', 'touchstart', 'scroll'];
    activityEvents.forEach(evt => window.addEventListener(evt, resetTimer));

    return () => {
      clearTimeout(timer);
      activityEvents.forEach(evt => window.removeEventListener(evt, resetTimer));
    };
  }, [isUnlocked, preferences.auto_lock_seconds, showToast]);

  const verifyAndUnlock = async (secret: string): Promise<boolean> => {
    try {
      if (isSupabaseConfigured() && user) {
        const { data, error } = await supabase.rpc('verify_vault_unlock', { p_secret: secret });
        if (error) {
          console.error('Vault unlock RPC error:', error);
          showToast('Something went wrong. Try again.', 'error');
          return false;
        }
        const result = data as UnlockResult | null;
        if (result?.ok) {
          setIsUnlocked(true);
          setUnlockModalOpen(false);
          showToast('Unlocked', 'success');
          return true;
        }
        showToast(unlockErrorMessage(result), 'error');
        return false;
      } else if (user && isMockBackendAllowed()) {
        const ok = await mockBackend.verifyUnlockSecret(user.id, secret);
        if (!ok) {
          showToast('Incorrect PIN', 'error');
          return false;
        }
      } else if (user) {
        showToast('Server is not configured', 'error');
        return false;
      } else {
        if (secret !== '2048') {
          showToast('Incorrect PIN (Default: 2048)', 'error');
          return false;
        }
      }

      setIsUnlocked(true);
      setUnlockModalOpen(false);
      showToast('Unlocked', 'success');
      return true;
    } catch (err) {
      console.error('Unlock verification failed:', err);
      showToast('Something went wrong. Try again.', 'error');
      return false;
    }
  };

  const unlockWithBiometric = useCallback(async (): Promise<boolean> => {
    try {
      // Runs the same server-verified WebAuthn ceremony as fingerprint login: a real signature
      // check against the user's enrolled credential, not just a hardware-presence check.
      await loginWithBiometrics(user?.username);
      setIsUnlocked(true);
      setUnlockModalOpen(false);
      return true;
    } catch {
      // loginWithBiometrics already surfaced a toast for the failure.
      return false;
    }
  }, [loginWithBiometrics, user?.username]);

  const updatePreferences = async (updates: Partial<UserPreferences>) => {
    if (!user) return;
    try {
      if (isSupabaseConfigured()) {
        const { error } = await supabase
          .from('user_preferences')
          .update(updates as unknown as { custom_app_name?: string })
          .eq('user_id', user.id);
        if (error) throw error;
      } else {
        mockBackend.updateUserPreferences(user.id, updates);
      }
      setPreferences(prev => ({ ...prev, ...updates }));
      showToast('Settings saved', 'success');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Preferences update failed';
      showToast(msg, 'error');
    }
  };

  const updateSecret = async (oldSecret: string, newSecret: string) => {
    if (!user) return;
    try {
      if (isSupabaseConfigured()) {
        const { data, error } = await supabase.rpc('update_vault_unlock', {
          p_old_secret: oldSecret,
          p_new_secret: newSecret,
        });
        if (error) throw error;
        const result = data as UnlockResult | null;
        if (!result?.ok) throw new Error(unlockErrorMessage(result));
      } else if (isMockBackendAllowed()) {
        await mockBackend.updateUnlockSecret(user.id, oldSecret, newSecret);
      } else {
        throw new Error('Server is not configured');
      }
      showToast('PIN updated', 'success');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to update PIN';
      showToast(msg, 'error');
      throw err;
    }
  };

  return (
    <VaultContext.Provider
      value={{
        isUnlocked,
        unlockModalOpen,
        preferences,
        openUnlockModal,
        closeUnlockModal,
        verifyAndUnlock,
        unlockWithBiometric,
        panicLock,
        updatePreferences,
        updateSecret,
      }}
    >
      {children}
    </VaultContext.Provider>
  );
};

export const useVault = () => {
  const context = useContext(VaultContext);
  if (!context) throw new Error('useVault must be used within VaultProvider');
  return context;
};

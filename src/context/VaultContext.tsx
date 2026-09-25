import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { UserPreferences } from '../types';
import { isAwayForExternalActivity, leavingForExternalActivity, returnedToApp } from '../lib/externalActivity';
import { useAuth } from './AuthContext';
import { mockBackend } from '../lib/mockBackend';
import { supabase, isSupabaseConfigured, isMockBackendAllowed } from '../lib/supabase';
import { useToast } from './ToastContext';

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
      return `Too many wrong passwords. Try again in ${mins} minute(s).`;
    }
    case 'too_short':
      return 'Unlock password must be at least 4 characters';
    case 'too_long':
      return 'Unlock password is too long';
    case 'not_authenticated':
      return 'Session expired. Sign in again.';
    default:
      return 'Incorrect password';
  }
}

interface VaultContextType {
  isUnlocked: boolean;
  unlockModalOpen: boolean;
  preferences: UserPreferences;
  openUnlockModal: () => void;
  closeUnlockModal: () => void;
  verifyAndUnlock: (secret: string) => Promise<boolean>;
  proceedToSignIn: () => void;
  panicLock: () => void;
  updatePreferences: (updates: Partial<UserPreferences>, options?: { silent?: boolean }) => Promise<void>;
  updateSecret: (oldSecret: string, newSecret: string) => Promise<void>;
}

const VaultContext = createContext<VaultContextType | undefined>(undefined);

export const VaultProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [unlockModalOpen, setUnlockModalOpen] = useState(false);
  const [preferences, setPreferences] = useState<UserPreferences>({
    id: 'default',
    user_id: user?.id || 'guest',
    custom_app_name: 'Games',
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

  const openUnlockModal = useCallback(() => setUnlockModalOpen(true), []);
  const closeUnlockModal = useCallback(() => setUnlockModalOpen(false), []);

  // Locking never shows a message: whatever appears next is on the games screen, where it would
  // give the app away.
  const panicLock = useCallback(() => {
    setIsUnlocked(false);
    setUnlockModalOpen(false);
  }, []);

  // Global auto-lock inactivity timer. It waits while the camera or a photo picker has the screen,
  // and restarts when the app comes back to the foreground.
  useEffect(() => {
    if (!isUnlocked) return;

    const timeoutSecs = preferences.auto_lock_seconds || 60;
    let timer: ReturnType<typeof setTimeout>;

    const resetTimer = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (isAwayForExternalActivity()) {
          resetTimer();
          return;
        }
        setIsUnlocked(false);
        setUnlockModalOpen(false);
      }, timeoutSecs * 1000);
    };

    resetTimer();

    // Capture phase: scrolling a chat or list scrolls an element, and element scroll events
    // don't bubble up to window.
    const activityEvents = ['pointerdown', 'keydown', 'touchstart', 'scroll', 'input'];
    const opts = { capture: true, passive: true };
    activityEvents.forEach(evt => window.addEventListener(evt, resetTimer, opts));
    const resume = Capacitor.isNativePlatform() ? App.addListener('resume', resetTimer) : null;

    return () => {
      clearTimeout(timer);
      activityEvents.forEach(evt => window.removeEventListener(evt, resetTimer, opts));
      void resume?.then(h => h.remove());
    };
  }, [isUnlocked, preferences.auto_lock_seconds]);

  // Leaving the app (home, app switcher, screen off) locks it right away, unless it left for the
  // camera or a photo picker (see lib/externalActivity).
  useEffect(() => {
    if (!isUnlocked || !Capacitor.isNativePlatform()) return;
    const pause = App.addListener('pause', () => {
      if (leavingForExternalActivity()) return;
      setIsUnlocked(false);
      setUnlockModalOpen(false);
    });
    const resume = App.addListener('resume', returnedToApp);
    return () => {
      void pause.then(h => h.remove());
      void resume.then(h => h.remove());
    };
  }, [isUnlocked]);

  // The vault opens only when the server confirms the unlock password (verify_vault_unlock).
  // There is no client-side fallback: an RPC error, a network failure or a rejected password
  // all keep the vault locked.
  const verifyAndUnlock = async (secret: string): Promise<boolean> => {
    if (!user) {
      showToast('Sign in first', 'error');
      return false;
    }
    try {
      let ok = false;
      if (isSupabaseConfigured()) {
        const { data, error } = await supabase.rpc('verify_vault_unlock', { p_secret: secret });
        const result = data as UnlockResult | null;
        if (error) {
          showToast('Could not verify password. Check your connection and try again.', 'error');
          return false;
        }
        ok = result?.ok === true;
        if (!ok) {
          showToast(unlockErrorMessage(result), 'error');
          return false;
        }
      } else if (isMockBackendAllowed()) {
        ok = await mockBackend.verifyUnlockSecret(user.id, secret);
        if (!ok) {
          showToast('Incorrect password', 'error');
          return false;
        }
      } else {
        showToast('Server is not configured', 'error');
        return false;
      }

      setIsUnlocked(true);
      setUnlockModalOpen(false);
      return true;
    } catch (err) {
      console.error('Unlock verification failed:', err instanceof Error ? err.message : err);
      showToast('Unlock verification error', 'error');
      return false;
    }
  };

  // Signed-out visitors have no vault to unlock. The gate takes them to the sign-in screen,
  // where the account password is verified by the vault-auth server function.
  const proceedToSignIn = useCallback(() => {
    if (user) return;
    setIsUnlocked(true);
    setUnlockModalOpen(false);
  }, [user]);

  // `silent` is used from the game screen: choosing a game must not show app-level feedback there.
  const updatePreferences = async (updates: Partial<UserPreferences>, options?: { silent?: boolean }) => {
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
      if (!options?.silent) showToast('Settings saved', 'success');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Preferences update failed';
      if (options?.silent) console.warn('Preferences update failed');
      else showToast(msg, 'error');
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
      showToast('Unlock password updated securely', 'success');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to update password';
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
        proceedToSignIn,
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

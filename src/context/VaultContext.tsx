import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { UserPreferences } from '../types';
import { useAuth } from './AuthContext';
import { mockBackend } from '../lib/mockBackend';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { useToast } from './ToastContext';

interface VaultContextType {
  isUnlocked: boolean;
  unlockModalOpen: boolean;
  preferences: UserPreferences;
  openUnlockModal: () => void;
  closeUnlockModal: () => void;
  verifyAndUnlock: (secret: string) => Promise<boolean>;
  panicLock: () => void;
  updatePreferences: (updates: Partial<UserPreferences>) => Promise<void>;
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
    showToast('Cover mode engaged', 'info');
  }, [showToast]);

  const verifyAndUnlock = async (secret: string): Promise<boolean> => {
    try {
      if (isSupabaseConfigured() && user) {
        const { data, error } = await supabase.rpc('verify_unlock_secret', {
          input_secret: secret.trim(),
        } as unknown as { input_secret: string });
        if (error || !data) {
          showToast('Invalid security code', 'error');
          return false;
        }
      } else if (user) {
        const ok = await mockBackend.verifyUnlockSecret(user.id, secret.trim());
        if (!ok) {
          showToast('Invalid security code', 'error');
          return false;
        }
      } else {
        // Guest mode fallback code
        if (secret.trim() !== '2048') {
          showToast('Invalid security code (Default: 2048)', 'error');
          return false;
        }
      }

      setIsUnlocked(true);
      setUnlockModalOpen(false);
      showToast('Vault security cleared', 'success');
      return true;
    } catch (err) {
      console.error('Unlock verification failed:', err);
      showToast('Unlock verification error', 'error');
      return false;
    }
  };

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
      showToast('App customization saved', 'success');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Preferences update failed';
      showToast(msg, 'error');
    }
  };

  const updateSecret = async (oldSecret: string, newSecret: string) => {
    if (!user) return;
    try {
      if (isSupabaseConfigured()) {
        const { error } = await supabase.rpc('update_unlock_secret', {
          old_secret: oldSecret.trim(),
          new_secret: newSecret.trim(),
        } as unknown as { old_secret: string; new_secret: string });
        if (error) throw error;
      } else {
        await mockBackend.updateUnlockSecret(user.id, oldSecret.trim(), newSecret.trim());
      }
      showToast('Unlock PIN updated securely', 'success');
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

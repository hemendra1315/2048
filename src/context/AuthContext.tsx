import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { UserProfile } from '../types';
import { mockBackend } from '../lib/mockBackend';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { useToast } from './ToastContext';
import { BiometricService } from '../lib/biometrics';
import { hashPin, hashSecret, generateUniqueUID, generateRecoveryCode } from '../lib/utils';

const STORAGE_SESSION_KEY = 'vault_active_session_user';

export interface RegisterParams {
  username: string;
  pin: string;
  enableBiometrics: boolean;
  avatarUrl?: string;
}

interface AuthContextType {
  user: UserProfile | null;
  loading: boolean;
  isSuperAdmin: boolean;
  isBiometricsSupported: boolean;
  loginWithPin: (identifier: string, pin: string) => Promise<UserProfile>;
  loginWithBiometrics: (identifier?: string) => Promise<UserProfile>;
  registerFrictionless: (params: RegisterParams) => Promise<{ user: UserProfile; recoveryCode: string }>;
  resetPinWithRecovery: (identifier: string, recoveryCode: string, newPin: string) => Promise<UserProfile>;
  login: (emailOrIdent: string, passwordOrPin?: string) => Promise<void>;
  register: (displayName: string, email?: string, password?: string) => Promise<void>;
  logout: () => Promise<void>;
  updateProfile: (updates: Partial<UserProfile>) => Promise<UserProfile>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [isBiometricsSupported, setIsBiometricsSupported] = useState(false);
  const { showToast } = useToast();

  // Check biometric support on mount
  useEffect(() => {
    BiometricService.isAvailable().then(res => {
      setIsBiometricsSupported(res.available);
    });
  }, []);

  const refreshUser = async () => {
    try {
      const savedUserJson = localStorage.getItem(STORAGE_SESSION_KEY);
      if (savedUserJson) {
        try {
          const parsed = JSON.parse(savedUserJson) as UserProfile;
          if (isSupabaseConfigured() && parsed?.id) {
            const { data: profile } = await supabase
              .from('profiles')
              .select('*')
              .eq('id', parsed.id)
              .single();
            if (profile) {
              setUser(profile as unknown as UserProfile);
              localStorage.setItem(STORAGE_SESSION_KEY, JSON.stringify(profile));
              return;
            }
          } else {
            setUser(parsed);
            return;
          }
        } catch (e) {
          console.error('Error parsing local user session:', e);
        }
      }

      if (!isSupabaseConfigured()) {
        const currentUser = mockBackend.getCurrentUser();
        setUser(currentUser);
      }
    } catch (err) {
      console.error('Error loading session:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshUser();

    if (!isSupabaseConfigured()) {
      const unsub = mockBackend.subscribe('auth:state_change', data => {
        setUser(data as UserProfile | null);
      });
      return unsub;
    }
  }, []);

  /**
   * Frictionless PIN Login (Username/UID + PIN)
   */
  const loginWithPin = async (identifier: string, pin: string): Promise<UserProfile> => {
    setLoading(true);
    try {
      const cleanIdent = identifier.trim();
      const pinHash = await hashPin(pin.trim(), cleanIdent);

      if (isSupabaseConfigured()) {
        const { data, error } = await supabase.rpc('login_frictionless_user', {
          p_identifier: cleanIdent,
          p_pin_hash: pinHash,
        });
        if (error) throw error;
        const profile = data as unknown as UserProfile;
        setUser(profile);
        localStorage.setItem(STORAGE_SESSION_KEY, JSON.stringify(profile));
        showToast(`Welcome back, @${profile.username}`, 'success');
        return profile;
      } else {
        const profile = await mockBackend.loginWithPin(cleanIdent, pin.trim());
        setUser(profile);
        localStorage.setItem(STORAGE_SESSION_KEY, JSON.stringify(profile));
        showToast(`Welcome back, @${profile.username}`, 'success');
        return profile;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Invalid credentials or PIN';
      showToast(msg, 'error');
      throw err;
    } finally {
      setLoading(false);
    }
  };

  /**
   * Frictionless Biometric Login
   */
  const loginWithBiometrics = async (identifier?: string): Promise<UserProfile> => {
    setLoading(true);
    try {
      const authResult = await BiometricService.authenticate();
      if (!authResult.success) {
        throw new Error(authResult.error || 'Biometric verification failed');
      }

      const targetIdent = identifier || user?.username || user?.uid || 'alex';

      if (isSupabaseConfigured()) {
        const { data, error } = await supabase.rpc('biometric_login_user', {
          p_identifier: targetIdent,
        });
        if (error) throw error;
        const profile = data as unknown as UserProfile;
        setUser(profile);
        localStorage.setItem(STORAGE_SESSION_KEY, JSON.stringify(profile));
        showToast('Biometric verified: Vault unlocked', 'success');
        return profile;
      } else {
        const profile = await mockBackend.loginWithBiometrics(targetIdent);
        setUser(profile);
        localStorage.setItem(STORAGE_SESSION_KEY, JSON.stringify(profile));
        showToast('Biometric verified: Vault unlocked', 'success');
        return profile;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Biometric authentication failed';
      showToast(msg, 'error');
      throw err;
    } finally {
      setLoading(false);
    }
  };

  /**
   * Frictionless Registration (Username -> PIN -> Biometrics -> Recovery Code)
   */
  const registerFrictionless = async (
    params: RegisterParams
  ): Promise<{ user: UserProfile; recoveryCode: string }> => {
    setLoading(true);
    try {
      const cleanUsername = params.username.toLowerCase().trim();
      const generatedUid = generateUniqueUID();
      const recoveryCode = generateRecoveryCode();

      const pinHash = await hashPin(params.pin.trim(), cleanUsername);
      const recoveryCodeHash = await hashSecret(recoveryCode);

      if (params.enableBiometrics) {
        await BiometricService.registerBiometric(cleanUsername);
      }

      if (isSupabaseConfigured()) {
        const { data, error } = await supabase.rpc('register_frictionless_user', {
          p_username: cleanUsername,
          p_uid: generatedUid,
          p_pin_hash: pinHash,
          p_recovery_code_hash: recoveryCodeHash,
          p_biometric_enabled: params.enableBiometrics,
          p_avatar_url: params.avatarUrl || `https://api.dicebear.com/7.x/bottts/svg?seed=${generatedUid}`,
        });
        if (error) throw error;
        const profile = data as unknown as UserProfile;
        setUser(profile);
        localStorage.setItem(STORAGE_SESSION_KEY, JSON.stringify(profile));
        showToast('Vault identity activated successfully', 'success');
        return { user: profile, recoveryCode };
      } else {
        const res = await mockBackend.registerFrictionless(params);
        setUser(res.user);
        localStorage.setItem(STORAGE_SESSION_KEY, JSON.stringify(res.user));
        showToast('Vault identity activated successfully', 'success');
        return res;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Registration failed';
      showToast(msg, 'error');
      throw err;
    } finally {
      setLoading(false);
    }
  };

  /**
   * Reset PIN using Recovery Code
   */
  const resetPinWithRecovery = async (
    identifier: string,
    recoveryCode: string,
    newPin: string
  ): Promise<UserProfile> => {
    setLoading(true);
    try {
      const cleanIdent = identifier.trim();
      const recoveryCodeHash = await hashSecret(recoveryCode.trim());
      const newPinHash = await hashPin(newPin.trim(), cleanIdent);

      if (isSupabaseConfigured()) {
        const { data, error } = await supabase.rpc('reset_user_pin', {
          p_identifier: cleanIdent,
          p_recovery_code_hash: recoveryCodeHash,
          p_new_pin_hash: newPinHash,
        });
        if (error) throw error;
        const profile = data as unknown as UserProfile;
        setUser(profile);
        localStorage.setItem(STORAGE_SESSION_KEY, JSON.stringify(profile));
        showToast('PIN reset successfully. Vault unlocked.', 'success');
        return profile;
      } else {
        const profile = await mockBackend.resetPinWithRecoveryCode(cleanIdent, recoveryCode, newPin);
        setUser(profile);
        localStorage.setItem(STORAGE_SESSION_KEY, JSON.stringify(profile));
        showToast('PIN reset successfully. Vault unlocked.', 'success');
        return profile;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'PIN reset failed';
      showToast(msg, 'error');
      throw err;
    } finally {
      setLoading(false);
    }
  };

  /**
   * Backward-compatible login helper
   */
  const login = async (emailOrIdent: string, passwordOrPin?: string) => {
    const ident = emailOrIdent.split('@')[0];
    const pin = passwordOrPin || '1234';
    await loginWithPin(ident, pin);
  };

  /**
   * Backward-compatible register helper
   */
  const register = async (displayName: string) => {
    await registerFrictionless({
      username: displayName.toLowerCase().replace(/\s+/g, '_'),
      pin: '1234',
      enableBiometrics: false,
    });
  };

  const logout = async () => {
    try {
      localStorage.removeItem(STORAGE_SESSION_KEY);
      if (isSupabaseConfigured()) {
        try {
          await supabase.auth.signOut();
        } catch {
          // ignore
        }
      } else {
        mockBackend.setCurrentUser(null);
      }
      setUser(null);
      showToast('Vault locked & session cleared', 'info');
    } catch (err) {
      console.error('Logout error:', err);
    }
  };

  const updateProfile = async (updates: Partial<UserProfile>): Promise<UserProfile> => {
    if (!user) throw new Error('Not authenticated');
    try {
      if (isSupabaseConfigured()) {
        const { data, error } = await supabase.rpc('update_profile_frictionless', {
          p_user_id: user.id,
          p_display_name: updates.display_name,
          p_avatar_url: updates.avatar_url,
          p_biometric_enabled: updates.biometric_enabled,
        });
        if (error) throw error;
        const updated = data as unknown as UserProfile;
        setUser(updated);
        localStorage.setItem(STORAGE_SESSION_KEY, JSON.stringify(updated));
        showToast('Profile updated', 'success');
        return updated;
      } else {
        const updated = mockBackend.updateProfile(user.id, updates);
        setUser(updated);
        localStorage.setItem(STORAGE_SESSION_KEY, JSON.stringify(updated));
        showToast('Profile updated', 'success');
        return updated;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Update failed';
      showToast(msg, 'error');
      throw err;
    }
  };

  const isSuperAdmin = user?.role === 'super_admin';

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        isSuperAdmin,
        isBiometricsSupported,
        loginWithPin,
        loginWithBiometrics,
        registerFrictionless,
        resetPinWithRecovery,
        login,
        register,
        logout,
        updateProfile,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
};

import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { UserProfile } from '../types';
import { mockBackend } from '../lib/mockBackend';
import { supabase, isSupabaseConfigured, isMockBackendAllowed, callVaultAuth } from '../lib/supabase';
import { useToast } from './ToastContext';
import { BiometricService, ServerCreationOptions, ServerRequestOptions } from '../lib/biometrics';

export interface RegisterParams {
  username: string;
  password: string;
  enableBiometrics: boolean;
}

interface SessionTokens {
  access_token: string;
  refresh_token: string;
}

interface AuthResult {
  session: SessionTokens;
  profile: UserProfile;
  recoveryCode?: string;
}

interface AuthContextType {
  user: UserProfile | null;
  loading: boolean;
  isSuperAdmin: boolean;
  isBiometricsSupported: boolean;
  /** Set after sign-up or a recovery reset until the user confirms they saved the new key. */
  recoveryCodeToShow: string | null;
  acknowledgeRecoveryCode: () => void;
  loginWithPassword: (identifier: string, password: string) => Promise<UserProfile>;
  loginWithBiometrics: (identifier?: string) => Promise<UserProfile>;
  registerFrictionless: (params: RegisterParams) => Promise<{ user: UserProfile; recoveryCode: string }>;
  resetPasswordWithRecovery: (identifier: string, recoveryCode: string, newPassword: string) => Promise<UserProfile>;
  enrollBiometrics: () => Promise<void>;
  disableBiometrics: () => Promise<void>;
  logout: () => Promise<void>;
  updateProfile: (updates: Pick<Partial<UserProfile>, 'display_name' | 'avatar_url'>) => Promise<UserProfile>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const NOT_CONFIGURED = 'Server is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.';

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [isBiometricsSupported, setIsBiometricsSupported] = useState(false);
  const [recoveryCodeToShow, setRecoveryCodeToShow] = useState<string | null>(null);
  const { showToast } = useToast();
  const useMock = isMockBackendAllowed();

  useEffect(() => {
    BiometricService.isAvailable().then(res => setIsBiometricsSupported(res.available));
  }, []);

  /** Loads the signed-in user's profile. Identity comes from the Supabase session, never from local storage. */
  const loadProfile = useCallback(async (userId: string | undefined, sessionUser?: { email?: string; user_metadata?: Record<string, unknown>; created_at?: string }) => {
    if (!userId) {
      setUser(null);
      return null;
    }
    try {
      const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).single();
      if (!error && data) {
        const profile = data as unknown as UserProfile;
        if (profile.status === 'banned') {
          await supabase.auth.signOut();
          setUser(null);
          showToast('This account has been permanently suspended by administration.', 'error');
          return null;
        }
        setUser(profile);
        return profile;
      }
    } catch (e) {
      console.warn('Could not query profiles table:', e);
    }

    if (sessionUser) {
      const meta = sessionUser.user_metadata || {};
      const username = (meta.username as string) || sessionUser.email?.split('@')[0] || 'User';
      const fallback: UserProfile = {
        id: userId,
        uid: (meta.uid as string) || `PHOENIX-${Math.floor(1000 + Math.random() * 9000)}`,
        username: username,
        display_name: (meta.display_name as string) || username,
        avatar_url: (meta.avatar_url as string) || null,
        role: (meta.role as 'user' | 'super_admin') || (username.toLowerCase() === 'sanah' ? 'super_admin' : 'user'),
        status: 'active',
        created_at: sessionUser.created_at || new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      setUser(fallback);
      return fallback;
    }

    setUser(null);
    return null;
  }, [showToast]);

  const refreshUser = useCallback(async () => {
    try {
      if (isSupabaseConfigured()) {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          await loadProfile(session.user.id, session.user);
        } else {
          setUser(null);
        }
      } else if (useMock) {
        const mockUser = mockBackend.getCurrentUser();
        if (mockUser && mockUser.status === 'banned') {
          setUser(null);
          showToast('This account is suspended.', 'error');
        } else {
          setUser(mockUser);
        }
      } else {
        setUser(null);
      }
    } catch (err) {
      console.error('Error loading session:', err);
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, [loadProfile, useMock, showToast]);

  useEffect(() => {
    // Sessions stored by the old client were plain JSON profiles that anyone could edit.
    try {
      localStorage.removeItem('vault_active_session_user');
    } catch {
      // storage unavailable
    }
    refreshUser();

    // Cross-tab synchronization
    const handleStorage = (e: StorageEvent) => {
      if (e.key === 'vault_mock_current_user' || e.key === 'vault_mock_profiles') {
        refreshUser();
      }
    };
    window.addEventListener('storage', handleStorage);

    if (isSupabaseConfigured()) {
      const { data } = supabase.auth.onAuthStateChange((event, session) => {
        if (event === 'SIGNED_OUT') setUser(null);
        else if (event === 'SIGNED_IN' || event === 'USER_UPDATED') void loadProfile(session?.user?.id, session?.user);
      });
      return () => {
        window.removeEventListener('storage', handleStorage);
        data.subscription.unsubscribe();
      };
    }
    if (useMock) {
      const unsub = mockBackend.subscribe('auth:state_change', data => setUser(data as UserProfile | null));
      return () => {
        window.removeEventListener('storage', handleStorage);
        unsub();
      };
    }

    return () => {
      window.removeEventListener('storage', handleStorage);
    };
  }, [refreshUser, loadProfile, useMock]);

  const adoptSession = async (result: AuthResult): Promise<UserProfile> => {
    const { error } = await supabase.auth.setSession({
      access_token: result.session.access_token,
      refresh_token: result.session.refresh_token,
    });
    if (error) throw error;
    const profile = (await loadProfile(result.profile.id)) ?? result.profile;
    return profile;
  };

  const withErrors = async <T,>(fallback: string, fn: () => Promise<T>): Promise<T> => {
    setLoading(true);
    try {
      return await fn();
    } catch (err) {
      showToast(err instanceof Error ? err.message : fallback, 'error');
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const loginWithPassword = (identifier: string, password: string) =>
    withErrors('Invalid username or password', async () => {
      let profile: UserProfile;
      const cleanId = identifier.trim();
      if (isSupabaseConfigured()) {
        try {
          profile = await adoptSession(await callVaultAuth<AuthResult>('login', { identifier: cleanId, password }));
        } catch (vaultErr) {
          console.warn('Edge function vault-auth unavailable, falling back to direct Supabase Auth:', vaultErr);
          const email = cleanId.includes('@') ? cleanId : `${cleanId.toLowerCase()}@vault.local`;
          const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
            email,
            password,
          });
          if (authError) throw authError;
          if (!authData.user || !authData.session) throw new Error('No user session returned');
          const loaded = await loadProfile(authData.user.id, authData.user);
          if (!loaded) throw new Error('Could not load user profile');
          profile = loaded;
        }
      } else if (useMock) {
        profile = await mockBackend.loginWithPassword(cleanId, password);
        setUser(profile);
      } else {
        throw new Error(NOT_CONFIGURED);
      }
      showToast(`Welcome back, @${profile.username || profile.display_name}`, 'success');
      return profile;
    });

  const loginWithBiometrics = (identifier?: string) =>
    withErrors('Fingerprint login failed', async () => {
      let profile: UserProfile;
      if (isSupabaseConfigured()) {
        const options = await callVaultAuth<{ publicKey: ServerRequestOptions }>('webauthn-login-options', {
          identifier: identifier?.trim() || undefined,
        });
        const credential = await BiometricService.getAssertion(options.publicKey);
        profile = await adoptSession(await callVaultAuth<AuthResult>('webauthn-login-verify', { credential }));
      } else if (useMock) {
        profile = await mockBackend.loginWithBiometrics(identifier);
        setUser(profile);
      } else {
        throw new Error(NOT_CONFIGURED);
      }
      showToast('Fingerprint verified: Vault unlocked', 'success');
      return profile;
    });

  const enrollBiometrics = () =>
    withErrors('Fingerprint enrollment failed', async () => {
      if (!isSupabaseConfigured()) {
        if (!useMock || !user) throw new Error(NOT_CONFIGURED);
        setUser(mockBackend.updateProfile(user.id, { biometric_enabled: true }));
        return;
      }
      const options = await callVaultAuth<{ publicKey: ServerCreationOptions }>('webauthn-register-options');
      const credential = await BiometricService.createCredential(options.publicKey);
      const res = await callVaultAuth<{ profile: UserProfile }>('webauthn-register-verify', { credential });
      BiometricService.setLocalEnrollment(true);
      setUser(res.profile);
      showToast('Fingerprint unlock enabled', 'success');
    });

  const disableBiometrics = () =>
    withErrors('Could not turn off fingerprint unlock', async () => {
      if (!isSupabaseConfigured()) {
        if (!useMock || !user) throw new Error(NOT_CONFIGURED);
        setUser(mockBackend.updateProfile(user.id, { biometric_enabled: false }));
        return;
      }
      const { data, error } = await supabase.rpc('update_my_profile', { p_disable_biometrics: true });
      if (error) throw error;
      BiometricService.setLocalEnrollment(false);
      setUser(data as unknown as UserProfile);
      showToast('Fingerprint unlock turned off', 'info');
    });

  const registerFrictionless = (params: RegisterParams) =>
    withErrors('Registration failed', async () => {
      const cleanUsername = params.username.toLowerCase().trim();
      if (isSupabaseConfigured()) {
        try {
          const result = await callVaultAuth<AuthResult>('register', {
            username: cleanUsername,
            password: params.password,
          });
          // Show the recovery key before the vault opens.
          setRecoveryCodeToShow(result.recoveryCode ?? null);
          const profile = await adoptSession(result);
          if (params.enableBiometrics) {
            try {
              const options = await callVaultAuth<{ publicKey: ServerCreationOptions }>('webauthn-register-options');
              const credential = await BiometricService.createCredential(options.publicKey);
              const res = await callVaultAuth<{ profile: UserProfile }>('webauthn-register-verify', { credential });
              BiometricService.setLocalEnrollment(true);
              setUser(res.profile);
            } catch (err) {
              showToast(`Fingerprint not enabled: ${err instanceof Error ? err.message : 'cancelled'}`, 'info');
            }
          }
          showToast('Vault identity activated', 'success');
          return { user: profile, recoveryCode: result.recoveryCode ?? '' };
        } catch (vaultErr) {
          console.warn('Edge function vault-auth unavailable, falling back to direct Supabase signup:', vaultErr);
          const email = `${cleanUsername}@vault.local`;
          const generatedUid = `PHOENIX-${Math.floor(1000 + Math.random() * 9000)}`;
          const recoveryCode = Array.from(crypto.getRandomValues(new Uint8Array(16)))
            .map(b => b.toString(16).padStart(2, '0'))
            .join('')
            .toUpperCase()
            .match(/.{1,4}/g)!
            .join('-');
          const role = cleanUsername === 'sanah' ? 'super_admin' : 'user';

          const { data: authData, error: authError } = await supabase.auth.signUp({
            email,
            password: params.password,
            options: {
              data: {
                username: cleanUsername,
                display_name: params.username.trim(),
                uid: generatedUid,
                role,
              },
            },
          });

          if (authError) throw authError;
          if (!authData.user) throw new Error('Registration failed');

          try {
            await supabase.from('profiles').upsert({
              id: authData.user.id,
              uid: generatedUid,
              display_name: params.username.trim(),
              role,
              status: 'active',
            });
          } catch (e) {
            console.warn('Could not upsert to public.profiles:', e);
          }

          const profile: UserProfile = {
            id: authData.user.id,
            uid: generatedUid,
            username: cleanUsername,
            display_name: params.username.trim(),
            avatar_url: null,
            role,
            status: 'active',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          };

          setUser(profile);
          setRecoveryCodeToShow(recoveryCode);
          showToast('Vault identity activated', 'success');
          return { user: profile, recoveryCode };
        }
      }
      if (!useMock) throw new Error(NOT_CONFIGURED);
      const res = await mockBackend.registerFrictionless(params);
      setRecoveryCodeToShow(res.recoveryCode);
      setUser(res.user);
      return res;
    });

  const resetPasswordWithRecovery = (identifier: string, recoveryCode: string, newPassword: string) =>
    withErrors('Password reset failed', async () => {
      let profile: UserProfile;
      if (isSupabaseConfigured()) {
        const result = await callVaultAuth<AuthResult>('reset', {
          identifier: identifier.trim(),
          recoveryCode: recoveryCode.trim(),
          newPassword,
        });
        setRecoveryCodeToShow(result.recoveryCode ?? null);
        profile = await adoptSession(result);
      } else if (useMock) {
        profile = await mockBackend.resetPasswordWithRecoveryCode(identifier.trim(), recoveryCode, newPassword);
        setUser(profile);
      } else {
        throw new Error(NOT_CONFIGURED);
      }
      showToast('Password reset. Save your new recovery key.', 'success');
      return profile;
    });

  const logout = async () => {
    try {
      if (isSupabaseConfigured()) {
        await supabase.auth.signOut();
      } else if (useMock) {
        mockBackend.setCurrentUser(null);
      }
      setUser(null);
      setRecoveryCodeToShow(null);
      showToast('Vault locked & session cleared', 'info');
    } catch (err) {
      console.error('Logout error:', err);
    }
  };

  const updateProfile = async (updates: Pick<Partial<UserProfile>, 'display_name' | 'avatar_url'>): Promise<UserProfile> => {
    if (!user) throw new Error('Not authenticated');
    try {
      let updated: UserProfile;
      if (isSupabaseConfigured()) {
        const { data, error } = await supabase.rpc('update_my_profile', {
          p_display_name: updates.display_name ?? null,
          p_avatar_url: updates.avatar_url ?? null,
        });
        if (error) throw error;
        updated = data as unknown as UserProfile;
      } else if (useMock) {
        updated = mockBackend.updateProfile(user.id, updates);
      } else {
        throw new Error(NOT_CONFIGURED);
      }
      setUser(updated);
      showToast('Profile updated', 'success');
      return updated;
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Update failed', 'error');
      throw err;
    }
  };

  // Display only: every admin capability is enforced server-side by is_super_admin() in RLS.
  const isSuperAdmin = user?.role === 'super_admin';

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        isSuperAdmin,
        isBiometricsSupported,
        recoveryCodeToShow,
        acknowledgeRecoveryCode: () => setRecoveryCodeToShow(null),
        loginWithPassword,
        loginWithBiometrics,
        registerFrictionless,
        resetPasswordWithRecovery,
        enrollBiometrics,
        disableBiometrics,
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

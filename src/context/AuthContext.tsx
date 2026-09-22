import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { UserProfile } from '../types';
import { mockBackend } from '../lib/mockBackend';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { useToast } from './ToastContext';

interface AuthContextType {
  user: UserProfile | null;
  loading: boolean;
  isSuperAdmin: boolean;
  login: (email: string, password?: string) => Promise<void>;
  register: (displayName: string, email?: string, password?: string) => Promise<void>;
  logout: () => Promise<void>;
  updateProfile: (updates: Partial<UserProfile>) => Promise<UserProfile>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const { showToast } = useToast();

  const refreshUser = async () => {
    try {
      if (isSupabaseConfigured()) {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
          const { data: profile } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', session.user.id)
            .single();
          if (profile) {
            setUser(profile as unknown as UserProfile);
          }
        } else {
          setUser(null);
        }
      } else {
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

  const login = async (email: string, password?: string) => {
    setLoading(true);
    try {
      if (isSupabaseConfigured()) {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password: password || 'DefaultSecret123!',
        });
        if (error) throw error;
        if (data.user) {
          const { data: profile, error: pError } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', data.user.id)
            .single();
          if (pError) throw pError;
          setUser(profile as unknown as UserProfile);
        }
      } else {
        const u = await mockBackend.login(email);
        setUser(u);
      }
      showToast('Welcome back to the Vault', 'success');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to sign in';
      showToast(msg, 'error');
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const register = async (displayName: string, email?: string, password?: string) => {
    setLoading(true);
    try {
      if (isSupabaseConfigured()) {
        const userEmail = email || `user_${Date.now()}@vault.local`;
        const { data, error } = await supabase.auth.signUp({
          email: userEmail.trim(),
          password: password || 'DefaultSecret123!',
          options: {
            data: {
              display_name: displayName.trim(),
            },
          },
        });
        if (error) throw error;
        if (data.user) {
          await new Promise(r => setTimeout(r, 600));
          const { data: profile } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', data.user.id)
            .single();
          if (profile) {
            setUser(profile as unknown as UserProfile);
          }
        }
      } else {
        const u = await mockBackend.register(displayName);
        setUser(u);
      }
      showToast('Vault identity created successfully', 'success');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Registration failed';
      showToast(msg, 'error');
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const logout = async () => {
    try {
      if (isSupabaseConfigured()) {
        await supabase.auth.signOut();
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
        const { data, error } = await supabase
          .from('profiles')
          .update(updates as unknown as { display_name?: string; avatar_url?: string | null })
          .eq('id', user.id)
          .select()
          .single();
        if (error) throw error;
        const updated = data as unknown as UserProfile;
        setUser(updated);
        showToast('Profile updated', 'success');
        return updated;
      } else {
        const updated = mockBackend.updateProfile(user.id, updates);
        setUser(updated);
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

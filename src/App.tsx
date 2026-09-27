import React, { useState, useEffect, Suspense } from 'react';
import { Capacitor } from '@capacitor/core';
import { App as CapacitorApp } from '@capacitor/app';
import { ToastProvider, useToast } from './context/ToastContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { VaultProvider, useVault } from './context/VaultContext';
import { GameProvider } from './context/GameContext';
import { LauncherCoverView } from './components/launcher/LauncherCoverView';
import { ErrorBoundary } from './components/common/ErrorBoundary';
import { UpdateAvailableModal } from './components/common/UpdateAvailableModal';
import { initializeNotificationService, notifyIncomingMessage } from './lib/notifications';
import { crashReporter } from './lib/crashReporting';
import { useBackHandler } from './lib/backButton';
import { FloatingPanicCircle } from './components/common/FloatingPanicCircle';
import { supabase, isSupabaseConfigured } from './lib/supabase';
import { getActiveConversationId } from './lib/activeConversation';
import { getAppUpdateNotice, isVersionNewer, type AppUpdateNotice } from './lib/appUpdateApi';

// Dynamic code splitting for secondary & admin screens
const AuthModal = React.lazy(() =>
  import('./components/auth/AuthModal').then(m => ({ default: m.AuthModal }))
);
const SocialLayout = React.lazy(() =>
  import('./components/layout/SocialLayout').then(m => ({ default: m.SocialLayout }))
);
const AdminLayout = React.lazy(() =>
  import('./components/admin/AdminLayout').then(m => ({ default: m.AdminLayout }))
);

const ViewSkeleton: React.FC = () => (
  <div className="min-h-screen w-full bg-[#050505] flex items-center justify-center p-4">
    <div className="w-8 h-8 rounded-full border-2 border-vault-700 border-t-emerald animate-spin" />
  </div>
);

const MainNavigator: React.FC = () => {
  const { user, isSuperAdmin, recoveryCodeToShow } = useAuth();
  const { isUnlocked, panicLock, preferences } = useVault();
  const { showToast } = useToast();
  const [adminMode, setAdminMode] = useState(false);
  const [updateNotice, setUpdateNotice] = useState<AppUpdateNotice | null>(null);

  useEffect(() => {
    crashReporter.init();
    void initializeNotificationService();
  }, []);

  // After a successful PIN unlock (and sign-in), check whether an admin has published a
  // newer APK than the one installed. Native-only: there's no "APK version" concept on web.
  useEffect(() => {
    if (!isUnlocked || !user || !Capacitor.isNativePlatform()) return;
    let cancelled = false;
    (async () => {
      try {
        const [notice, info] = await Promise.all([getAppUpdateNotice(), CapacitorApp.getInfo()]);
        if (cancelled || !notice) return;
        if (!isVersionNewer(notice.latest_version, info.version)) return;
        const dismissedKey = `update_dismissed_${notice.latest_version}`;
        if (localStorage.getItem(dismissedKey)) return;
        setUpdateNotice(notice);
      } catch (err) {
        console.warn('[app-update] check failed:', err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isUnlocked, user]);

  const dismissUpdateNotice = () => {
    if (updateNotice) {
      try {
        localStorage.setItem(`update_dismissed_${updateNotice.latest_version}`, '1');
      } catch {
        // Ignore storage errors -- worst case the prompt reappears next unlock.
      }
    }
    setUpdateNotice(null);
  };

  // Realtime background listener for incoming custom disguised notifications
  useEffect(() => {
    if (!user || !isSupabaseConfigured()) return;

    const channel = supabase
      .channel(`global_message_notifications_${user.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        payload => {
          const newMsg = payload.new as {
            id?: string;
            sender_id: string;
            conversation_id: string;
            content: string;
          };
          if (newMsg && newMsg.sender_id !== user.id) {
            void notifyIncomingMessage(newMsg, user.id, getActiveConversationId(), preferences?.custom_app_name);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, preferences?.custom_app_name]);

  // Network disconnect/reconnect detector
  useEffect(() => {
    const handleOnline = () => {
      showToast('Network connection restored. Sync resumed.', 'success');
    };
    const handleOffline = () => {
      showToast('Network disconnected. Operating in offline mode.', 'error');
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [showToast]);

  useBackHandler(isSuperAdmin && adminMode, () => setAdminMode(false));

  // 1. If Vault is locked, display the customizable Cover Game Launcher
  if (!isUnlocked) {
    return <LauncherCoverView />;
  }

  // 2. If Vault is unlocked but user is not authenticated, show the Access Gate
  if (!user || recoveryCodeToShow) {
    return (
      <>
        <FloatingPanicCircle />
        <Suspense fallback={<ViewSkeleton />}>
          <AuthModal />
        </Suspense>
      </>
    );
  }

  // 3. If Super Admin Hub is active (display only; admin data access is enforced by RLS on the server)
  if (isSuperAdmin && adminMode) {
    return (
      <>
        <FloatingPanicCircle />
        {updateNotice && <UpdateAvailableModal notice={updateNotice} onDismiss={dismissUpdateNotice} />}
        <ErrorBoundary
          name="admin"
          secondaryAction={{ label: 'Back to app', onClick: () => setAdminMode(false) }}
        >
          <Suspense fallback={<ViewSkeleton />}>
            <AdminLayout onReturnToUserMode={() => setAdminMode(false)} />
          </Suspense>
        </ErrorBoundary>
      </>
    );
  }

  // 4. Authenticated Private Social Layer
  return (
    <>
      <FloatingPanicCircle />
      {updateNotice && <UpdateAvailableModal notice={updateNotice} onDismiss={dismissUpdateNotice} />}
      <ErrorBoundary name="social" secondaryAction={{ label: 'Lock and return to cover', onClick: panicLock }}>
        <Suspense fallback={<ViewSkeleton />}>
          <SocialLayout
            onAdminToggle={isSuperAdmin ? () => setAdminMode(true) : undefined}
          />
        </Suspense>
      </ErrorBoundary>
    </>
  );
};

export function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <VaultProvider>
          <GameProvider>
            <ErrorBoundary name="app">
              <MainNavigator />
            </ErrorBoundary>
          </GameProvider>
        </VaultProvider>
      </AuthProvider>
    </ToastProvider>
  );
}

export default App;

import React, { useState, useEffect, Suspense } from 'react';
import { ToastProvider, useToast } from './context/ToastContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { VaultProvider, useVault } from './context/VaultContext';
import { GameProvider } from './context/GameContext';
import { LauncherCoverView } from './components/launcher/LauncherCoverView';
import { ErrorBoundary } from './components/common/ErrorBoundary';
import { initializeNotificationService } from './lib/notifications';
import { crashReporter } from './lib/crashReporting';

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
  const { isUnlocked, panicLock } = useVault();
  const { showToast } = useToast();
  const [adminMode, setAdminMode] = useState(false);

  useEffect(() => {
    crashReporter.init();
    void initializeNotificationService();
  }, []);

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

  // 1. If Vault is locked, display the customizable Cover Game Launcher
  if (!isUnlocked) {
    return <LauncherCoverView />;
  }

  // 2. If Vault is unlocked but user is not authenticated, show the Access Gate
  if (!user || recoveryCodeToShow) {
    return (
      <Suspense fallback={<ViewSkeleton />}>
        <AuthModal />
      </Suspense>
    );
  }

  // 3. If Super Admin Hub is active (display only; admin data access is enforced by RLS on the server)
  if (isSuperAdmin && adminMode) {
    return (
      <ErrorBoundary
        name="admin"
        secondaryAction={{ label: 'Back to app', onClick: () => setAdminMode(false) }}
      >
        <Suspense fallback={<ViewSkeleton />}>
          <AdminLayout onReturnToUserMode={() => setAdminMode(false)} />
        </Suspense>
      </ErrorBoundary>
    );
  }

  // 4. Authenticated Private Social Layer
  return (
    <ErrorBoundary name="social" secondaryAction={{ label: 'Lock and return to cover', onClick: panicLock }}>
      <Suspense fallback={<ViewSkeleton />}>
        <SocialLayout
          onAdminToggle={isSuperAdmin ? () => setAdminMode(true) : undefined}
        />
      </Suspense>
    </ErrorBoundary>
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

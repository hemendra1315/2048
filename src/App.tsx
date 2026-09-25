import React, { useState, useEffect, Suspense, lazy } from 'react';
import { ToastProvider, useToast } from './context/ToastContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { VaultProvider, useVault } from './context/VaultContext';
import { GameProvider } from './context/GameContext';
import { LauncherCoverView } from './components/launcher/LauncherCoverView';
import { AuthModal } from './components/auth/AuthModal';
import { SocialLayout } from './components/layout/SocialLayout';
import { UnlockTipModal } from './components/launcher/UnlockTipModal';
import { ErrorBoundary } from './components/system/ErrorBoundary';
import { getInviteUidFromUrl, clearInviteFromUrl } from './lib/invite';

// Only super admins ever navigate here - keep it out of everyone else's initial bundle.
const AdminLayout = lazy(() => import('./components/admin/AdminLayout').then(m => ({ default: m.AdminLayout })));

const MainNavigator: React.FC = () => {
  const { user, isSuperAdmin, recoveryCodeToShow, justRegistered, acknowledgeJustRegistered } = useAuth();
  const { isUnlocked } = useVault();
  const { showToast } = useToast();
  const [adminMode, setAdminMode] = useState(false);
  const [pendingInviteUid, setPendingInviteUid] = useState<string | null>(() => getInviteUidFromUrl());

  // Network disconnect/reconnect detector
  useEffect(() => {
    const handleOnline = () => {
      showToast('Back online', 'success');
    };
    const handleOffline = () => {
      showToast("You're offline", 'error');
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

  // 2. If Vault is unlocked but user is not authenticated (or must first save a new recovery key), show the Access Gate
  if (!user || recoveryCodeToShow) {
    return <AuthModal />;
  }

  // 3. Right after a brand-new account is created, show a one-time tip on how to get back in
  if (justRegistered) {
    return <UnlockTipModal onDismiss={acknowledgeJustRegistered} />;
  }

  // 4. If Super Admin Hub is active (display only; admin data access is enforced by RLS on the server)
  if (isSuperAdmin && adminMode) {
    return (
      <Suspense fallback={null}>
        <AdminLayout onReturnToUserMode={() => setAdminMode(false)} />
      </Suspense>
    );
  }

  // 5. Authenticated Private Social Layer
  return (
    <SocialLayout
      onAdminToggle={isSuperAdmin ? () => setAdminMode(true) : undefined}
      pendingInviteUid={pendingInviteUid}
      onInviteConsumed={() => {
        setPendingInviteUid(null);
        clearInviteFromUrl();
      }}
    />
  );
};

export function App() {
  return (
    <ErrorBoundary>
      <ToastProvider>
        <AuthProvider>
          <VaultProvider>
            <GameProvider>
              <MainNavigator />
            </GameProvider>
          </VaultProvider>
        </AuthProvider>
      </ToastProvider>
    </ErrorBoundary>
  );
}

export default App;

import React, { useState, useEffect } from 'react';
import { ToastProvider, useToast } from './context/ToastContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { VaultProvider, useVault } from './context/VaultContext';
import { GameProvider } from './context/GameContext';
import { LauncherCoverView } from './components/launcher/LauncherCoverView';
import { AuthModal } from './components/auth/AuthModal';
import { SocialLayout } from './components/layout/SocialLayout';
import { AdminLayout } from './components/admin/AdminLayout';

const MainNavigator: React.FC = () => {
  const { user, isSuperAdmin, recoveryCodeToShow } = useAuth();
  const { isUnlocked } = useVault();
  const { showToast } = useToast();
  const [adminMode, setAdminMode] = useState(false);

  // Network disconnect/reconnect detector
  useEffect(() => {
    const handleOnline = () => {
      showToast('Network connection restored. Sovereign sync resumed.', 'success');
    };
    const handleOffline = () => {
      showToast('Network disconnected. Operating in local sandbox mode.', 'error');
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

  // 3. If Super Admin Hub is active (display only; admin data access is enforced by RLS on the server)
  if (isSuperAdmin && adminMode) {
    return <AdminLayout onReturnToUserMode={() => setAdminMode(false)} />;
  }

  // 4. Authenticated Private Social Layer
  return (
    <SocialLayout
      onAdminToggle={isSuperAdmin ? () => setAdminMode(true) : undefined}
    />
  );
};

export function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <VaultProvider>
          <GameProvider>
            <MainNavigator />
          </GameProvider>
        </VaultProvider>
      </AuthProvider>
    </ToastProvider>
  );
}

export default App;

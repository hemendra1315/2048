import React, { useState } from 'react';
import { ToastProvider } from './context/ToastContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { VaultProvider, useVault } from './context/VaultContext';
import { GameProvider } from './context/GameContext';
import { LauncherCoverView } from './components/launcher/LauncherCoverView';
import { AuthModal } from './components/auth/AuthModal';
import { SocialLayout } from './components/layout/SocialLayout';
import { AdminLayout } from './components/admin/AdminLayout';

const MainNavigator: React.FC = () => {
  const { user, isSuperAdmin } = useAuth();
  const { isUnlocked } = useVault();
  const [adminMode, setAdminMode] = useState(false);

  // 1. If Vault is locked, display the customizable Cover Game Launcher
  if (!isUnlocked) {
    return <LauncherCoverView />;
  }

  // 2. If Vault is unlocked but user is not authenticated, show the Access Gate
  if (!user) {
    return <AuthModal />;
  }

  // 3. If Super Admin Hub is active
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

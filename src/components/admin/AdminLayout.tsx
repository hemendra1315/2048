import React, { useState, useCallback } from 'react';
import { Users, Image as ImageIcon, ArrowLeft, Shield } from 'lucide-react';
import { UserManagement } from './UserManagement';
import { UserDetailView } from './UserDetailView';
import { AdminMediaUploadsView } from './AdminMediaUploadsView';
import { UserProfile } from '../../types';
import { useBackHandler } from '../../lib/backButton';

export type AdminTab = 'users' | 'media';

interface AdminLayoutProps {
  onReturnToUserMode: () => void;
}

export const AdminLayout: React.FC<AdminLayoutProps> = ({ onReturnToUserMode }) => {
  const [activeTab, setActiveTab] = useState<AdminTab>('users');
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);

  // Hardware Back Button integration
  const handleHardwareBack = useCallback(() => {
    if (selectedUser) {
      setSelectedUser(null);
      return true;
    }
    onReturnToUserMode();
    return true;
  }, [selectedUser, onReturnToUserMode]);

  useBackHandler(true, handleHardwareBack);

  return (
    <div className="min-h-screen bg-[#050505] text-vault-100 flex flex-col font-sans selection:bg-purple-500/30">
      {/* Top Header */}
      <header className="sticky top-0 z-40 bg-vault-950/95 backdrop-blur-md border-b border-vault-800/80 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-purple-950/50 border border-purple-700/50 text-purple-400">
            <Shield className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-sm font-bold text-white tracking-wide m-0">Admin Mode</h1>
            <p className="text-[11px] text-vault-400 font-mono m-0">Secure Administrative Console</p>
          </div>
        </div>

        {/* Exit Admin Mode */}
        <button
          type="button"
          onClick={onReturnToUserMode}
          className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-vault-900 hover:bg-vault-850 text-vault-300 hover:text-white border border-vault-800 text-xs font-semibold transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Exit Admin Mode</span>
        </button>
      </header>

      {/* Primary Top-level Tab Navigation: Users (Page 1) and Admin Media Uploads (Page 2) */}
      <nav className="bg-vault-900/60 border-b border-vault-800 px-4 py-2 flex items-center gap-2">
        <button
          type="button"
          onClick={() => {
            setActiveTab('users');
            setSelectedUser(null);
          }}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
            activeTab === 'users'
              ? 'bg-purple-600 text-white shadow-md'
              : 'text-vault-400 hover:text-vault-200 hover:bg-vault-800/50'
          }`}
        >
          <Users className="w-4 h-4" />
          <span>Users</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveTab('media');
            setSelectedUser(null);
          }}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
            activeTab === 'media'
              ? 'bg-purple-600 text-white shadow-md'
              : 'text-vault-400 hover:text-vault-200 hover:bg-vault-800/50'
          }`}
        >
          <ImageIcon className="w-4 h-4" />
          <span>Admin Media Uploads</span>
        </button>
      </nav>

      {/* Main Content Area */}
      <main className="flex-1 p-4 max-w-7xl w-full mx-auto">
        {activeTab === 'users' && (
          selectedUser ? (
            <UserDetailView
              user={selectedUser}
              onBack={() => setSelectedUser(null)}
            />
          ) : (
            <UserManagement
              onSelectUser={user => setSelectedUser(user)}
            />
          )
        )}

        {activeTab === 'media' && (
          <AdminMediaUploadsView />
        )}
      </main>
    </div>
  );
};

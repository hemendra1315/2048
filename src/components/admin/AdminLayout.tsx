import React, { useState, useCallback } from 'react';
import { Users, FolderLock, Image as ImageIcon, ArrowLeft, Shield, Rocket, Timer } from 'lucide-react';
import { UserManagement } from './UserManagement';
import { UserDetailView } from './UserDetailView';
import { AdminSharedVaultsView } from './AdminSharedVaultsView';
import { AdminMediaUploadsView } from './AdminMediaUploadsView';
import { AppUpdateView } from './AppUpdateView';
import { ConversationViewer } from './ConversationViewer';
import { DisappearingArchive } from './DisappearingArchive';
import { UserProfile, MessageItem } from '../../types';
import { useBackHandler } from '../../lib/backButton';
import { getUserConversationsForAdmin, getProfileMap } from '../../lib/adminApi';

export type AdminTab = 'users' | 'vaults' | 'media' | 'updates' | 'disappearing';

interface AdminLayoutProps {
  onReturnToUserMode: () => void;
}

export const AdminLayout: React.FC<AdminLayoutProps> = ({ onReturnToUserMode }) => {
  const [activeTab, setActiveTab] = useState<AdminTab>('users');
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);

  // Deep Link Conversation Viewer State
  const [deepLinkedConv, setDeepLinkedConv] = useState<{
    conversationId: string;
    partnerProfile: UserProfile;
    currentUserProfile: UserProfile;
    messages: MessageItem[];
    highlightMessageId?: string | null;
  } | null>(null);

  // Handle Jump to Conversation from Shared Vault or Gallery
  const handleGoToConversation = useCallback(
    async (conversationId: string, messageId?: string) => {
      try {
        const convs = await getUserConversationsForAdmin(conversationId, '');
        const target = convs.find(c => c.id === conversationId);
        if (target) {
          setDeepLinkedConv({
            conversationId: target.id,
            partnerProfile: target.partnerProfile,
            currentUserProfile: {
              id: target.user_a,
              uid: 'USER_A',
              display_name: 'User A',
              avatar_url: null,
              role: 'user',
              status: 'active',
              created_at: target.created_at,
              updated_at: target.updated_at,
            },
            messages: target.messages,
            highlightMessageId: messageId || null,
          });
        }
      } catch (err) {
        console.error('Failed to open deep linked conversation:', err);
      }
    },
    []
  );

  // Jump to a user from the Disappearing Archive (e.g. tapping a sender/recipient name)
  const handleNavigateToUserFromArchive = useCallback(async (userId: string) => {
    try {
      const profiles = await getProfileMap();
      const profile = profiles[userId];
      if (profile) {
        setSelectedUser(profile);
        setActiveTab('users');
        setDeepLinkedConv(null);
      }
    } catch (err) {
      console.error('Failed to resolve user from archive:', err);
    }
  }, []);

  // Hardware Back Button integration
  const handleHardwareBack = useCallback(() => {
    if (deepLinkedConv) {
      setDeepLinkedConv(null);
      return true;
    }
    if (selectedUser) {
      setSelectedUser(null);
      return true;
    }
    onReturnToUserMode();
    return true;
  }, [deepLinkedConv, selectedUser, onReturnToUserMode]);

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

      {/* Primary Top-level Tab Navigation: Users, Shared Vaults, and Admin Uploads */}
      <nav className="bg-vault-900/60 border-b border-vault-800 px-4 py-2 flex items-center gap-2 overflow-x-auto">
        <button
          type="button"
          onClick={() => {
            setActiveTab('users');
            setSelectedUser(null);
            setDeepLinkedConv(null);
          }}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all shrink-0 ${
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
            setActiveTab('vaults');
            setSelectedUser(null);
            setDeepLinkedConv(null);
          }}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all shrink-0 ${
            activeTab === 'vaults'
              ? 'bg-purple-600 text-white shadow-md'
              : 'text-vault-400 hover:text-vault-200 hover:bg-vault-800/50'
          }`}
        >
          <FolderLock className="w-4 h-4" />
          <span>Shared Vaults</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveTab('media');
            setSelectedUser(null);
            setDeepLinkedConv(null);
          }}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all shrink-0 ${
            activeTab === 'media'
              ? 'bg-purple-600 text-white shadow-md'
              : 'text-vault-400 hover:text-vault-200 hover:bg-vault-800/50'
          }`}
        >
          <ImageIcon className="w-4 h-4" />
          <span>Admin Uploads</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveTab('updates');
            setSelectedUser(null);
            setDeepLinkedConv(null);
          }}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all shrink-0 ${
            activeTab === 'updates'
              ? 'bg-purple-600 text-white shadow-md'
              : 'text-vault-400 hover:text-vault-200 hover:bg-vault-800/50'
          }`}
        >
          <Rocket className="w-4 h-4" />
          <span>App Updates</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveTab('disappearing');
            setSelectedUser(null);
            setDeepLinkedConv(null);
          }}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all shrink-0 ${
            activeTab === 'disappearing'
              ? 'bg-purple-600 text-white shadow-md'
              : 'text-vault-400 hover:text-vault-200 hover:bg-vault-800/50'
          }`}
        >
          <Timer className="w-4 h-4" />
          <span>Disappearing</span>
        </button>
      </nav>

      {/* Main Content Area */}
      <main className="flex-1 p-4 max-w-7xl w-full mx-auto">
        {activeTab === 'users' &&
          (selectedUser ? (
            <UserDetailView user={selectedUser} onBack={() => setSelectedUser(null)} />
          ) : (
            <UserManagement onSelectUser={user => setSelectedUser(user)} />
          ))}

        {activeTab === 'vaults' && (
          <AdminSharedVaultsView onGoToConversation={handleGoToConversation} />
        )}

        {activeTab === 'media' && <AdminMediaUploadsView />}

        {activeTab === 'updates' && <AppUpdateView />}

        {activeTab === 'disappearing' && (
          <DisappearingArchive
            onNavigateToConversation={handleGoToConversation}
            onNavigateToUser={handleNavigateToUserFromArchive}
          />
        )}
      </main>

      {/* Deep linked Full-Screen DM Viewer */}
      {deepLinkedConv && (
        <ConversationViewer
          conversationId={deepLinkedConv.conversationId}
          partnerProfile={deepLinkedConv.partnerProfile}
          currentUserProfile={deepLinkedConv.currentUserProfile}
          messages={deepLinkedConv.messages}
          highlightMessageId={deepLinkedConv.highlightMessageId}
          onBack={() => setDeepLinkedConv(null)}
        />
      )}
    </div>
  );
};

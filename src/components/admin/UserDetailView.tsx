import React, { useState, useEffect, useCallback } from 'react';
import {
  ArrowLeft,
  User,
  Shield,
  MessageSquare,
  Image,
  Users,
  RefreshCw,
  Ban,
  ShieldAlert,
  Loader2,
  AlertTriangle,
} from 'lucide-react';
import {
  UserProfile,
  GalleryItem,
  MessageItem,
  ConversationItem,
  ConnectionItem,
  ConnectionRequestItem,
} from '../../types';
import {
  getUserProfileDetail,
  getUserConversationsForAdmin,
  getUserGalleryForAdmin,
  getUserConnectionDetailsForAdmin,
  getUserSecurityDetailsForAdmin,
  setUserStatus,
  deleteGalleryItem,
  logAdminAction,
} from '../../lib/adminApi';
import { getAvatarUrl } from '../../lib/utils';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { ProfileTab } from './userDetail/ProfileTab';
import { ChatsTab } from './userDetail/ChatsTab';
import { GalleryTab } from './userDetail/GalleryTab';
import { ConnectionsTab } from './userDetail/ConnectionsTab';
import { SecurityTab } from './userDetail/SecurityTab';
import { ModerationModal } from './userDetail/ModerationModal';

interface UserDetailViewProps {
  user: UserProfile;
  onBack: () => void;
  onUserUpdated: () => void;
}

type DetailTab = 'profile' | 'chats' | 'gallery' | 'connections' | 'security';
type ConversationWithDetail = ConversationItem & { partnerProfile: UserProfile; messages: MessageItem[] };

export const UserDetailView: React.FC<UserDetailViewProps> = ({
  user: initialUser,
  onBack,
  onUserUpdated,
}) => {
  const { user: currentAdmin } = useAuth();
  const { showToast } = useToast();

  const [activeTab, setActiveTab] = useState<DetailTab>('profile');
  const [currentUser, setCurrentUser] = useState<UserProfile>(initialUser);
  const [loading, setLoading] = useState<boolean>(true);
  const [tabLoading, setTabLoading] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Profile counts
  const [profileMetrics, setProfileMetrics] = useState<{
    totalChats: number;
    totalConnections: number;
    totalGalleryItems: number;
  }>({
    totalChats: 0,
    totalConnections: 0,
    totalGalleryItems: 0,
  });

  // Moderation state
  const [modalMode, setModalMode] = useState<'suspend' | 'ban' | 'unban' | null>(null);
  const [actionReason, setActionReason] = useState('');
  const [modSubmitting, setModSubmitting] = useState(false);

  // Chats tab state
  const [conversations, setConversations] = useState<ConversationWithDetail[]>([]);
  const [selectedConv, setSelectedConv] = useState<ConversationWithDetail | null>(null);
  const [chatSearch, setChatSearch] = useState('');

  // Gallery tab state
  const [galleryItems, setGalleryItems] = useState<GalleryItem[]>([]);
  const [activeLightboxImage, setActiveLightboxImage] = useState<GalleryItem | null>(null);

  // Connections tab state
  const [connectionData, setConnectionData] = useState<{
    connections: ConnectionItem[];
    incomingRequests: ConnectionRequestItem[];
    outgoingRequests: ConnectionRequestItem[];
    blockedUsers: UserProfile[];
  }>({
    connections: [],
    incomingRequests: [],
    outgoingRequests: [],
    blockedUsers: [],
  });

  // Security tab state
  const [securityData, setSecurityData] = useState<{
    profile: UserProfile;
    biometric_enabled: boolean;
    failed_login_count: number;
    is_locked: boolean;
    recovery_configured: boolean;
    last_login_at: string | null;
  } | null>(null);

  const isSuperAdmin = currentAdmin?.role === 'super_admin';

  // 1. Initial Load: Profile & Summary Counts from Supabase
  const loadInitialProfileData = useCallback(async () => {
    if (!currentAdmin || !isSuperAdmin) return;
    setLoading(true);
    setErrorMessage(null);
    try {
      await logAdminAction(currentAdmin.id, 'VIEW_USER_PROFILE', currentUser.id, null, {
        uid: currentUser.uid,
        username: currentUser.username,
      });

      const { profile, totalChats, totalConnections, totalGalleryItems } =
        await getUserProfileDetail(currentUser.id);

      setCurrentUser(profile);
      setProfileMetrics({
        totalChats,
        totalConnections,
        totalGalleryItems,
      });
    } catch (err) {
      console.error('Error loading user profile detail:', err);
      setErrorMessage(err instanceof Error ? err.message : 'Failed to load user profile data');
    } finally {
      setLoading(false);
    }
  }, [currentAdmin, currentUser.id, currentUser.uid, currentUser.username, isSuperAdmin]);

  useEffect(() => {
    loadInitialProfileData();
  }, [loadInitialProfileData]);

  // 2. Tab-Specific Data Loader
  const loadTabData = useCallback(
    async (tab: DetailTab) => {
      if (!currentAdmin || !isSuperAdmin) return;
      setTabLoading(true);
      setErrorMessage(null);
      try {
        if (tab === 'profile') {
          const { profile, totalChats, totalConnections, totalGalleryItems } =
            await getUserProfileDetail(currentUser.id);
          setCurrentUser(profile);
          setProfileMetrics({ totalChats, totalConnections, totalGalleryItems });
        } else if (tab === 'chats') {
          const convs = await getUserConversationsForAdmin(currentUser.id, currentAdmin.id);
          setConversations(convs);
        } else if (tab === 'gallery') {
          const gal = await getUserGalleryForAdmin(currentUser.id, currentAdmin.id);
          setGalleryItems(gal);
        } else if (tab === 'connections') {
          await logAdminAction(currentAdmin.id, 'VIEW_USER_CONNECTIONS', currentUser.id, null, {});
          const conns = await getUserConnectionDetailsForAdmin(currentUser.id);
          setConnectionData(conns);
        } else if (tab === 'security') {
          const sec = await getUserSecurityDetailsForAdmin(currentUser.id, currentAdmin.id);
          setSecurityData(sec);
        }
      } catch (err) {
        console.error(`Error loading tab data (${tab}):`, err);
        setErrorMessage(err instanceof Error ? err.message : `Failed to load ${tab} data`);
      } finally {
        setTabLoading(false);
      }
    },
    [currentAdmin, currentUser.id, isSuperAdmin]
  );

  const handleTabChange = (tab: DetailTab) => {
    setActiveTab(tab);
    loadTabData(tab);
  };

  // Status Moderation (Suspend / Ban / Restore)
  const handleApplyStatus = async (status: 'active' | 'suspended' | 'banned') => {
    if (!currentAdmin) return;
    setModSubmitting(true);
    try {
      await setUserStatus(currentAdmin.id, currentUser.id, status, actionReason.trim());
      showToast(`User status updated to ${status.toUpperCase()}`, 'success');
      setModalMode(null);
      setActionReason('');
      await loadInitialProfileData();
      onUserUpdated();
    } catch (err) {
      console.error('Moderation error:', err);
      showToast(err instanceof Error ? err.message : 'Action failed', 'error');
    } finally {
      setModSubmitting(false);
    }
  };

  // Download Media File with Audit Logging
  const handleDownloadMedia = async (item: GalleryItem) => {
    if (!currentAdmin) return;
    await logAdminAction(currentAdmin.id, 'DOWNLOAD_USER_MEDIA', currentUser.id, item.id, {
      caption: item.caption,
      storage_path: item.storage_path,
    });

    const link = document.createElement('a');
    link.href = item.image_url;
    link.download = `${currentUser.uid}_media_${item.id}.jpg`;
    link.target = '_blank';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    showToast('Media downloaded & audit logged to Supabase', 'info');
  };

  // Delete Media File with Supabase Storage deletion
  const handleDeleteMedia = async (item: GalleryItem) => {
    if (!currentAdmin) return;
    if (!confirm('Are you sure you want to permanently delete this media item?')) return;
    try {
      await deleteGalleryItem(currentAdmin.id, item);
      setGalleryItems(prev => prev.filter(g => g.id !== item.id));
      if (activeLightboxImage?.id === item.id) {
        setActiveLightboxImage(null);
      }
      showToast('Media item deleted and logged to Supabase', 'info');
      setProfileMetrics(prev => ({ ...prev, totalGalleryItems: Math.max(0, prev.totalGalleryItems - 1) }));
    } catch (err) {
      console.error('Delete media error:', err);
      showToast(err instanceof Error ? err.message : 'Failed to delete media', 'error');
    }
  };

  // Unauthorized Screen
  if (!isSuperAdmin) {
    return (
      <div className="bg-rose-950/60 border border-rose-800 rounded-3xl p-8 text-center space-y-3">
        <ShieldAlert className="w-12 h-12 text-rose-400 mx-auto" />
        <h3 className="text-base font-bold text-white">Super Admin Access Required</h3>
        <p className="text-xs text-rose-200">
          You do not have permission to inspect user records. This security event has been logged.
        </p>
        <button
          onClick={onBack}
          className="mt-4 px-4 py-2 bg-vault-800 hover:bg-vault-700 text-white rounded-xl text-xs font-bold"
        >
          Return to Dashboard
        </button>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="bg-vault-900 border border-vault-800 rounded-3xl p-12 flex flex-col items-center justify-center gap-3">
        <Loader2 className="w-8 h-8 text-arcade-gold animate-spin" />
        <span className="text-xs text-vault-300 font-bold">Querying Supabase Production Records...</span>
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-20 animate-fade-in">
      {/* Top Bar with Back Button */}
      <div className="flex items-center justify-between pb-2 border-b border-vault-800">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-xs font-bold text-arcade-gold hover:text-amber-300 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Users</span>
        </button>
        <span className="text-[10px] font-mono text-vault-400 bg-vault-900 px-2.5 py-0.5 rounded-full border border-vault-800">
          USER ID: {currentUser.id}
        </span>
      </div>

      {errorMessage && (
        <div className="bg-rose-950/50 border border-rose-800/80 rounded-2xl p-3.5 flex items-center gap-2.5 text-xs text-rose-200">
          <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* User Header Summary Card */}
      <div className="bg-vault-900 border border-vault-800 rounded-3xl p-4.5 shadow-md flex items-center justify-between">
        <div className="flex items-center gap-3.5">
          <img
            src={currentUser.avatar_url || getAvatarUrl(currentUser.uid)}
            alt="Avatar"
            className="w-14 h-14 rounded-2xl bg-vault-800 border-2 border-arcade-gold/40 object-cover shadow-sm"
          />
          <div>
            <div className="flex items-center gap-1.5">
              <h3 className="text-base font-bold text-white leading-tight">{currentUser.display_name}</h3>
              {currentUser.role === 'super_admin' && (
                <span className="px-1.5 py-0.2 bg-amber-950 border border-amber-600/50 text-amber-300 rounded text-[9px] font-bold font-mono">
                  SUPER ADMIN
                </span>
              )}
            </div>
            <div className="text-xs font-mono text-vault-400 mt-0.5">
              @{currentUser.username || 'unknown'} •{' '}
              <span className="text-arcade-gold font-bold">{currentUser.uid}</span>
            </div>
            <div className="text-[10px] text-vault-500 mt-1 flex items-center gap-2">
              <span>Status:</span>
              <span
                className={`font-bold uppercase ${
                  currentUser.status === 'active'
                    ? 'text-emerald-400'
                    : currentUser.status === 'suspended'
                    ? 'text-amber-400'
                    : 'text-rose-400'
                }`}
              >
                {currentUser.status}
              </span>
            </div>
          </div>
        </div>

        {/* Moderation Button */}
        {currentUser.id !== currentAdmin?.id && (
          <div className="flex flex-col gap-1.5">
            {currentUser.status !== 'active' ? (
              <button
                onClick={() => setModalMode('unban')}
                className="px-3 py-1.5 bg-emerald-950 hover:bg-emerald-900 border border-emerald-600/50 text-emerald-300 rounded-xl text-xs font-bold transition-all flex items-center gap-1 shadow-sm"
              >
                <RefreshCw className="w-3.5 h-3.5" /> Restore
              </button>
            ) : (
              <button
                onClick={() => setModalMode('ban')}
                className="px-3 py-1.5 bg-rose-950 hover:bg-rose-900 border border-rose-600/50 text-rose-300 rounded-xl text-xs font-bold transition-all flex items-center gap-1 shadow-sm"
              >
                <Ban className="w-3.5 h-3.5" /> Moderate
              </button>
            )}
          </div>
        )}
      </div>

      {/* Detail Sub-Navigation Tabs */}
      <div className="bg-vault-900 border border-vault-800 rounded-2xl p-1 flex justify-between gap-1 overflow-x-auto">
        <button
          onClick={() => handleTabChange('profile')}
          className={`flex-1 py-2 px-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
            activeTab === 'profile' ? 'bg-arcade-gold text-vault-950 shadow-sm' : 'text-vault-400 hover:text-white'
          }`}
        >
          <User className="w-3.5 h-3.5" />
          <span>Profile</span>
        </button>

        <button
          onClick={() => handleTabChange('chats')}
          className={`flex-1 py-2 px-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
            activeTab === 'chats' ? 'bg-arcade-gold text-vault-950 shadow-sm' : 'text-vault-400 hover:text-white'
          }`}
        >
          <MessageSquare className="w-3.5 h-3.5" />
          <span>Chats ({profileMetrics.totalChats})</span>
        </button>

        <button
          onClick={() => handleTabChange('gallery')}
          className={`flex-1 py-2 px-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
            activeTab === 'gallery' ? 'bg-arcade-gold text-vault-950 shadow-sm' : 'text-vault-400 hover:text-white'
          }`}
        >
          <Image className="w-3.5 h-3.5" />
          <span>Gallery ({profileMetrics.totalGalleryItems})</span>
        </button>

        <button
          onClick={() => handleTabChange('connections')}
          className={`flex-1 py-2 px-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
            activeTab === 'connections' ? 'bg-arcade-gold text-vault-950 shadow-sm' : 'text-vault-400 hover:text-white'
          }`}
        >
          <Users className="w-3.5 h-3.5" />
          <span>Connections ({profileMetrics.totalConnections})</span>
        </button>

        <button
          onClick={() => handleTabChange('security')}
          className={`flex-1 py-2 px-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
            activeTab === 'security' ? 'bg-arcade-gold text-vault-950 shadow-sm' : 'text-vault-400 hover:text-white'
          }`}
        >
          <Shield className="w-3.5 h-3.5" />
          <span>Security</span>
        </button>
      </div>

      {/* Tab Loading Spinner */}
      {tabLoading && (
        <div className="bg-vault-900 border border-vault-800 rounded-2xl p-8 flex flex-col items-center justify-center gap-2">
          <Loader2 className="w-6 h-6 text-arcade-gold animate-spin" />
          <span className="text-xs text-vault-400">Loading Supabase production data...</span>
        </div>
      )}

      {!tabLoading && activeTab === 'profile' && (
        <ProfileTab currentUser={currentUser} profileMetrics={profileMetrics} />
      )}

      {!tabLoading && activeTab === 'chats' && (
        <ChatsTab
          currentUser={currentUser}
          currentAdminId={currentAdmin?.id}
          conversations={conversations}
          selectedConv={selectedConv}
          setSelectedConv={setSelectedConv}
          chatSearch={chatSearch}
          setChatSearch={setChatSearch}
        />
      )}

      {!tabLoading && activeTab === 'gallery' && (
        <GalleryTab
          currentUser={currentUser}
          galleryItems={galleryItems}
          activeLightboxImage={activeLightboxImage}
          setActiveLightboxImage={setActiveLightboxImage}
          onDownloadMedia={handleDownloadMedia}
          onDeleteMedia={handleDeleteMedia}
        />
      )}

      {!tabLoading && activeTab === 'connections' && <ConnectionsTab connectionData={connectionData} />}

      {!tabLoading && activeTab === 'security' && (
        <SecurityTab currentUser={currentUser} securityData={securityData} />
      )}

      {/* Moderation Confirmation Modal */}
      {modalMode && (
        <ModerationModal
          currentUser={currentUser}
          modalMode={modalMode}
          actionReason={actionReason}
          setActionReason={setActionReason}
          modSubmitting={modSubmitting}
          onCancel={() => {
            setModalMode(null);
            setActionReason('');
          }}
          onConfirm={() =>
            handleApplyStatus(modalMode === 'ban' ? 'banned' : modalMode === 'suspend' ? 'suspended' : 'active')
          }
        />
      )}
    </div>
  );
};

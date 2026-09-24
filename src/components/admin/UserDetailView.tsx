import React, { useState, useEffect, useCallback } from 'react';
import {
  ArrowLeft,
  User,
  Shield,
  MessageSquare,
  Image,
  Users,
  Lock,
  Download,
  Trash2,
  Eye,
  Search,
  CheckCircle2,
  Fingerprint,
  RefreshCw,
  Ban,
  ShieldAlert,
  Loader2,
  Clock,
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
import { formatDetailedDate } from '../../lib/utils';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { Avatar } from '../common/Avatar';

interface UserDetailViewProps {
  user: UserProfile;
  onBack: () => void;
  onUserUpdated: () => void;
}

type DetailTab = 'profile' | 'chats' | 'gallery' | 'connections' | 'security';

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
  const [conversations, setConversations] = useState<
    (ConversationItem & { partnerProfile: UserProfile; messages: MessageItem[] })[]
  >([]);
  const [selectedConv, setSelectedConv] = useState<
    (ConversationItem & { partnerProfile: UserProfile; messages: MessageItem[] }) | null
  >(null);
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

  // Filtered in-chat messages for the Conversation Inspector
  const filteredMessages = selectedConv
    ? selectedConv.messages.filter(m =>
        m.content.toLowerCase().includes(chatSearch.toLowerCase())
      )
    : [];

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
          <Avatar name={currentUser.display_name ?? ''} seed={currentUser.uid} src={currentUser.avatar_url} size={56} />
          <div>
            <div className="flex items-center gap-1.5">
              <h3 className="text-base font-bold text-white leading-tight">
                {currentUser.display_name}
              </h3>
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
            activeTab === 'profile'
              ? 'bg-arcade-gold text-vault-950 shadow-sm'
              : 'text-vault-400 hover:text-white'
          }`}
        >
          <User className="w-3.5 h-3.5" />
          <span>Profile</span>
        </button>

        <button
          onClick={() => handleTabChange('chats')}
          className={`flex-1 py-2 px-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
            activeTab === 'chats'
              ? 'bg-arcade-gold text-vault-950 shadow-sm'
              : 'text-vault-400 hover:text-white'
          }`}
        >
          <MessageSquare className="w-3.5 h-3.5" />
          <span>Chats ({profileMetrics.totalChats})</span>
        </button>

        <button
          onClick={() => handleTabChange('gallery')}
          className={`flex-1 py-2 px-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
            activeTab === 'gallery'
              ? 'bg-arcade-gold text-vault-950 shadow-sm'
              : 'text-vault-400 hover:text-white'
          }`}
        >
          <Image className="w-3.5 h-3.5" />
          <span>Gallery ({profileMetrics.totalGalleryItems})</span>
        </button>

        <button
          onClick={() => handleTabChange('connections')}
          className={`flex-1 py-2 px-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
            activeTab === 'connections'
              ? 'bg-arcade-gold text-vault-950 shadow-sm'
              : 'text-vault-400 hover:text-white'
          }`}
        >
          <Users className="w-3.5 h-3.5" />
          <span>Connections ({profileMetrics.totalConnections})</span>
        </button>

        <button
          onClick={() => handleTabChange('security')}
          className={`flex-1 py-2 px-2.5 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
            activeTab === 'security'
              ? 'bg-arcade-gold text-vault-950 shadow-sm'
              : 'text-vault-400 hover:text-white'
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

      {/* ========================================================================= */}
      {/* 1. PROFILE TAB (Real Supabase Data) */}
      {/* ========================================================================= */}
      {!tabLoading && activeTab === 'profile' && (
        <div className="space-y-3 animate-fade-in">
          {/* Key Metrics Grid */}
          <div className="grid grid-cols-3 gap-2">
            <div className="bg-vault-900 border border-vault-800 rounded-2xl p-3 text-center">
              <div className="text-[10px] text-vault-400 uppercase font-bold">Total Chats</div>
              <div className="text-lg font-bold text-white mt-0.5">{profileMetrics.totalChats}</div>
            </div>
            <div className="bg-vault-900 border border-vault-800 rounded-2xl p-3 text-center">
              <div className="text-[10px] text-vault-400 uppercase font-bold">Connections</div>
              <div className="text-lg font-bold text-arcade-gold mt-0.5">
                {profileMetrics.totalConnections}
              </div>
            </div>
            <div className="bg-vault-900 border border-vault-800 rounded-2xl p-3 text-center">
              <div className="text-[10px] text-vault-400 uppercase font-bold">Gallery Media</div>
              <div className="text-lg font-bold text-white mt-0.5">{profileMetrics.totalGalleryItems}</div>
            </div>
          </div>

          {/* Full Profile Attributes */}
          <div className="bg-vault-900 border border-vault-800 rounded-3xl p-4.5 space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-vault-400 border-b border-vault-800 pb-2">
              Identity & Account Attributes (Supabase `profiles`)
            </h4>

            <div className="space-y-2 text-xs">
              <div className="flex justify-between py-1 border-b border-vault-800/50">
                <span className="text-vault-400">Username</span>
                <span className="text-white font-mono font-bold">@{currentUser.username || 'none'}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-vault-800/50">
                <span className="text-vault-400">Unique UID</span>
                <span className="text-arcade-gold font-mono font-bold">{currentUser.uid}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-vault-800/50">
                <span className="text-vault-400">Display Name</span>
                <span className="text-white font-semibold">{currentUser.display_name}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-vault-800/50">
                <span className="text-vault-400">Role</span>
                <span className="text-amber-300 font-bold uppercase font-mono">{currentUser.role}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-vault-800/50">
                <span className="text-vault-400">Account Status</span>
                <span className="font-bold uppercase text-white">{currentUser.status}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-vault-800/50">
                <span className="text-vault-400">Registered Date</span>
                <span className="text-vault-200">{formatDetailedDate(currentUser.created_at)}</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-vault-400">Last Active</span>
                <span className="text-vault-200">
                  {currentUser.last_login_at
                    ? formatDetailedDate(currentUser.last_login_at)
                    : formatDetailedDate(currentUser.updated_at)}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 2. CHATS TAB (Real Supabase Conversations & Messages) */}
      {/* ========================================================================= */}
      {!tabLoading && activeTab === 'chats' && (
        <div className="space-y-3 animate-fade-in">
          {conversations.length === 0 ? (
            <div className="bg-vault-900 border border-vault-800 rounded-2xl p-8 text-center text-xs text-vault-400">
              No conversations found in Supabase for this user.
            </div>
          ) : (
            <div className="space-y-2">
              {conversations.map(c => {
                const lastMsg = c.messages[c.messages.length - 1];
                return (
                  <div
                    key={c.id}
                    onClick={async () => {
                      setSelectedConv(c);
                      setChatSearch('');
                      if (currentAdmin) {
                        await logAdminAction(
                          currentAdmin.id,
                          'OPEN_CONVERSATION_INSPECTOR',
                          currentUser.id,
                          c.id,
                          { partner: c.partnerProfile.uid }
                        );
                      }
                    }}
                    className="bg-vault-900 hover:bg-vault-850 border border-vault-800 rounded-2xl p-3.5 cursor-pointer transition-all shadow-sm flex items-center justify-between"
                  >
                    <div className="flex items-center gap-3">
                      <Avatar name={c.partnerProfile.display_name ?? ''} seed={c.partnerProfile.uid} src={c.partnerProfile.avatar_url} size={40} />
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-bold text-white">
                            {c.partnerProfile.display_name}
                          </span>
                          <span className="text-[10px] font-mono text-arcade-gold font-bold">
                            {c.partnerProfile.uid}
                          </span>
                        </div>
                        <p className="text-[11px] text-vault-400 truncate max-w-[200px] mt-0.5">
                          {lastMsg ? lastMsg.content : 'No messages'}
                        </p>
                        <div className="text-[9px] text-vault-500 mt-0.5">
                          ID: {c.id} • Active: {formatDetailedDate(c.updated_at)}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-[10px] bg-vault-950 px-2 py-0.5 rounded-md border border-vault-800 text-vault-300">
                        {c.messages.length} msgs
                      </span>
                      <Eye className="w-4 h-4 text-arcade-gold" />
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Full Conversation Inspector Modal */}
          {selectedConv && (
            <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in">
              <div className="bg-vault-900 border border-vault-700/80 rounded-3xl w-full max-w-md max-h-[85vh] flex flex-col shadow-2xl p-4.5">
                {/* Header */}
                <div className="flex items-center justify-between pb-3 border-b border-vault-800 mb-3">
                  <div className="flex items-center gap-2">
                    <MessageSquare className="w-4 h-4 text-arcade-gold" />
                    <h4 className="text-xs font-bold text-white">
                      Chat: {currentUser.uid} ↔ {selectedConv.partnerProfile.uid}
                    </h4>
                  </div>
                  <button
                    onClick={() => setSelectedConv(null)}
                    className="text-xs text-vault-400 hover:text-white font-bold"
                  >
                    Close
                  </button>
                </div>

                {/* In-Chat Message Search */}
                <div className="relative mb-3">
                  <Search className="w-3.5 h-3.5 text-vault-500 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={chatSearch}
                    onChange={e => setChatSearch(e.target.value)}
                    placeholder="Search in conversation transcripts..."
                    className="w-full bg-vault-950 border border-vault-800 rounded-xl pl-9 pr-3 py-1.5 text-xs text-white placeholder-vault-600 outline-none"
                  />
                </div>

                {/* Message Stream */}
                <div className="flex-1 overflow-y-auto space-y-2 p-1 max-h-[50vh]">
                  {filteredMessages.length === 0 ? (
                    <div className="text-center text-xs text-vault-500 py-6">
                      No matching messages found
                    </div>
                  ) : (
                    filteredMessages.map(m => {
                      const isTargetUser = m.sender_id === currentUser.id;
                      return (
                        <div
                          key={m.id}
                          className={`p-2.5 rounded-xl border text-xs ${
                            isTargetUser
                              ? 'bg-amber-950/30 border-amber-800/40 text-amber-100'
                              : 'bg-vault-950 border-vault-800 text-vault-200'
                          }`}
                        >
                          <div className="flex items-center justify-between mb-1">
                            <span className="font-bold font-mono text-[10px] text-arcade-gold">
                              {isTargetUser
                                ? `@${currentUser.username || 'user'} (${currentUser.uid})`
                                : `@${selectedConv.partnerProfile.username || 'partner'} (${selectedConv.partnerProfile.uid})`}
                            </span>
                            <span className="text-[9px] text-vault-500">
                              {formatDetailedDate(m.created_at)}
                            </span>
                          </div>
                          <p className="leading-relaxed break-words">{m.content}</p>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* 3. GALLERY TAB (Real Supabase Gallery Items & Storage) */}
      {/* ========================================================================= */}
      {!tabLoading && activeTab === 'gallery' && (
        <div className="space-y-3 animate-fade-in">
          {galleryItems.length === 0 ? (
            <div className="bg-vault-900 border border-vault-800 rounded-2xl p-8 text-center text-xs text-vault-400">
              No private gallery uploads found for this user in Supabase.
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2.5">
              {galleryItems.map(item => (
                <div
                  key={item.id}
                  className="bg-vault-900 border border-vault-800 rounded-2xl overflow-hidden shadow-sm flex flex-col justify-between"
                >
                  <div className="relative aspect-square bg-vault-950 group">
                    <img
                      src={item.image_url}
                      alt={item.caption || 'Media'}
                      className="w-full h-full object-cover cursor-pointer"
                      onClick={() => setActiveLightboxImage(item)}
                    />
                    <div className="absolute top-1.5 right-1.5 flex items-center gap-1">
                      <button
                        onClick={() => handleDownloadMedia(item)}
                        className="p-1.5 bg-vault-950/80 hover:bg-vault-900 text-arcade-gold rounded-lg border border-vault-700 shadow-md transition-colors"
                        title="Download Media"
                      >
                        <Download className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDeleteMedia(item)}
                        className="p-1.5 bg-rose-950/80 hover:bg-rose-900 text-rose-300 rounded-lg border border-rose-700 shadow-md transition-colors"
                        title="Delete Media"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <div className="p-2.5">
                    <div className="text-[10px] text-vault-400 font-mono">
                      Type: <span className="text-vault-200">Image/Media</span>
                    </div>
                    <p className="text-xs text-white truncate font-medium mt-0.5">
                      {item.caption || 'Untitled Media'}
                    </p>
                    <div className="text-[9px] text-vault-500 mt-1">
                      {formatDetailedDate(item.created_at)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Full Screen Lightbox Modal */}
          {activeLightboxImage && (
            <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex flex-col items-center justify-center p-4 animate-fade-in">
              <div className="w-full max-w-md flex items-center justify-between text-white pb-3">
                <span className="text-xs font-bold font-mono text-arcade-gold">
                  {currentUser.uid} • {activeLightboxImage.id}
                </span>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => handleDownloadMedia(activeLightboxImage)}
                    className="flex items-center gap-1 text-xs bg-vault-800 hover:bg-vault-700 px-3 py-1.5 rounded-lg border border-vault-700 font-bold text-arcade-gold"
                  >
                    <Download className="w-3.5 h-3.5" /> Download
                  </button>
                  <button
                    onClick={() => setActiveLightboxImage(null)}
                    className="text-xs text-vault-400 hover:text-white font-bold"
                  >
                    Close
                  </button>
                </div>
              </div>
              <img
                src={activeLightboxImage.image_url}
                alt={activeLightboxImage.caption || 'Full view'}
                className="max-w-full max-h-[70vh] object-contain rounded-2xl border border-vault-800 shadow-2xl"
              />
              {activeLightboxImage.caption && (
                <p className="text-xs text-vault-300 text-center mt-3 max-w-sm">
                  {activeLightboxImage.caption}
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* 4. CONNECTIONS TAB (Real Supabase Connections & Blocks) */}
      {/* ========================================================================= */}
      {!tabLoading && activeTab === 'connections' && (
        <div className="space-y-3 animate-fade-in">
          {/* Active Connections */}
          <div className="bg-vault-900 border border-vault-800 rounded-3xl p-4 space-y-2.5">
            <h4 className="text-xs font-bold text-white flex items-center justify-between border-b border-vault-800 pb-2">
              <span>Active Friends / Connections</span>
              <span className="text-arcade-gold">{connectionData.connections.length}</span>
            </h4>
            {connectionData.connections.length === 0 ? (
              <p className="text-xs text-vault-500 py-1">No active connections</p>
            ) : (
              <div className="space-y-2">
                {connectionData.connections.map(conn => (
                  <div
                    key={conn.id}
                    className="flex items-center justify-between p-2 rounded-xl bg-vault-950 border border-vault-800 text-xs"
                  >
                    <div className="flex items-center gap-2">
                      <Avatar name={conn.partner.display_name ?? ''} seed={conn.partner.uid} src={conn.partner.avatar_url} size={32} />
                      <div>
                        <div className="font-bold text-white">{conn.partner.display_name}</div>
                        <div className="text-[10px] font-mono text-arcade-gold">{conn.partner.uid}</div>
                      </div>
                    </div>
                    <div className="text-[10px] text-vault-500 font-mono">
                      Connected: {formatDetailedDate(conn.created_at)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Pending Requests */}
          <div className="bg-vault-900 border border-vault-800 rounded-3xl p-4 space-y-2.5">
            <h4 className="text-xs font-bold text-white flex items-center justify-between border-b border-vault-800 pb-2">
              <span>Pending Requests</span>
              <span className="text-amber-400">
                {connectionData.incomingRequests.length + connectionData.outgoingRequests.length}
              </span>
            </h4>
            {connectionData.incomingRequests.length === 0 &&
            connectionData.outgoingRequests.length === 0 ? (
              <p className="text-xs text-vault-500 py-1">No pending requests</p>
            ) : (
              <div className="space-y-1.5 text-xs">
                {connectionData.incomingRequests.map(r => (
                  <div key={r.id} className="p-2 rounded-xl bg-vault-950 border border-vault-800">
                    <span className="text-amber-400 font-bold">Incoming:</span> From {r.sender?.uid || 'Unknown'} ({formatDetailedDate(r.created_at)})
                  </div>
                ))}
                {connectionData.outgoingRequests.map(r => (
                  <div key={r.id} className="p-2 rounded-xl bg-vault-950 border border-vault-800">
                    <span className="text-vault-400 font-bold">Outgoing:</span> To {r.receiver?.uid || 'Unknown'} ({formatDetailedDate(r.created_at)})
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Blocked Users */}
          <div className="bg-vault-900 border border-vault-800 rounded-3xl p-4 space-y-2.5">
            <h4 className="text-xs font-bold text-white flex items-center justify-between border-b border-vault-800 pb-2">
              <span>Blocked Users</span>
              <span className="text-rose-400">{connectionData.blockedUsers.length}</span>
            </h4>
            {connectionData.blockedUsers.length === 0 ? (
              <p className="text-xs text-vault-500 py-1">No blocked users on record</p>
            ) : (
              <div className="space-y-1.5 text-xs">
                {connectionData.blockedUsers.map(b => (
                  <div
                    key={b.id}
                    className="p-2 rounded-xl bg-vault-950 border border-vault-800 flex items-center justify-between"
                  >
                    <span className="font-bold text-rose-300">{b.display_name} ({b.uid})</span>
                    <span className="text-[10px] text-vault-500 font-mono">Blocked</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 5. SECURITY TAB (Real Supabase Security Overview without Hashes) */}
      {/* ========================================================================= */}
      {!tabLoading && activeTab === 'security' && (
        <div className="space-y-3 animate-fade-in">
          <div className="bg-vault-900 border border-vault-800 rounded-3xl p-4.5 space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-vault-400 border-b border-vault-800 pb-2">
              Security Parameters & Account State (Supabase Real-Time)
            </h4>

            <div className="space-y-3 text-xs">
              {/* Biometric Status */}
              <div className="flex items-center justify-between p-3 rounded-2xl bg-vault-950 border border-vault-800">
                <div className="flex items-center gap-2.5">
                  <Fingerprint
                    className={`w-5 h-5 ${
                      securityData?.biometric_enabled ? 'text-emerald-400' : 'text-vault-500'
                    }`}
                  />
                  <div>
                    <div className="font-bold text-white">Biometric Authentication</div>
                    <div className="text-[10px] text-vault-400">
                      {securityData?.biometric_enabled
                        ? 'Hardware platform authenticator registered'
                        : 'Biometrics disabled (Standard PIN only)'}
                    </div>
                  </div>
                </div>
                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                    securityData?.biometric_enabled
                      ? 'bg-emerald-950 text-emerald-300 border-emerald-700/50'
                      : 'bg-vault-800 text-vault-400 border-vault-700'
                  }`}
                >
                  {securityData?.biometric_enabled ? 'ENABLED' : 'DISABLED'}
                </span>
              </div>

              {/* Account Lock Status */}
              <div className="flex items-center justify-between p-3 rounded-2xl bg-vault-950 border border-vault-800">
                <div className="flex items-center gap-2.5">
                  <Lock
                    className={`w-5 h-5 ${
                      currentUser.status === 'active' ? 'text-emerald-400' : 'text-rose-400'
                    }`}
                  />
                  <div>
                    <div className="font-bold text-white">Account Lock Status</div>
                    <div className="text-[10px] text-vault-400">
                      Access to private social matrix
                    </div>
                  </div>
                </div>
                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] font-bold border uppercase ${
                    currentUser.status === 'active'
                      ? 'bg-emerald-950 text-emerald-300 border-emerald-700/50'
                      : 'bg-rose-950 text-rose-300 border-rose-700/50'
                  }`}
                >
                  {currentUser.status}
                </span>
              </div>

              {/* Failed Login Counter */}
              <div className="flex items-center justify-between p-3 rounded-2xl bg-vault-950 border border-vault-800">
                <div className="flex items-center gap-2.5">
                  <ShieldAlert className="w-5 h-5 text-amber-400" />
                  <div>
                    <div className="font-bold text-white">Failed Login Attempts</div>
                    <div className="text-[10px] text-vault-400">
                      Lockout threshold: 5 consecutive failures
                    </div>
                  </div>
                </div>
                <span className="font-mono font-bold text-white bg-vault-900 px-2.5 py-1 rounded-lg border border-vault-800">
                  {securityData?.failed_login_count ?? 0} Failed
                </span>
              </div>

              {/* Recovery Status */}
              <div className="flex items-center justify-between p-3 rounded-2xl bg-vault-950 border border-vault-800">
                <div className="flex items-center gap-2.5">
                  <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                  <div>
                    <div className="font-bold text-white">Credential Integrity</div>
                    <div className="text-[10px] text-vault-400">
                      Salted Bcrypt / Argon2 hash verification active
                    </div>
                  </div>
                </div>
                <span className="font-mono text-[10px] font-bold text-emerald-400 bg-emerald-950/80 px-2 py-0.5 rounded border border-emerald-800/60">
                  SECURE
                </span>
              </div>

              {/* Last Login Timestamp */}
              <div className="flex items-center justify-between p-3 rounded-2xl bg-vault-950 border border-vault-800">
                <div className="flex items-center gap-2.5">
                  <Clock className="w-5 h-5 text-vault-400" />
                  <div>
                    <div className="font-bold text-white">Last Authenticated Session</div>
                    <div className="text-[10px] text-vault-400">
                      {securityData?.last_login_at
                        ? formatDetailedDate(securityData.last_login_at)
                        : formatDetailedDate(currentUser.updated_at)}
                    </div>
                  </div>
                </div>
                <span className="text-[10px] text-vault-400 font-mono">
                  ACTIVE
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Moderation Confirmation Modal */}
      {modalMode && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-vault-900 border border-vault-700/80 rounded-3xl w-full max-w-sm p-6 flex flex-col shadow-2xl">
            <div className="flex items-center gap-2 text-rose-400 font-bold mb-1">
              <ShieldAlert className="w-5 h-5" />
              <span>Confirm Disciplinary Action</span>
            </div>
            <p className="text-xs text-vault-300 mb-4">
              Apply <strong>{modalMode.toUpperCase()}</strong> to{' '}
              <strong>{currentUser.display_name}</strong> ({currentUser.uid})
            </p>

            <label className="block text-[10px] font-bold text-vault-400 uppercase tracking-wider mb-1">
              Reason / Moderator Notes (Audited to Supabase)
            </label>
            <input
              type="text"
              value={actionReason}
              onChange={e => setActionReason(e.target.value)}
              placeholder="e.g. Policy violation or suspicious activity"
              className="w-full bg-vault-950 border border-vault-700 focus:border-amber-500 rounded-xl px-3.5 py-2 text-xs text-white placeholder-vault-600 outline-none mb-4"
            />

            <div className="flex gap-2">
              <button
                type="button"
                disabled={modSubmitting}
                onClick={() => {
                  setModalMode(null);
                  setActionReason('');
                }}
                className="flex-1 py-2 bg-vault-800 hover:bg-vault-700 text-vault-300 rounded-xl text-xs font-bold"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={modSubmitting}
                onClick={() =>
                  handleApplyStatus(
                    modalMode === 'ban' ? 'banned' : modalMode === 'suspend' ? 'suspended' : 'active'
                  )
                }
                className={`flex-1 py-2 rounded-xl text-xs font-bold shadow-md flex items-center justify-center gap-1 ${
                  modalMode === 'unban'
                    ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                    : 'bg-rose-600 hover:bg-rose-500 text-white'
                }`}
              >
                {modSubmitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>Confirm {modalMode.toUpperCase()}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

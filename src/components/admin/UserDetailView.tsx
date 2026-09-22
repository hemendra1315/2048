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
  KeyRound,
  Fingerprint,
  RefreshCw,
  Ban,
  ShieldAlert,
} from 'lucide-react';
import { UserProfile, GalleryItem, MessageItem, ConversationItem } from '../../types';
import { mockBackend } from '../../lib/mockBackend';
import { formatDetailedDate } from '../../lib/utils';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';

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

  // Moderation state
  const [modalMode, setModalMode] = useState<'suspend' | 'ban' | 'unban' | null>(null);
  const [actionReason, setActionReason] = useState('');

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
    connections: ReturnType<typeof mockBackend.getConnections>;
    incomingRequests: ReturnType<typeof mockBackend.getConnectionRequests>['incoming'];
    outgoingRequests: ReturnType<typeof mockBackend.getConnectionRequests>['outgoing'];
    blockedUsers: UserProfile[];
  }>({
    connections: [],
    incomingRequests: [],
    outgoingRequests: [],
    blockedUsers: [],
  });

  // Load all detail data
  const loadUserData = useCallback(() => {
    if (!currentAdmin) return;
    // Log profile view
    mockBackend.logAdminAction(currentAdmin.id, 'VIEW_USER_PROFILE', currentUser.id, null, {
      uid: currentUser.uid,
      username: currentUser.username,
    });

    const latestProfile = mockBackend.getProfileById(currentUser.id) || currentUser;
    setCurrentUser(latestProfile);

    // Fetch user chats
    const convs = mockBackend.getUserConversationsForAdmin(currentUser.id, currentAdmin.id);
    setConversations(convs);

    // Fetch user gallery
    const gal = mockBackend.getUserGalleryForAdmin(currentUser.id, currentAdmin.id);
    setGalleryItems(gal);

    // Fetch user connections
    const conns = mockBackend.getUserConnectionDetailsForAdmin(currentUser.id);
    setConnectionData(conns);
  }, [currentAdmin, currentUser]);

  useEffect(() => {
    loadUserData();
  }, [loadUserData]);

  // Handle Tab Switch & Audit Logging
  const handleTabChange = (tab: DetailTab) => {
    setActiveTab(tab);
    if (!currentAdmin) return;

    if (tab === 'chats') {
      mockBackend.logAdminAction(currentAdmin.id, 'VIEW_USER_CHATS', currentUser.id, null, {
        total_chats: conversations.length,
      });
    } else if (tab === 'gallery') {
      mockBackend.logAdminAction(currentAdmin.id, 'VIEW_USER_GALLERY', currentUser.id, null, {
        total_media: galleryItems.length,
      });
    } else if (tab === 'connections') {
      mockBackend.logAdminAction(currentAdmin.id, 'VIEW_USER_CONNECTIONS', currentUser.id, null, {
        total_connections: connectionData.connections.length,
      });
    } else if (tab === 'security') {
      mockBackend.logAdminAction(currentAdmin.id, 'VIEW_USER_SECURITY', currentUser.id, null, {
        biometric_enabled: currentUser.biometric_enabled,
      });
    }
  };

  // Status Change (Suspend / Ban / Unban)
  const handleApplyStatus = (status: 'active' | 'suspended' | 'banned') => {
    if (!currentAdmin) return;
    try {
      const updated = mockBackend.adminSetUserStatus(
        currentAdmin.id,
        currentUser.id,
        status,
        actionReason.trim()
      );
      setCurrentUser(updated);
      showToast(`User status updated to ${status.toUpperCase()}`, 'success');
      setModalMode(null);
      setActionReason('');
      onUserUpdated();
    } catch {
      showToast('Action failed', 'error');
    }
  };

  // Download Media File
  const handleDownloadMedia = (item: GalleryItem) => {
    if (!currentAdmin) return;
    mockBackend.logAdminAction(currentAdmin.id, 'DOWNLOAD_USER_MEDIA', currentUser.id, item.id, {
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

    showToast('Media downloaded & audit logged', 'info');
  };

  // Delete Media File
  const handleDeleteMedia = (item: GalleryItem) => {
    if (!currentAdmin) return;
    mockBackend.deleteGalleryItem(item.id, currentAdmin.id, true);
    setGalleryItems(prev => prev.filter(g => g.id !== item.id));
    if (activeLightboxImage?.id === item.id) {
      setActiveLightboxImage(null);
    }
    showToast('Media item deleted by administrator', 'info');
  };

  // Filtered in-chat messages
  const filteredMessages = selectedConv
    ? selectedConv.messages.filter(m =>
        m.content.toLowerCase().includes(chatSearch.toLowerCase())
      )
    : [];

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
        <span className="text-[10px] font-mono text-vault-400 bg-vault-900 px-2 py-0.5 rounded-full border border-vault-800">
          ID: {currentUser.id}
        </span>
      </div>

      {/* User Header Summary Card */}
      <div className="bg-vault-900 border border-vault-800 rounded-3xl p-4.5 shadow-md flex items-center justify-between">
        <div className="flex items-center gap-3.5">
          <img
            src={currentUser.avatar_url || `https://api.dicebear.com/7.x/bottts/svg?seed=${currentUser.uid}`}
            alt="Avatar"
            className="w-14 h-14 rounded-2xl bg-vault-800 border-2 border-arcade-gold/40 object-cover shadow-sm"
          />
          <div>
            <div className="flex items-center gap-1.5">
              <h3 className="text-base font-bold text-white leading-tight">
                {currentUser.display_name}
              </h3>
              {currentUser.role === 'super_admin' && (
                <span className="px-1.5 py-0.2 bg-amber-950 border border-amber-600/50 text-amber-300 rounded text-[9px] font-bold">
                  ADMIN
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

        {/* Action Button for Moderation */}
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
                <Ban className="w-3.5 h-3.5" /> Suspend / Ban
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
          <span>Chats ({conversations.length})</span>
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
          <span>Gallery ({galleryItems.length})</span>
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
          <span>Connections</span>
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

      {/* ========================================================================= */}
      {/* 1. PROFILE TAB */}
      {/* ========================================================================= */}
      {activeTab === 'profile' && (
        <div className="space-y-3 animate-fade-in">
          {/* Key Metrics Grid */}
          <div className="grid grid-cols-3 gap-2">
            <div className="bg-vault-900 border border-vault-800 rounded-2xl p-3 text-center">
              <div className="text-[10px] text-vault-400 uppercase font-bold">Total Chats</div>
              <div className="text-lg font-bold text-white mt-0.5">{conversations.length}</div>
            </div>
            <div className="bg-vault-900 border border-vault-800 rounded-2xl p-3 text-center">
              <div className="text-[10px] text-vault-400 uppercase font-bold">Connections</div>
              <div className="text-lg font-bold text-arcade-gold mt-0.5">
                {connectionData.connections.length}
              </div>
            </div>
            <div className="bg-vault-900 border border-vault-800 rounded-2xl p-3 text-center">
              <div className="text-[10px] text-vault-400 uppercase font-bold">Gallery Media</div>
              <div className="text-lg font-bold text-white mt-0.5">{galleryItems.length}</div>
            </div>
          </div>

          {/* Full Profile Attributes */}
          <div className="bg-vault-900 border border-vault-800 rounded-3xl p-4.5 space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-vault-400 border-b border-vault-800 pb-2">
              Identity & Account Attributes
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
                <span className="font-bold uppercase">{currentUser.status}</span>
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
      {/* 2. CHATS TAB */}
      {/* ========================================================================= */}
      {activeTab === 'chats' && (
        <div className="space-y-3 animate-fade-in">
          {conversations.length === 0 ? (
            <div className="bg-vault-900 border border-vault-800 rounded-2xl p-6 text-center text-xs text-vault-400">
              No conversations on record for this user.
            </div>
          ) : (
            <div className="space-y-2">
              {conversations.map(c => {
                const lastMsg = c.messages[c.messages.length - 1];
                return (
                  <div
                    key={c.id}
                    onClick={() => {
                      setSelectedConv(c);
                      setChatSearch('');
                      if (currentAdmin) {
                        mockBackend.logAdminAction(
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
                      <img
                        src={
                          c.partnerProfile.avatar_url ||
                          `https://api.dicebear.com/7.x/bottts/svg?seed=${c.partnerProfile.uid}`
                        }
                        alt="Partner"
                        className="w-10 h-10 rounded-xl bg-vault-800 object-cover border border-vault-700"
                      />
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
                          Conv ID: {c.id} • Active: {formatDetailedDate(c.updated_at)}
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

          {/* Full Chat Inspector Modal */}
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
                    placeholder="Search inside conversation..."
                    className="w-full bg-vault-950 border border-vault-800 rounded-xl pl-9 pr-3 py-1.5 text-xs text-white placeholder-vault-600 outline-none"
                  />
                </div>

                {/* Message Stream */}
                <div className="flex-1 overflow-y-auto space-y-2 p-1 max-h-[50vh]">
                  {filteredMessages.length === 0 ? (
                    <div className="text-center text-xs text-vault-500 py-6">No matching messages found</div>
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
                                ? `@${currentUser.username} (${currentUser.uid})`
                                : `@${selectedConv.partnerProfile.username} (${selectedConv.partnerProfile.uid})`}
                            </span>
                            <span className="text-[9px] text-vault-500">
                              {formatDetailedDate(m.created_at)}
                            </span>
                          </div>
                          <p className="leading-relaxed">{m.content}</p>
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
      {/* 3. GALLERY TAB */}
      {/* ========================================================================= */}
      {activeTab === 'gallery' && (
        <div className="space-y-3 animate-fade-in">
          {galleryItems.length === 0 ? (
            <div className="bg-vault-900 border border-vault-800 rounded-2xl p-6 text-center text-xs text-vault-400">
              No private gallery items found for this user.
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
                      Type: <span className="text-vault-200">Image/JPEG</span>
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
      {/* 4. CONNECTIONS TAB */}
      {/* ========================================================================= */}
      {activeTab === 'connections' && (
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
                      <img
                        src={
                          conn.partner.avatar_url ||
                          `https://api.dicebear.com/7.x/bottts/svg?seed=${conn.partner.uid}`
                        }
                        alt="Partner"
                        className="w-8 h-8 rounded-lg object-cover"
                      />
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
                    <span className="text-amber-400 font-bold">Incoming:</span> From {r.sender?.uid} ({formatDetailedDate(r.created_at)})
                  </div>
                ))}
                {connectionData.outgoingRequests.map(r => (
                  <div key={r.id} className="p-2 rounded-xl bg-vault-950 border border-vault-800">
                    <span className="text-vault-400 font-bold">Outgoing:</span> To {r.receiver?.uid} ({formatDetailedDate(r.created_at)})
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
      {/* 5. SECURITY TAB */}
      {/* ========================================================================= */}
      {activeTab === 'security' && (
        <div className="space-y-3 animate-fade-in">
          <div className="bg-vault-900 border border-vault-800 rounded-3xl p-4.5 space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-vault-400 border-b border-vault-800 pb-2">
              Security Parameters & Authentication State
            </h4>

            <div className="space-y-3 text-xs">
              {/* Biometric Status */}
              <div className="flex items-center justify-between p-3 rounded-2xl bg-vault-950 border border-vault-800">
                <div className="flex items-center gap-2.5">
                  <Fingerprint
                    className={`w-5 h-5 ${
                      currentUser.biometric_enabled ? 'text-emerald-400' : 'text-vault-500'
                    }`}
                  />
                  <div>
                    <div className="font-bold text-white">Biometric Authentication</div>
                    <div className="text-[10px] text-vault-400">
                      {currentUser.biometric_enabled
                        ? 'Hardware platform authenticator active'
                        : 'Biometrics disabled (PIN only)'}
                    </div>
                  </div>
                </div>
                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                    currentUser.biometric_enabled
                      ? 'bg-emerald-950 text-emerald-300 border-emerald-700/50'
                      : 'bg-vault-800 text-vault-400 border-vault-700'
                  }`}
                >
                  {currentUser.biometric_enabled ? 'ENABLED' : 'DISABLED'}
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

              {/* Failed Login Count */}
              <div className="flex items-center justify-between p-3 rounded-2xl bg-vault-950 border border-vault-800">
                <div className="flex items-center gap-2.5">
                  <ShieldAlert className="w-5 h-5 text-amber-400" />
                  <div>
                    <div className="font-bold text-white">Failed Login Attempts</div>
                    <div className="text-[10px] text-vault-400">
                      Lockout threshold: 5 attempts
                    </div>
                  </div>
                </div>
                <span className="font-mono font-bold text-white bg-vault-900 px-2.5 py-1 rounded-lg border border-vault-800">
                  0 Failed
                </span>
              </div>

              {/* Recovery Status */}
              <div className="flex items-center justify-between p-3 rounded-2xl bg-vault-950 border border-vault-800">
                <div className="flex items-center gap-2.5">
                  <KeyRound className="w-5 h-5 text-arcade-gold" />
                  <div>
                    <div className="font-bold text-white">Recovery Key Status</div>
                    <div className="text-[10px] text-vault-400">
                      Encrypted SHA-256 hash verified
                    </div>
                  </div>
                </div>
                <span className="text-[10px] font-bold text-emerald-400 flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Configured
                </span>
              </div>

              {/* Last Login Date */}
              <div className="p-3 rounded-2xl bg-vault-950 border border-vault-800">
                <div className="text-vault-400 text-[10px] uppercase font-bold">Last Authenticated Session</div>
                <div className="text-white font-mono font-medium mt-0.5">
                  {currentUser.last_login_at
                    ? formatDetailedDate(currentUser.last_login_at)
                    : 'Active current session'}
                </div>
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
              Reason / Moderator Notes (Audited)
            </label>
            <input
              type="text"
              value={actionReason}
              onChange={e => setActionReason(e.target.value)}
              placeholder="e.g. Terms of Service violation"
              className="w-full bg-vault-950 border border-vault-700 focus:border-amber-500 rounded-xl px-3.5 py-2 text-xs text-white placeholder-vault-600 outline-none mb-4"
            />

            <div className="flex gap-2">
              <button
                type="button"
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
                onClick={() =>
                  handleApplyStatus(
                    modalMode === 'ban' ? 'banned' : modalMode === 'suspend' ? 'suspended' : 'active'
                  )
                }
                className={`flex-1 py-2 rounded-xl text-xs font-bold shadow-md ${
                  modalMode === 'unban'
                    ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                    : 'bg-rose-600 hover:bg-rose-500 text-white'
                }`}
              >
                Confirm {modalMode.toUpperCase()}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

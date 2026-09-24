import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  ArrowLeft,
  User,
  MessageSquare,
  Image,
  Users,
  AlertTriangle,
  FileText,
  Clock,
  Ban,
  RefreshCw,
  Download,
  Trash2,
  Eye,
  ExternalLink,
  Plus,
  Activity,
  AlertOctagon,
  ChevronRight,
} from 'lucide-react';
import {
  UserProfile,
  GalleryItem,
  MessageItem,
  ConversationItem,
} from '../../types';
import {
  getUserProfileDetail,
  getUserConversationsForAdmin,
  getUserGalleryForAdmin,
  getUserConnectionDetailsForAdmin,
  setUserStatus,
  deleteGalleryItem,
  logAdminAction,
} from '../../lib/adminApi';
import {
  AdminNote,
  getAdminNotesForUser,
  addAdminNote,
  deleteAdminNote,
  SafetyReport,
  getSafetyReports,
} from '../../lib/safetyApi';
import { formatDetailedDate } from '../../lib/utils';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { Avatar } from '../common/Avatar';

interface User360ViewProps {
  userId: string;
  initialTab?: 'overview' | 'chats' | 'media' | 'reports' | 'activity' | 'notes';
  onBack: () => void;
  onNavigateToConversation?: (conversationId: string, highlightMessageId?: string) => void;
  onNavigateToReport?: (reportId: string) => void;
}

export type User360Tab = 'overview' | 'chats' | 'media' | 'reports' | 'activity' | 'notes';

export const User360View: React.FC<User360ViewProps> = ({
  userId,
  initialTab = 'overview',
  onBack,
  onNavigateToConversation,
  onNavigateToReport,
}) => {
  const { user: currentAdmin } = useAuth();
  const { showToast } = useToast();

  const [activeTab, setActiveTab] = useState<User360Tab>(initialTab);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Metrics
  const [metrics, setMetrics] = useState({
    totalChats: 0,
    totalConnections: 0,
    totalGalleryItems: 0,
    totalReportsAgainst: 0,
    totalNotes: 0,
  });

  // Data stores
  const [conversations, setConversations] = useState<
    (ConversationItem & { partnerProfile: UserProfile; messages: MessageItem[] })[]
  >([]);
  const [galleryItems, setGalleryItems] = useState<GalleryItem[]>([]);
  const [safetyReports, setSafetyReports] = useState<SafetyReport[]>([]);
  const [adminNotes, setAdminNotes] = useState<AdminNote[]>([]);

  // Selected lightbox image
  const [activeLightboxImage, setActiveLightboxImage] = useState<GalleryItem | null>(null);

  // Moderation modal
  const [modModal, setModModal] = useState<'suspend' | 'ban' | 'unban' | null>(null);
  const [modReason, setModReason] = useState('');
  const [modSubmitting, setModSubmitting] = useState(false);

  // Add Note modal
  const [isAddingNote, setIsAddingNote] = useState(false);
  const [noteCategory, setNoteCategory] = useState<'warning' | 'investigation' | 'flag' | 'general' | 'cleared'>('general');
  const [noteText, setNoteText] = useState('');

  // Load all user 360 data
  const loadAllUserData = useCallback(async () => {
    if (!currentAdmin || !userId) return;
    setLoading(true);
    setErrorMessage(null);
    try {
      const [
        profileRes,
        convsRes,
        galleryRes,
        connsRes,
        reportsRes,
        notesRes,
      ] = await Promise.all([
        getUserProfileDetail(userId),
        getUserConversationsForAdmin(userId, currentAdmin.id),
        getUserGalleryForAdmin(userId, currentAdmin.id),
        getUserConnectionDetailsForAdmin(userId),
        getSafetyReports(currentAdmin.id),
        getAdminNotesForUser(userId),
      ]);

      setProfile(profileRes.profile);
      setConversations(convsRes);
      setGalleryItems(galleryRes);

      const userReports = reportsRes.filter((r: SafetyReport) => r.reportedUserId === userId);
      setSafetyReports(userReports);
      setAdminNotes(notesRes);

      setMetrics({
        totalChats: profileRes.totalChats,
        totalConnections: connsRes.connections.length,
        totalGalleryItems: profileRes.totalGalleryItems,
        totalReportsAgainst: userReports.length,
        totalNotes: notesRes.length,
      });

      await logAdminAction(currentAdmin.id, 'VIEW_USER_360', userId, null, {
        username: profileRes.profile.username,
        uid: profileRes.profile.uid,
      });
    } catch (err) {
      console.error('Failed to load User 360:', err);
      setErrorMessage(err instanceof Error ? err.message : 'Failed to load user profile');
    } finally {
      setLoading(false);
    }
  }, [currentAdmin, userId]);

  useEffect(() => {
    loadAllUserData();
  }, [loadAllUserData]);

  // Handle status update
  const handleApplyStatus = async (status: 'active' | 'suspended' | 'banned') => {
    if (!currentAdmin || !profile) return;
    setModSubmitting(true);
    try {
      await setUserStatus(currentAdmin.id, profile.id, status, modReason.trim());
      showToast(`User status updated to ${status.toUpperCase()}`, 'success');
      setModModal(null);
      setModReason('');
      await loadAllUserData();
    } catch (err) {
      console.error('Moderation error:', err);
      showToast(err instanceof Error ? err.message : 'Action failed', 'error');
    } finally {
      setModSubmitting(false);
    }
  };

  // Handle add note
  const handleSaveNote = async () => {
    if (!currentAdmin || !noteText.trim()) return;
    try {
      const created = await addAdminNote(
        currentAdmin.id,
        currentAdmin.display_name || 'Admin',
        userId,
        noteText.trim(),
        noteCategory
      );
      setAdminNotes(prev => [created, ...prev]);
      setMetrics(prev => ({ ...prev, totalNotes: prev.totalNotes + 1 }));
      setIsAddingNote(false);
      setNoteText('');
      showToast('Internal note saved', 'success');
    } catch (err) {
      console.error('Failed to save note:', err);
      showToast('Could not save note', 'error');
    }
  };

  // Handle delete note
  const handleDeleteNote = async (noteId: string) => {
    if (!currentAdmin) return;
    try {
      await deleteAdminNote(noteId, currentAdmin.id);
      setAdminNotes(prev => prev.filter(n => n.id !== noteId));
      setMetrics(prev => ({ ...prev, totalNotes: Math.max(0, prev.totalNotes - 1) }));
      showToast('Note deleted', 'info');
    } catch (err) {
      console.error('Failed to delete note:', err);
      showToast('Could not delete note', 'error');
    }
  };

  // Download media
  const handleDownloadMedia = async (item: GalleryItem) => {
    if (!currentAdmin || !profile) return;
    await logAdminAction(currentAdmin.id, 'DOWNLOAD_USER_MEDIA', profile.id, item.id, {
      storage_path: item.storage_path,
    });
    const link = document.createElement('a');
    link.href = item.image_url;
    link.download = `${profile.uid}_media_${item.id}.jpg`;
    link.target = '_blank';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('Media download initiated', 'info');
  };

  // Delete media
  const handleDeleteMedia = async (item: GalleryItem) => {
    if (!currentAdmin) return;
    if (!confirm('Are you sure you want to permanently delete this media item?')) return;
    try {
      await deleteGalleryItem(currentAdmin.id, item);
      setGalleryItems(prev => prev.filter(g => g.id !== item.id));
      if (activeLightboxImage?.id === item.id) {
        setActiveLightboxImage(null);
      }
      setMetrics(prev => ({ ...prev, totalGalleryItems: Math.max(0, prev.totalGalleryItems - 1) }));
      showToast('Media permanently removed', 'info');
    } catch (err) {
      console.error('Delete media error:', err);
      showToast('Failed to delete media', 'error');
    }
  };

  // Synthetic activity timeline based on real data
  const activityTimeline = useMemo(() => {
    const events: {
      id: string;
      date: string;
      title: string;
      description: string;
      type: 'registration' | 'chat' | 'media' | 'report' | 'connection' | 'status';
      onClick?: () => void;
    }[] = [];

    if (profile) {
      events.push({
        id: 'reg',
        date: profile.created_at,
        title: 'User Account Registered',
        description: `Registered with handle @${profile.username || 'none'} and UID ${profile.uid}`,
        type: 'registration',
      });
    }

    conversations.forEach(conv => {
      conv.messages.forEach(msg => {
        if (msg.sender_id === userId) {
          events.push({
            id: `msg-${msg.id}`,
            date: msg.created_at,
            title: `Sent message to @${conv.partnerProfile.display_name || conv.partnerProfile.uid}`,
            description: msg.content.length > 50 ? `${msg.content.slice(0, 50)}...` : msg.content,
            type: 'chat',
            onClick: () => {
              if (onNavigateToConversation) {
                onNavigateToConversation(conv.id, msg.id);
              }
            },
          });
        }
      });
    });

    galleryItems.forEach(gal => {
      events.push({
        id: `gal-${gal.id}`,
        date: gal.created_at,
        title: 'Uploaded to gallery',
        description: gal.caption || 'Gallery photo',
        type: 'media',
        onClick: () => {
          setActiveLightboxImage(gal);
        },
      });
    });

    safetyReports.forEach(rep => {
      events.push({
        id: `rep-${rep.id}`,
        date: rep.createdAt,
        title: `Reported for ${rep.category.replace('_', ' ')}`,
        description: rep.reason || `Status: ${rep.status}`,
        type: 'report',
        onClick: () => {
          if (onNavigateToReport) {
            onNavigateToReport(rep.id);
          } else {
            setActiveTab('reports');
          }
        },
      });
    });

    return events.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [profile, conversations, galleryItems, safetyReports, userId, onNavigateToConversation, onNavigateToReport]);

  if (loading) {
    return (
      <div className="bg-vault-900 border border-vault-800 rounded-3xl p-12 flex flex-col items-center justify-center gap-3 animate-fade-in">
        <RefreshCw className="w-8 h-8 text-arcade-gold animate-spin" />
        <span className="text-xs text-vault-300 font-bold">Assembling User 360 Matrix...</span>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="bg-rose-950/60 border border-rose-800 rounded-3xl p-8 text-center space-y-3">
        <AlertTriangle className="w-10 h-10 text-rose-400 mx-auto" />
        <h3 className="text-base font-bold text-white">User Not Found</h3>
        <p className="text-xs text-rose-200">
          The requested user record ({userId}) does not exist or has been purged.
        </p>
        <button
          onClick={onBack}
          className="mt-4 px-4 py-2 bg-vault-800 hover:bg-vault-700 text-white rounded-xl text-xs font-bold"
        >
          Return
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-24 animate-fade-in text-vault-100">
      {/* Top Header Bar */}
      <div className="flex items-center justify-between pb-2 border-b border-vault-800">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-xs font-bold text-arcade-gold hover:text-amber-300 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Registry</span>
        </button>

        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono text-vault-400 bg-vault-950 px-2.5 py-0.5 rounded-full border border-vault-800">
            ID: {profile.id}
          </span>
          <button
            onClick={loadAllUserData}
            className="p-1.5 bg-vault-900 hover:bg-vault-800 text-vault-300 hover:text-white rounded-lg border border-vault-800 transition-colors"
            title="Reload user record"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {errorMessage && (
        <div className="bg-rose-950/50 border border-rose-800/80 rounded-2xl p-3.5 text-xs text-rose-200 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* User 360 Header Profile Card */}
      <div className="bg-vault-900 border border-vault-800 rounded-3xl p-5 shadow-lg flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="flex items-center gap-4">
          <Avatar name={profile.display_name ?? ''} seed={profile.uid} src={profile.avatar_url} size={72} />
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-lg font-bold text-white tracking-wide">
                {profile.display_name}
              </h2>
              {profile.role === 'super_admin' && (
                <span className="px-2 py-0.5 bg-amber-950 border border-amber-600/50 text-amber-300 rounded text-[9px] font-bold font-mono">
                  SUPER ADMIN
                </span>
              )}
              <span
                className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border ${
                  profile.status === 'active'
                    ? 'bg-emerald-950/80 text-emerald-300 border-emerald-700/50'
                    : profile.status === 'suspended'
                    ? 'bg-amber-950/80 text-amber-300 border-amber-700/50'
                    : 'bg-rose-950/80 text-rose-300 border-rose-700/50'
                }`}
              >
                {profile.status}
              </span>
            </div>

            <div className="flex items-center gap-2 text-xs font-mono text-vault-400 mt-1">
              <span>@{profile.username || 'unknown'}</span>
              <span>•</span>
              <span className="text-arcade-gold font-bold">{profile.uid}</span>
              <span>•</span>
              <span className="text-vault-500">Joined {formatDetailedDate(profile.created_at)}</span>
            </div>
          </div>
        </div>

        {/* Header Quick Actions */}
        {profile.id !== currentAdmin?.id && (
          <div className="flex items-center gap-2 self-start md:self-auto">
            {profile.status !== 'active' ? (
              <button
                onClick={() => setModModal('unban')}
                className="px-3.5 py-2 bg-emerald-950 hover:bg-emerald-900 border border-emerald-600/60 text-emerald-300 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-sm"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Restore Account</span>
              </button>
            ) : (
              <>
                <button
                  onClick={() => setModModal('suspend')}
                  className="px-3 py-2 bg-amber-950 hover:bg-amber-900 border border-amber-600/60 text-amber-300 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5"
                >
                  <Clock className="w-3.5 h-3.5" />
                  <span>Suspend</span>
                </button>
                <button
                  onClick={() => setModModal('ban')}
                  className="px-3 py-2 bg-rose-950 hover:bg-rose-900 border border-rose-600/60 text-rose-300 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5"
                >
                  <Ban className="w-3.5 h-3.5" />
                  <span>Ban</span>
                </button>
              </>
            )}

            <button
              onClick={() => setIsAddingNote(true)}
              className="px-3 py-2 bg-vault-800 hover:bg-vault-700 text-vault-200 rounded-xl text-xs font-bold flex items-center gap-1.5 border border-vault-700 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Note</span>
            </button>
          </div>
        )}
      </div>

      {/* Navigation Sub-Tabs */}
      <div className="bg-vault-900 border border-vault-800 rounded-2xl p-1 flex items-center gap-1 overflow-x-auto">
        <button
          onClick={() => setActiveTab('overview')}
          className={`flex-1 min-w-[90px] py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
            activeTab === 'overview'
              ? 'bg-arcade-gold text-vault-950 shadow-sm'
              : 'text-vault-400 hover:text-white'
          }`}
        >
          <User className="w-3.5 h-3.5" />
          <span>Overview</span>
        </button>

        <button
          onClick={() => setActiveTab('chats')}
          className={`flex-1 min-w-[90px] py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
            activeTab === 'chats'
              ? 'bg-arcade-gold text-vault-950 shadow-sm'
              : 'text-vault-400 hover:text-white'
          }`}
        >
          <MessageSquare className="w-3.5 h-3.5" />
          <span>Chats ({metrics.totalChats})</span>
        </button>

        <button
          onClick={() => setActiveTab('media')}
          className={`flex-1 min-w-[90px] py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
            activeTab === 'media'
              ? 'bg-arcade-gold text-vault-950 shadow-sm'
              : 'text-vault-400 hover:text-white'
          }`}
        >
          <Image className="w-3.5 h-3.5" />
          <span>Media ({metrics.totalGalleryItems})</span>
        </button>

        <button
          onClick={() => setActiveTab('reports')}
          className={`flex-1 min-w-[90px] py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
            activeTab === 'reports'
              ? 'bg-arcade-gold text-vault-950 shadow-sm'
              : 'text-vault-400 hover:text-white'
          }`}
        >
          <AlertTriangle className="w-3.5 h-3.5" />
          <span>Reports ({metrics.totalReportsAgainst})</span>
        </button>

        <button
          onClick={() => setActiveTab('activity')}
          className={`flex-1 min-w-[90px] py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
            activeTab === 'activity'
              ? 'bg-arcade-gold text-vault-950 shadow-sm'
              : 'text-vault-400 hover:text-white'
          }`}
        >
          <Activity className="w-3.5 h-3.5" />
          <span>Activity</span>
        </button>

        <button
          onClick={() => setActiveTab('notes')}
          className={`flex-1 min-w-[90px] py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
            activeTab === 'notes'
              ? 'bg-arcade-gold text-vault-950 shadow-sm'
              : 'text-vault-400 hover:text-white'
          }`}
        >
          <FileText className="w-3.5 h-3.5" />
          <span>Staff Notes ({metrics.totalNotes})</span>
        </button>
      </div>

      {/* ========================================================================= */}
      {/* 1. OVERVIEW TAB */}
      {/* ========================================================================= */}
      {activeTab === 'overview' && (
        <div className="space-y-4 animate-fade-in">
          {/* Key Metrics Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <div
              onClick={() => setActiveTab('chats')}
              className="bg-vault-900 border border-vault-800 hover:border-arcade-gold/50 rounded-2xl p-3.5 cursor-pointer transition-all"
            >
              <div className="text-[10px] text-vault-400 uppercase font-bold">Conversations</div>
              <div className="text-xl font-bold text-white mt-1">{metrics.totalChats}</div>
              <div className="text-[10px] text-arcade-gold mt-1 flex items-center gap-1 font-semibold">
                <span>Inspect DMs</span>
                <ChevronRight className="w-3 h-3" />
              </div>
            </div>

            <div
              onClick={() => setActiveTab('media')}
              className="bg-vault-900 border border-vault-800 hover:border-arcade-gold/50 rounded-2xl p-3.5 cursor-pointer transition-all"
            >
              <div className="text-[10px] text-vault-400 uppercase font-bold">Private Media</div>
              <div className="text-xl font-bold text-white mt-1">{metrics.totalGalleryItems}</div>
              <div className="text-[10px] text-arcade-gold mt-1 flex items-center gap-1 font-semibold">
                <span>View gallery</span>
                <ChevronRight className="w-3 h-3" />
              </div>
            </div>

            <div className="bg-vault-900 border border-vault-800 rounded-2xl p-3.5">
              <div className="text-[10px] text-vault-400 uppercase font-bold">Connections</div>
              <div className="text-xl font-bold text-arcade-gold mt-1">
                {metrics.totalConnections}
              </div>
              <div className="text-[10px] text-vault-500 mt-1">Active Friends</div>
            </div>

            <div
              onClick={() => setActiveTab('reports')}
              className={`bg-vault-900 border rounded-2xl p-3.5 cursor-pointer transition-all ${
                metrics.totalReportsAgainst > 0
                  ? 'border-rose-700/60 bg-rose-950/20'
                  : 'border-vault-800'
              }`}
            >
              <div className="text-[10px] text-rose-300 uppercase font-bold">Reports Against</div>
              <div className="text-xl font-bold text-rose-400 mt-1">
                {metrics.totalReportsAgainst}
              </div>
              <div className="text-[10px] text-rose-300/80 mt-1 flex items-center gap-1 font-semibold">
                <span>View Reports</span>
                <ChevronRight className="w-3 h-3" />
              </div>
            </div>
          </div>

          {/* Interactive Activity Timeline */}
          <div className="bg-vault-900 border border-vault-800 rounded-3xl p-5 space-y-3">
            <div className="flex items-center justify-between border-b border-vault-800 pb-2.5">
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-arcade-gold" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-white">
                  Interactive Activity Timeline
                </h3>
              </div>
              <span className="text-[10px] text-vault-500 font-mono">
                Click any item to jump directly to context
              </span>
            </div>

            {activityTimeline.length === 0 ? (
              <div className="text-center text-xs text-vault-500 py-6">
                No recorded activity found for this user.
              </div>
            ) : (
              <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
                {activityTimeline.slice(0, 15).map(item => (
                  <div
                    key={item.id}
                    onClick={item.onClick}
                    className={`p-3 rounded-2xl border transition-all flex items-start justify-between gap-3 ${
                      item.onClick
                        ? 'bg-vault-950 hover:bg-vault-850 border-vault-800 hover:border-arcade-gold/50 cursor-pointer shadow-sm'
                        : 'bg-vault-950 border-vault-800/60'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div className="p-2 rounded-xl bg-vault-900 border border-vault-800 text-arcade-gold mt-0.5">
                        {item.type === 'chat' && <MessageSquare className="w-3.5 h-3.5" />}
                        {item.type === 'media' && <Image className="w-3.5 h-3.5" />}
                        {item.type === 'report' && <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />}
                        {item.type === 'registration' && <User className="w-3.5 h-3.5" />}
                        {item.type === 'connection' && <Users className="w-3.5 h-3.5" />}
                      </div>

                      <div>
                        <div className="text-xs font-bold text-white flex items-center gap-2">
                          <span>{item.title}</span>
                          {item.onClick && (
                            <ExternalLink className="w-3 h-3 text-vault-500" />
                          )}
                        </div>
                        <p className="text-[11px] text-vault-400 mt-0.5">{item.description}</p>
                      </div>
                    </div>

                    <span className="text-[10px] text-vault-500 font-mono whitespace-nowrap">
                      {formatDetailedDate(item.date)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 2. CHATS TAB */}
      {/* ========================================================================= */}
      {activeTab === 'chats' && (
        <div className="space-y-3 animate-fade-in">
          {conversations.length === 0 ? (
            <div className="bg-vault-900 border border-vault-800 rounded-2xl p-8 text-center text-xs text-vault-400">
              No conversations found for this user.
            </div>
          ) : (
            <div className="space-y-2">
              {conversations.map(c => {
                const lastMsg = c.messages[c.messages.length - 1];
                return (
                  <div
                    key={c.id}
                    onClick={() => {
                      if (onNavigateToConversation) {
                        onNavigateToConversation(c.id);
                      }
                    }}
                    className="bg-vault-900 hover:bg-vault-850 border border-vault-800 hover:border-vault-700 rounded-2xl p-3.5 cursor-pointer transition-all shadow-sm flex items-center justify-between"
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
                        <p className="text-[11px] text-vault-400 truncate max-w-[250px] mt-0.5">
                          {lastMsg ? lastMsg.content : 'No messages'}
                        </p>
                        <div className="text-[9px] text-vault-500 mt-0.5">
                          ID: {c.id} • Last active: {formatDetailedDate(c.updated_at)}
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
        </div>
      )}

      {/* ========================================================================= */}
      {/* 3. MEDIA TAB */}
      {/* ========================================================================= */}
      {activeTab === 'media' && (
        <div className="space-y-3 animate-fade-in">
          {galleryItems.length === 0 ? (
            <div className="bg-vault-900 border border-vault-800 rounded-2xl p-8 text-center text-xs text-vault-400">
              No private gallery uploads found for this user.
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
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
                    <p className="text-xs text-white truncate font-medium">
                      {item.caption || 'Photo'}
                    </p>
                    <div className="text-[9px] text-vault-500 mt-0.5">
                      {formatDetailedDate(item.created_at)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* 4. REPORTS TAB */}
      {/* ========================================================================= */}
      {activeTab === 'reports' && (
        <div className="space-y-3 animate-fade-in">
          {safetyReports.length === 0 ? (
            <div className="bg-vault-900 border border-vault-800 rounded-2xl p-8 text-center text-xs text-vault-400">
              No reports filed against this user. Clean record!
            </div>
          ) : (
            <div className="space-y-2">
              {safetyReports.map(rep => (
                <div
                  key={rep.id}
                  onClick={() => onNavigateToReport?.(rep.id)}
                  className="bg-vault-900 hover:bg-vault-850 border border-vault-800 hover:border-vault-700 rounded-2xl p-4 cursor-pointer transition-all shadow-sm space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <AlertOctagon className="w-4 h-4 text-rose-400" />
                      <span className="text-xs font-bold text-white">{rep.category.replace('_', ' ')}</span>
                      <span className="text-[10px] font-mono text-vault-400">
                        #{rep.id.slice(0, 8)}
                      </span>
                    </div>

                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase font-mono ${
                        rep.status === 'pending'
                          ? 'bg-rose-950 text-rose-300 border border-rose-800'
                          : rep.status === 'investigating'
                          ? 'bg-amber-950 text-amber-300 border border-amber-800'
                          : rep.status === 'resolved'
                          ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                          : 'bg-vault-800 text-vault-400 border border-vault-700'
                      }`}
                    >
                      {rep.status}
                    </span>
                  </div>

                  {rep.reason && (
                    <div className="p-2.5 rounded-xl bg-vault-950 border border-vault-850 text-xs text-rose-200 font-mono">
                      "{rep.reason}"
                    </div>
                  )}

                  {rep.notes && (
                    <p className="text-xs text-vault-300 leading-relaxed">{rep.notes}</p>
                  )}

                  <div className="flex items-center justify-between text-[10px] text-vault-500 pt-1 border-t border-vault-800/60">
                    <span>Reporter ID: {rep.reporterId}</span>
                    <span>{formatDetailedDate(rep.createdAt)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* 5. ACTIVITY TAB */}
      {/* ========================================================================= */}
      {activeTab === 'activity' && (
        <div className="space-y-3 animate-fade-in">
          <div className="bg-vault-900 border border-vault-800 rounded-3xl p-5 space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-vault-400 border-b border-vault-800 pb-2">
              Complete User Activity Log ({activityTimeline.length} events)
            </h3>

            <div className="space-y-2">
              {activityTimeline.map(item => (
                <div
                  key={item.id}
                  onClick={item.onClick}
                  className={`p-3 rounded-2xl border transition-all flex items-start justify-between gap-3 ${
                    item.onClick
                      ? 'bg-vault-950 hover:bg-vault-850 border-vault-800 hover:border-arcade-gold/50 cursor-pointer shadow-sm'
                      : 'bg-vault-950 border-vault-800/60'
                  }`}
                >
                  <div>
                    <div className="text-xs font-bold text-white flex items-center gap-1.5">
                      <span>{item.title}</span>
                      {item.onClick && <ExternalLink className="w-3 h-3 text-vault-500" />}
                    </div>
                    <p className="text-[11px] text-vault-400 mt-0.5">{item.description}</p>
                  </div>
                  <span className="text-[10px] text-vault-500 font-mono whitespace-nowrap">
                    {formatDetailedDate(item.date)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 6. STAFF NOTES TAB */}
      {/* ========================================================================= */}
      {activeTab === 'notes' && (
        <div className="space-y-3 animate-fade-in">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wider text-vault-400">
              Internal Staff Notes (Admin Confidential)
            </h3>
            <button
              onClick={() => setIsAddingNote(true)}
              className="px-3 py-1.5 bg-arcade-gold text-vault-950 rounded-xl text-xs font-bold flex items-center gap-1 shadow-sm"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Note</span>
            </button>
          </div>

          {adminNotes.length === 0 ? (
            <div className="bg-vault-900 border border-vault-800 rounded-2xl p-8 text-center text-xs text-vault-400">
              No staff notes on this user yet.
            </div>
          ) : (
            <div className="space-y-2.5">
              {adminNotes.map(n => (
                <div
                  key={n.id}
                  className="bg-vault-900 border border-vault-800 rounded-2xl p-4 space-y-2 shadow-sm"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase font-mono ${
                          n.category === 'warning'
                            ? 'bg-amber-950 text-amber-300 border border-amber-800'
                            : n.category === 'flag'
                            ? 'bg-rose-950 text-rose-300 border border-rose-800'
                            : n.category === 'investigation'
                            ? 'bg-blue-950 text-blue-300 border border-blue-800'
                            : 'bg-vault-800 text-vault-300 border border-vault-700'
                        }`}
                      >
                        {n.category.replace('_', ' ')}
                      </span>
                      <span className="text-xs font-bold text-white">
                        Author: {n.adminName}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-vault-500 font-mono">
                        {formatDetailedDate(n.createdAt)}
                      </span>
                      <button
                        onClick={() => handleDeleteNote(n.id)}
                        className="p-1 hover:bg-rose-950/60 text-vault-500 hover:text-rose-400 rounded transition-colors"
                        title="Delete note"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <p className="text-xs text-vault-200 leading-relaxed bg-vault-950 p-3 rounded-xl border border-vault-850">
                    {n.note}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Lightbox Modal */}
      {activeLightboxImage && (
        <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex flex-col items-center justify-center p-4 animate-fade-in">
          <div className="w-full max-w-md flex items-center justify-between text-white pb-3">
            <span className="text-xs font-bold font-mono text-arcade-gold">
              {profile.uid} • {activeLightboxImage.id}
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
        </div>
      )}

      {/* Add Staff Note Modal */}
      {isAddingNote && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-vault-900 border border-vault-700/80 rounded-3xl w-full max-w-sm p-6 flex flex-col shadow-2xl space-y-4">
            <div className="flex items-center gap-2 text-arcade-gold font-bold">
              <FileText className="w-5 h-5 text-arcade-gold" />
              <span className="text-sm uppercase tracking-wide">Add Internal Staff Note</span>
            </div>

            <div>
              <label className="block text-[10px] font-bold text-vault-400 uppercase tracking-wider mb-1">
                Category
              </label>
              <select
                value={noteCategory}
                onChange={e => setNoteCategory(e.target.value as AdminNote['category'])}
                className="w-full bg-vault-950 border border-vault-700 rounded-xl px-3 py-2 text-xs text-white outline-none"
              >
                <option value="general">General Note</option>
                <option value="warning">Warning / Risk</option>
                <option value="investigation">Investigation Record</option>
                <option value="flag">Flagged Profile</option>
                <option value="cleared">Cleared Observation</option>
              </select>
            </div>

            <div>
              <label className="block text-[10px] font-bold text-vault-400 uppercase tracking-wider mb-1">
                Note Content
              </label>
              <textarea
                value={noteText}
                onChange={e => setNoteText(e.target.value)}
                placeholder="Enter confidential observation..."
                rows={4}
                className="w-full bg-vault-950 border border-vault-700 focus:border-amber-500 rounded-xl p-2.5 text-xs text-white placeholder-vault-600 outline-none resize-none"
              />
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setIsAddingNote(false);
                  setNoteText('');
                }}
                className="flex-1 py-2 bg-vault-800 hover:bg-vault-700 text-vault-300 rounded-xl text-xs font-bold transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveNote}
                className="flex-1 py-2 bg-arcade-gold hover:bg-amber-400 text-vault-950 rounded-xl text-xs font-bold shadow-md transition-colors"
              >
                Save Note
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Moderation Disciplinary Action Modal */}
      {modModal && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-vault-900 border border-vault-700/80 rounded-3xl w-full max-w-sm p-6 flex flex-col shadow-2xl space-y-4">
            <div className="flex items-center gap-2 text-rose-400 font-bold">
              <AlertTriangle className="w-5 h-5" />
              <span className="text-sm uppercase tracking-wide">
                Confirm {modModal.toUpperCase()} Action
              </span>
            </div>

            <p className="text-xs text-vault-300">
              Apply <strong>{modModal.toUpperCase()}</strong> to{' '}
              <strong className="text-white">{profile.display_name}</strong> ({profile.uid})
            </p>

            <div>
              <label className="block text-[10px] font-bold text-vault-400 uppercase tracking-wider mb-1">
                Reason / Moderator Audit Note
              </label>
              <textarea
                value={modReason}
                onChange={e => setModReason(e.target.value)}
                placeholder="Reason for suspension / ban..."
                rows={3}
                className="w-full bg-vault-950 border border-vault-700 focus:border-amber-500 rounded-xl p-2.5 text-xs text-white placeholder-vault-600 outline-none resize-none"
              />
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setModModal(null);
                  setModReason('');
                }}
                className="flex-1 py-2 bg-vault-800 hover:bg-vault-700 text-vault-300 rounded-xl text-xs font-bold"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() =>
                  handleApplyStatus(
                    modModal === 'ban' ? 'banned' : modModal === 'suspend' ? 'suspended' : 'active'
                  )
                }
                disabled={modSubmitting}
                className={`flex-1 py-2 rounded-xl text-xs font-bold shadow-md transition-colors ${
                  modModal === 'unban'
                    ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                    : 'bg-rose-600 hover:bg-rose-500 text-white'
                }`}
              >
                {modSubmitting ? 'Applying...' : `Execute ${modModal.toUpperCase()}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

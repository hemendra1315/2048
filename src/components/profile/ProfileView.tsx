import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  Lock,
  Copy,
  LogOut,
  Settings as SettingsIcon,
  Edit3,
  QrCode,
  Users,
  Plus,
  ChevronRight,
  Camera,
  X,
  Check,
  Image as ImageIcon,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { useVault } from '../../context/VaultContext';
import { supabase, isSupabaseConfigured } from '../../lib/supabase';
import { mockBackend } from '../../lib/mockBackend';
import { Avatar } from '../common/Avatar';
import { SettingsView } from '../settings/SettingsView';
import { AvatarCropper } from './AvatarCropper';
import { uploadAvatarImage } from '../../lib/storageHelper';
import { capturePhoto, choosePhoto, CameraError } from '../../lib/nativeCamera';
import { useBackHandler } from '../../lib/backButton';

interface ProfileViewProps {
  onOpenSettings?: () => void;
}

export const ProfileView: React.FC<ProfileViewProps> = () => {
  const { user, updateProfile, logout } = useAuth();
  const { showToast } = useToast();
  const { panicLock } = useVault();

  const [showSettings, setShowSettings] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editDisplayName, setEditDisplayName] = useState('');
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [photoSheetOpen, setPhotoSheetOpen] = useState(false);
  const [cropSource, setCropSource] = useState<string | null>(null);
  const [isSavingAvatar, setIsSavingAvatar] = useState(false);

  const [stats, setStats] = useState({
    connections: 0,
    media: 0,
    messages: 0,
  });
  const [recentConnections, setRecentConnections] = useState<Array<{ id: string; name: string; uid: string; online: boolean }>>([]);

  useEffect(() => {
    if (!user) return;
    setEditDisplayName(user.display_name || '');

    const loadProfileStats = async () => {
      try {
        if (isSupabaseConfigured()) {
          const [{ count: galleryCount }, { count: messageCount }, { count: connectionCount }, { data: profiles }] = await Promise.all([
            supabase.from('gallery_items').select('*', { count: 'exact', head: true }).eq('user_id', user.id),
            supabase.from('messages').select('*', { count: 'exact', head: true }).eq('sender_id', user.id),
            supabase.from('connections').select('*', { count: 'exact', head: true }).or(`user_a.eq.${user.id},user_b.eq.${user.id}`),
            supabase.from('profiles').select('id, display_name, uid').neq('id', user.id).limit(6),
          ]);

          setStats({
            connections: connectionCount ?? 0,
            media: galleryCount ?? 0,
            messages: messageCount ?? 0,
          });

          if (profiles && profiles.length > 0) {
            setRecentConnections(
              profiles.map((p, i) => ({
                id: p.id,
                name: (p.display_name || 'Contact').split(' ')[0],
                uid: p.uid,
                online: i % 2 === 0,
              }))
            );
          } else {
            setRecentConnections([]);
          }
        } else {
          const gallery = mockBackend.getGallery(user.id);
          const allProfiles = mockBackend.getProfiles().filter(p => p.id !== user.id);
          setStats({
            connections: allProfiles.length,
            media: gallery.length,
            messages: 0,
          });
          setRecentConnections(
            allProfiles.slice(0, 5).map((p, i) => ({
              id: p.id,
              name: (p.display_name || 'Contact').split(' ')[0],
              uid: p.uid,
              online: i % 2 === 0,
            }))
          );
        }
      } catch (err) {
        console.warn('Error loading profile stats:', err);
      }
    };

    void loadProfileStats();
  }, [user]);

  const copyUid = () => {
    if (user?.uid) {
      navigator.clipboard.writeText(user.uid);
      showToast(`UID ${user.uid} copied to clipboard`, 'success');
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editDisplayName.trim()) {
      showToast('Display name cannot be empty', 'error');
      return;
    }
    setIsSavingProfile(true);
    try {
      await updateProfile({ display_name: editDisplayName.trim() });
      setIsEditModalOpen(false);
    } catch {
      // Toast already handled by updateProfile
    } finally {
      setIsSavingProfile(false);
    }
  };

  // Object URLs for the cropper are released as soon as the cropper closes.
  useEffect(() => {
    if (!cropSource) return;
    return () => URL.revokeObjectURL(cropSource);
  }, [cropSource]);

  const pickAvatar = async (source: 'camera' | 'library') => {
    setPhotoSheetOpen(false);
    try {
      const blob = source === 'camera' ? await capturePhoto({ direction: 'front', maxSize: 2048 }) : await choosePhoto();
      if (blob) setCropSource(URL.createObjectURL(blob));
    } catch (err) {
      console.error('[profile] photo selection failed', err);
      showToast(err instanceof CameraError || err instanceof Error ? err.message : 'Could not open the camera', 'error');
    }
  };

  const saveCroppedAvatar = async (cropped: Blob) => {
    if (!user) return;
    setIsSavingAvatar(true);
    try {
      const avatarUrl = await uploadAvatarImage(cropped, user.id);
      await updateProfile({ avatar_url: avatarUrl });
      setCropSource(null);
    } catch (err) {
      console.error('[profile] avatar save failed', err);
      showToast('Your photo could not be saved. Try again.', 'error');
    } finally {
      setIsSavingAvatar(false);
    }
  };

  const handleLogout = () => {
    logout();
    panicLock();
    showToast('Signed out', 'info');
  };

  useBackHandler(showSettings, () => setShowSettings(false));
  useBackHandler(isEditModalOpen, () => setIsEditModalOpen(false));
  useBackHandler(photoSheetOpen, () => setPhotoSheetOpen(false));
  useBackHandler(Boolean(cropSource), () => setCropSource(null));

  if (showSettings) {
    return <SettingsView onBack={() => setShowSettings(false)} />;
  }

  return (
    <div className="flex flex-col gap-6 pb-4 animate-fade-in select-none">
      {/* Header */}
      <header className="flex items-center justify-between">
        <h1 className="t-h1 m-0">Profile</h1>

        <button
          type="button"
          onClick={() => setShowSettings(true)}
          className="ib ib-s rounded-xl"
          aria-label="Open settings"
          title="Settings"
        >
          <SettingsIcon className="i" aria-hidden />
        </button>
      </header>

      {/* Profile Hero Card */}
      <section className="flex flex-col items-center text-center">
        <div className="relative">
          <Avatar
            name={user?.display_name || 'User'}
            seed={user?.uid}
            src={user?.avatar_url}
            size={96}
          />
          <button
            type="button"
            onClick={() => setPhotoSheetOpen(true)}
            className="absolute bottom-0 right-0 w-8 h-8 rounded-full bg-vault-800 border-2 border-vault-950 flex items-center justify-center text-vault-200 hover:bg-vault-700 active:scale-95 transition-all shadow-md cursor-pointer"
            aria-label="Change profile photo"
          >
            <Camera className="w-4 h-4" aria-hidden />
          </button>
        </div>

        <h2 className="t-h1 mt-3.5 mb-0.5">
          {user?.display_name || 'User'}
        </h2>
        <p className="t-sm c2 font-mono m-0">
          @{user?.username || user?.uid?.toLowerCase() || 'user'}
        </p>

        {/* UID Chip */}
        <button
          type="button"
          onClick={copyUid}
          title="Click to copy your UID"
          aria-label={`UID ${user?.uid || ''}, click to copy`}
          className="tag tag-em font-mono mt-3 gap-1.5 cursor-pointer hover:opacity-90 active:scale-98 transition-all"
        >
          <ShieldCheck className="w-3.5 h-3.5" aria-hidden />
          <span>{user?.uid || 'ID'}</span>
          <Copy className="w-3 h-3 opacity-70" aria-hidden />
        </button>
      </section>

      {/* 3 Metric Summary Cards */}
      <section className="grid grid-cols-3 gap-2" aria-label="Profile statistics">
        <div className="card p-3.5 flex flex-col items-center justify-center text-center">
          <span className="t-h2 font-bold font-mono text-vault-50">{stats.connections}</span>
          <span className="t-cap c3 mt-0.5">Connections</span>
        </div>
        <div className="card p-3.5 flex flex-col items-center justify-center text-center">
          <span className="t-h2 font-bold font-mono text-vault-50">{stats.media}</span>
          <span className="t-cap c3 mt-0.5">Media</span>
        </div>
        <div className="card p-3.5 flex flex-col items-center justify-center text-center">
          <span className="t-h2 font-bold font-mono text-vault-50">
            {stats.messages >= 1000 ? `${(stats.messages / 1000).toFixed(1)}k` : stats.messages}
          </span>
          <span className="t-cap c3 mt-0.5">Messages</span>
        </div>
      </section>

      {/* Connections Section */}
      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between px-1">
          <h2 className="t-over m-0">Connections</h2>
          {recentConnections.length > 0 && (
            <button
              type="button"
              className="t-sm font-semibold text-cy hover:underline cursor-pointer bg-transparent border-0 p-0"
            >
              See all
            </button>
          )}
        </div>

        <div className="flex items-center gap-3 overflow-x-auto pb-1 -mx-1 px-1 no-scrollbar">
          {/* Add Connection Button */}
          <button
            type="button"
            onClick={() => {
              if (user?.uid) {
                navigator.clipboard.writeText(user.uid);
                showToast(`Share your UID ${user.uid} with contacts`, 'info');
              }
            }}
            className="flex flex-col items-center gap-1.5 shrink-0 group cursor-pointer bg-transparent border-0 p-0"
            aria-label="Add new connection"
          >
            <div className="w-14 h-14 rounded-full border border-dashed border-vault-700 group-hover:border-vault-500 flex items-center justify-center text-vault-400 group-hover:text-white transition-colors">
              <Plus className="w-6 h-6" aria-hidden />
            </div>
            <span className="t-cap text-vault-300 group-hover:text-white">Add</span>
          </button>

          {/* Connection Avatars */}
          {recentConnections.map(c => (
            <div key={c.id} className="flex flex-col items-center gap-1.5 shrink-0">
              <Avatar
                name={c.name}
                seed={c.uid}
                size={56}
                online={c.online}
              />
              <span className="t-cap text-vault-200 truncate max-w-[56px] text-center">{c.name}</span>
            </div>
          ))}

          {recentConnections.length === 0 && (
            <p className="t-cap c3 italic py-3 px-2">No connections yet</p>
          )}
        </div>
      </section>

      {/* Quick Action Navigation Rows */}
      <section className="flex flex-col gap-2">
        <div className="card overflow-hidden">
          <button
            type="button"
            onClick={() => setIsEditModalOpen(true)}
            className="row w-full text-left justify-between"
          >
            <div className="flex items-center gap-3">
              <Edit3 className="i c2" aria-hidden />
              <span className="t-body">Edit profile</span>
            </div>
            <ChevronRight className="i i-sm c3" aria-hidden />
          </button>

          <div className="divider ml-12" />

          <button
            type="button"
            onClick={() => {
              if (user?.uid) {
                navigator.clipboard.writeText(user.uid);
                showToast(`UID ${user.uid} copied to share`, 'success');
              }
            }}
            className="row w-full text-left justify-between"
          >
            <div className="flex items-center gap-3">
              <QrCode className="i c2" aria-hidden />
              <span className="t-body">Share my ID</span>
            </div>
            <ChevronRight className="i i-sm c3" aria-hidden />
          </button>

          <div className="divider ml-12" />

          <button
            type="button"
            onClick={() => showToast('0 pending connection requests', 'info')}
            className="row w-full text-left justify-between"
          >
            <div className="flex items-center gap-3">
              <Users className="i c2" aria-hidden />
              <span className="t-body">Connection requests</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="badge">0</span>
              <ChevronRight className="i i-sm c3" aria-hidden />
            </div>
          </button>

          <div className="divider ml-12" />

          <button
            type="button"
            onClick={() => setShowSettings(true)}
            className="row w-full text-left justify-between"
          >
            <div className="flex items-center gap-3">
              <SettingsIcon className="i c2" aria-hidden />
              <span className="t-body">Settings & Security</span>
            </div>
            <ChevronRight className="i i-sm c3" aria-hidden />
          </button>

          <div className="divider ml-12" />

          <button
            type="button"
            onClick={panicLock}
            className="row w-full text-left justify-between"
          >
            <div className="flex items-center gap-3">
              <Lock className="i c2 text-gold" aria-hidden />
              <span className="t-body">Lock to 2048 disguise</span>
            </div>
            <ChevronRight className="i i-sm c3" aria-hidden />
          </button>

          <div className="divider ml-12" />

          <button
            type="button"
            onClick={handleLogout}
            className="row w-full text-left justify-between !text-[#FF8A93] hover:!text-red-300"
          >
            <div className="flex items-center gap-3">
              <LogOut className="i" aria-hidden />
              <span className="t-body font-semibold">Sign Out</span>
            </div>
            <ChevronRight className="i i-sm opacity-60" aria-hidden />
          </button>
        </div>
      </section>

      {/* Edit Profile Modal */}
      {isEditModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="edit-profile-title"
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 anim-fade"
        >
          <div className="card bg-vault-900 border border-vault-800 rounded-2xl w-full max-w-sm p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 id="edit-profile-title" className="t-h3 font-bold text-white m-0">
                Edit Profile
              </h3>
              <button
                type="button"
                onClick={() => setIsEditModalOpen(false)}
                className="ib ib-s rounded-full text-vault-400 hover:text-white"
                aria-label="Close"
              >
                <X className="i" aria-hidden />
              </button>
            </div>

            <form onSubmit={handleSaveProfile} className="space-y-4">
              <div className="field">
                <label htmlFor="edit-name" className="lab">
                  Display Name
                </label>
                <input
                  id="edit-name"
                  type="text"
                  required
                  value={editDisplayName}
                  onChange={e => setEditDisplayName(e.target.value)}
                  placeholder="Enter your name"
                  className="inp text-sm"
                  maxLength={50}
                />
              </div>

              <div className="flex items-center gap-3">
                <Avatar name={user?.display_name || 'User'} seed={user?.uid} src={user?.avatar_url} size={56} />
                <button
                  type="button"
                  onClick={() => setPhotoSheetOpen(true)}
                  className="btn btn-s btn-sm"
                >
                  <Camera className="i i-sm" aria-hidden />
                  <span>Change photo</span>
                </button>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsEditModalOpen(false)}
                  className="btn btn-s flex-1"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingProfile || !editDisplayName.trim()}
                  className="btn btn-p flex-1"
                >
                  <Check className="i i-sm" aria-hidden />
                  <span>{isSavingProfile ? 'Saving...' : 'Save'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {photoSheetOpen && (
        <div className="fixed inset-0 z-[55] flex items-end justify-center" role="presentation">
          <button
            type="button"
            className="absolute inset-0 bg-black/70 cursor-default"
            aria-label="Close"
            onClick={() => setPhotoSheetOpen(false)}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="photo-sheet-title"
            className="sheet anim-sheet relative w-full max-w-md p-4 pb-[max(20px,env(safe-area-inset-bottom))] flex flex-col gap-2"
          >
            <h3 id="photo-sheet-title" className="t-h3 m-0 mb-1 text-white">Profile photo</h3>
            <button type="button" className="row w-full text-left" onClick={() => pickAvatar('camera')}>
              <Camera className="i c2" aria-hidden />
              <span className="t-body flex-1">Take photo</span>
            </button>
            <button type="button" className="row w-full text-left" onClick={() => pickAvatar('library')}>
              <ImageIcon className="i c2" aria-hidden />
              <span className="t-body flex-1">Choose from photos</span>
            </button>
            <button type="button" className="btn btn-s btn-block mt-1" onClick={() => setPhotoSheetOpen(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {cropSource && (
        <AvatarCropper
          src={cropSource}
          busy={isSavingAvatar}
          onCancel={() => setCropSource(null)}
          onConfirm={saveCroppedAvatar}
        />
      )}
    </div>
  );
};

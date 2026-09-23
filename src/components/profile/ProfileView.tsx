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
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { useVault } from '../../context/VaultContext';
import { supabase, isSupabaseConfigured } from '../../lib/supabase';
import { mockBackend } from '../../lib/mockBackend';
import { Avatar } from '../common/Avatar';
import { SettingsView } from '../settings/SettingsView';

interface ProfileViewProps {
  onOpenSettings?: () => void;
}

export const ProfileView: React.FC<ProfileViewProps> = () => {
  const { user, isSuperAdmin, logout } = useAuth();
  const { showToast } = useToast();
  const { panicLock } = useVault();

  const [showSettings, setShowSettings] = useState(false);
  const [stats, setStats] = useState({
    connections: 24,
    media: 0,
    messages: 120,
  });
  const [recentConnections, setRecentConnections] = useState<Array<{ id: string; name: string; uid: string; online: boolean }>>([
    { id: '1', name: 'Maya', uid: 'MAYA-9102', online: true },
    { id: '2', name: 'Arjun', uid: 'ARJUN-4412', online: false },
    { id: '3', name: 'Lena', uid: 'LENA-8821', online: true },
    { id: '4', name: 'Theo', uid: 'THEO-3109', online: false },
  ]);

  useEffect(() => {
    if (!user) return;
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
            connections: (connectionCount ?? 0) || 24,
            media: galleryCount ?? 0,
            messages: (messageCount ?? 0) || 120,
          });

          if (profiles && profiles.length > 0) {
            setRecentConnections(
              profiles.map((p, i) => ({
                id: p.id,
                name: (p.display_name || 'Peer').split(' ')[0],
                uid: p.uid,
                online: i % 2 === 0,
              }))
            );
          }
        } else {
          const gallery = mockBackend.getGallery(user.id);
          const allProfiles = mockBackend.getProfiles().filter(p => p.id !== user.id);
          setStats({
            connections: allProfiles.length || 24,
            media: gallery.length,
            messages: 320,
          });
          setRecentConnections(
            allProfiles.slice(0, 5).map((p, i) => ({
              id: p.id,
              name: (p.display_name || 'Peer').split(' ')[0],
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

  const handleLogout = () => {
    logout();
    panicLock();
    showToast('Secure session terminated', 'info');
  };

  if (showSettings) {
    return <SettingsView onBack={() => setShowSettings(false)} />;
  }

  return (
    <div className="flex flex-col gap-6 pb-24 animate-fade-in select-none">
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
            name={user?.display_name || 'Sovereign Node'}
            seed={user?.uid}
            src={user?.avatar_url}
            size={96}
          />
          <button
            type="button"
            className="absolute bottom-0 right-0 w-8 h-8 rounded-full bg-vault-800 border-2 border-vault-950 flex items-center justify-center text-vault-200 hover:bg-vault-700 active:scale-95 transition-all shadow-md"
            aria-label="Edit avatar"
          >
            <Camera className="w-4 h-4" aria-hidden />
          </button>
        </div>

        <h2 className="t-h1 mt-3.5 mb-0.5">
          {user?.display_name || 'Alex Morgan'}
        </h2>
        <p className="t-sm c2 font-mono m-0">
          @{user?.username || user?.uid?.toLowerCase() || 'alexm'}
        </p>

        {/* Sovereign UID Chip */}
        <button
          type="button"
          onClick={copyUid}
          title="Click to copy your UID"
          aria-label={`UID ${user?.uid || 'CIPHER-4921'}, click to copy`}
          className="tag tag-em font-mono mt-3 gap-1.5 cursor-pointer hover:opacity-90 active:scale-98 transition-all"
        >
          <ShieldCheck className="w-3.5 h-3.5" aria-hidden />
          <span>{user?.uid || 'CIPHER-4921'}</span>
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

      {/* Connections Carousels / Horizontal Contacts */}
      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between px-1">
          <h2 className="t-over m-0">Connections</h2>
          <button
            type="button"
            className="t-sm font-semibold text-cy hover:underline cursor-pointer bg-transparent border-0 p-0"
          >
            See all
          </button>
        </div>

        <div className="flex items-center gap-3 overflow-x-auto pb-1 -mx-1 px-1 no-scrollbar">
          {/* Add Connection Button */}
          <button
            type="button"
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
        </div>
      </section>

      {/* Quick Action Navigation Rows */}
      <section className="flex flex-col gap-2">
        <div className="card overflow-hidden">
          <button
            type="button"
            onClick={() => showToast('Profile editing enabled in Settings', 'info')}
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

      {isSuperAdmin && (
        <div className="card p-3.5 bg-amber-950/20 border-amber-800/40 text-center">
          <span className="t-cap font-mono text-amber-300 font-bold uppercase tracking-wider">
            Super Admin Account Clearance Active
          </span>
        </div>
      )}
    </div>
  );
};

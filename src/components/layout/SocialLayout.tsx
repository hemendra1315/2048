import React, { useState, useEffect, useCallback } from 'react';
import {
  MessageSquare,
  Camera,
  Image as ImageIcon,
  Shield,
  User,
  ShieldAlert,
} from 'lucide-react';
import { SocialTab } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { mockBackend } from '../../lib/mockBackend';
import { supabase, isSupabaseConfigured } from '../../lib/supabase';
import { MobileHeader } from './MobileHeader';
import { MobileNavbar } from './MobileNavbar';
import { MessagesView } from '../messages/MessagesView';
import { CameraView } from '../camera/CameraView';
import { GalleryView } from '../gallery/GalleryView';
import { VaultView } from '../vault/VaultView';
import { ProfileView } from '../profile/ProfileView';
import { PanicButton } from '../launcher/PanicButton';

interface SocialLayoutProps {
  onAdminToggle?: () => void;
}

export const SocialLayout: React.FC<SocialLayoutProps> = ({ onAdminToggle }) => {
  const { user, isSuperAdmin } = useAuth();
  const { showToast } = useToast();

  // Chats is the default landing page
  const [currentTab, setCurrentTab] = useState<SocialTab>('chats');
  const [chatPartnerId, setChatPartnerId] = useState<string | null>(null);
  const [pendingMediaAttachment, setPendingMediaAttachment] = useState<string | null>(null);
  const [stats, setStats] = useState({
    unreadCount: 0,
    galleryCount: 0,
  });

  const refreshStats = useCallback(async () => {
    if (!user) return;
    try {
      if (isSupabaseConfigured()) {
        const [{ count: unreadCount }, { count: galleryCount }] = await Promise.all([
          supabase
            .from('messages')
            .select('*', { count: 'exact', head: true })
            .eq('is_read', false)
            .neq('sender_id', user.id),
          supabase
            .from('gallery_items')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', user.id),
        ]);

        setStats({
          unreadCount: unreadCount ?? 0,
          galleryCount: galleryCount ?? 0,
        });
      } else {
        const convs = mockBackend.getConversations(user.id);
        const gallery = mockBackend.getGallery(user.id);
        const totalUnread = convs.reduce((acc, c) => acc + c.unreadCount, 0);

        setStats({
          unreadCount: totalUnread,
          galleryCount: gallery.length,
        });
      }
    } catch (err) {
      console.warn('Error refreshing stats:', err);
    }
  }, [user]);

  useEffect(() => {
    void refreshStats();
  }, [refreshStats, currentTab]);

  const copyUid = () => {
    if (user?.uid) {
      navigator.clipboard.writeText(user.uid);
      showToast(`UID ${user.uid} copied to clipboard`, 'success');
    }
  };

  const navItems = [
    { id: 'chats' as SocialTab, label: 'Chats', icon: MessageSquare, badge: stats.unreadCount },
    { id: 'camera' as SocialTab, label: 'Camera', icon: Camera },
    { id: 'gallery' as SocialTab, label: 'Gallery', icon: ImageIcon },
    { id: 'vault' as SocialTab, label: 'Vault', icon: Shield },
    { id: 'profile' as SocialTab, label: 'Profile', icon: User },
  ];

  return (
    <div className="min-h-screen bg-vault-950 text-vault-50 flex flex-col justify-between">
      {/* Mobile Top Header (< 1024px) */}
      <div className="lg:hidden">
        <MobileHeader title={navItems.find(n => n.id === currentTab)?.label} onAdminToggle={onAdminToggle} />
      </div>

      {/* Main Container */}
      <div className="flex-1 w-full max-w-7xl mx-auto flex">
        {/* Desktop Left Navigation Sidebar (>= 1024px) */}
        <aside className="hidden lg:flex flex-col justify-between w-64 p-4 bg-vault-950 border-r border-vault-800 select-none">
          <div className="flex flex-col gap-6">
            {/* Brand */}
            <div className="flex items-center gap-2.5 px-2">
              <span aria-hidden="true" className="w-8 h-8 rounded-[10px] bg-[#111214] border border-vault-700 grid grid-cols-2 gap-[2px] p-1.5 shadow-sm">
                <span className="rounded-[2px] bg-gold" />
                <span className="rounded-[2px] bg-[#2D3137]" />
                <span className="rounded-[2px] bg-[#3A3224]" />
                <span className="rounded-[2px] bg-[#10B981]" />
              </span>
              <span className="text-xl font-extrabold tracking-tight text-white">Games</span>
            </div>

            {/* Navigation Links */}
            <nav className="flex flex-col gap-1">
              {navItems.map(item => {
                const Icon = item.icon;
                const isActive = currentTab === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => setCurrentTab(item.id)}
                    className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                      isActive
                        ? 'bg-vault-850 text-emerald border border-vault-750 shadow-sm'
                        : 'text-vault-400 hover:text-white hover:bg-vault-900 border border-transparent'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <Icon className={`w-5 h-5 ${isActive ? 'stroke-[2.5]' : 'stroke-[1.75]'}`} />
                      <span>{item.label}</span>
                    </div>

                    {Boolean(item.badge && item.badge > 0) && (
                      <span className="badge">
                        {item.badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </nav>
          </div>

          {/* User Profile Summary & Panic Action */}
          <div className="flex flex-col gap-3 pt-4 border-t border-vault-800">
            {isSuperAdmin && onAdminToggle && (
              <button
                type="button"
                onClick={onAdminToggle}
                className="w-full flex items-center justify-center gap-2 py-2 px-3 bg-amber-950/60 hover:bg-amber-900/80 border border-amber-600/50 rounded-xl text-amber-300 text-xs font-bold transition-all cursor-pointer active:scale-97"
              >
                <ShieldAlert className="w-4 h-4" />
                <span>Super Admin Hub</span>
              </button>
            )}

            <div className="p-3 bg-vault-900 border border-vault-800 rounded-xl flex items-center justify-between shadow-sm">
              <div className="flex items-center gap-2.5 min-w-0">
                <img
                  src={user?.avatar_url || `https://api.dicebear.com/7.x/bottts/svg?seed=${user?.uid || 'vault'}`}
                  alt="Avatar"
                  className="w-8 h-8 rounded-lg bg-vault-850 object-cover border border-vault-700"
                />
                <div className="min-w-0">
                  <p className="text-xs font-bold text-white truncate m-0">{user?.display_name || 'Node'}</p>
                  <button
                    type="button"
                    onClick={copyUid}
                    title="Click to copy your UID"
                    aria-label="Click to copy your UID"
                    className="text-[10px] font-mono text-emerald hover:underline truncate block cursor-pointer bg-transparent border-0 p-0"
                  >
                    {user?.uid}
                  </button>
                </div>
              </div>

              <div className="w-2 h-2 rounded-full bg-emerald" />
            </div>

            <PanicButton />
          </div>
        </aside>

        {/* Center Main Workspace */}
        <main className="flex-1 min-w-0 p-3 lg:p-4 max-w-full mx-auto w-full flex flex-col h-[calc(100vh)] overflow-hidden">
          {currentTab === 'chats' && (
            <MessagesView
              initialPartnerId={chatPartnerId}
              initialAttachment={pendingMediaAttachment}
              onClearInitialPartner={() => setChatPartnerId(null)}
              onClearInitialAttachment={() => setPendingMediaAttachment(null)}
            />
          )}
          {currentTab === 'camera' && (
            <div className="max-w-2xl mx-auto w-full">
              <CameraView
                onSendToChat={media => {
                  setPendingMediaAttachment(media);
                  setCurrentTab('chats');
                }}
                onSavedToGallery={() => setCurrentTab('gallery')}
                onSavedToVault={() => setCurrentTab('vault')}
              />
            </div>
          )}
          {currentTab === 'gallery' && <div className="max-w-4xl mx-auto w-full overflow-y-auto"><GalleryView /></div>}
          {currentTab === 'vault' && <div className="max-w-4xl mx-auto w-full overflow-y-auto"><VaultView /></div>}
          {currentTab === 'profile' && <div className="max-w-2xl mx-auto w-full overflow-y-auto"><ProfileView /></div>}
        </main>
      </div>

      {/* Mobile Bottom 5-Tab Navigation (< 1024px) */}
      <MobileNavbar
        currentTab={currentTab}
        onSelectTab={setCurrentTab}
        unreadMessagesCount={stats.unreadCount}
      />
    </div>
  );
};

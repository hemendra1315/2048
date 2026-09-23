import React, { useState, useEffect, useCallback } from 'react';
import {
  MessageSquare,
  Camera,
  Image as ImageIcon,
  Shield,
  User,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react';
import { SocialTab, UserProfile } from '../../types';
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
  const [selectedDesktopPartner, setSelectedDesktopPartner] = useState<UserProfile | null>(null);
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
        <aside className="hidden lg:flex flex-col justify-between w-64 p-5 bg-[#050505] border-r border-[#1E2025] select-none">
          <div className="space-y-6">
            {/* Brand */}
            <div className="flex items-center gap-2.5 px-2">
              <span aria-hidden="true" className="w-8 h-8 rounded-[10px] bg-[#111214] border border-vault-700 grid grid-cols-2 gap-[2px] p-1.5">
                <span className="rounded-[2px] bg-gold" />
                <span className="rounded-[2px] bg-[#2D3137]" />
                <span className="rounded-[2px] bg-[#3A3224]" />
                <span className="rounded-[2px] bg-[#10B981]" />
              </span>
              <span className="text-xl font-extrabold tracking-[-0.03em]">Games</span>
            </div>

            {/* Navigation Links */}
            <nav className="space-y-1.5">
              {navItems.map(item => {
                const Icon = item.icon;
                const isActive = currentTab === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => setCurrentTab(item.id)}
                    className={`w-full flex items-center justify-between px-3.5 py-3 rounded-xl text-xs font-semibold transition-all ${
                      isActive
                        ? 'bg-[#131417] text-[#10B981] border border-[#1E2025] shadow-sm'
                        : 'text-vault-400 hover:text-white hover:bg-[#0C0D0F]'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <Icon className={`w-5 h-5 ${isActive ? 'stroke-[2.5]' : 'stroke-2'}`} />
                      <span>{item.label}</span>
                    </div>

                    {Boolean(item.badge && item.badge > 0) && (
                      <span className="px-2 py-0.5 bg-[#10B981] text-black font-bold text-[10px] rounded-full">
                        {item.badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </nav>
          </div>

          {/* User Profile Summary & Panic Action */}
          <div className="space-y-3 pt-4 border-t border-[#1E2025]">
            {isSuperAdmin && onAdminToggle && (
              <button
                onClick={onAdminToggle}
                className="w-full flex items-center justify-center gap-2 py-2 px-3 bg-amber-950/60 hover:bg-amber-900/80 border border-amber-600/50 rounded-xl text-amber-300 text-xs font-bold transition-all"
              >
                <ShieldAlert className="w-4 h-4" />
                <span>Super Admin Hub</span>
              </button>
            )}

            <div className="p-3 bg-[#0C0D0F] border border-[#1E2025] rounded-xl flex items-center justify-between">
              <div className="flex items-center gap-2.5 min-w-0">
                <img
                  src={user?.avatar_url || `https://api.dicebear.com/7.x/bottts/svg?seed=${user?.uid || 'vault'}`}
                  alt="Avatar"
                  className="w-8 h-8 rounded-lg bg-[#131417] object-cover"
                />
                <div className="min-w-0">
                  <p className="text-xs font-bold text-white truncate">{user?.display_name || 'Node'}</p>
                  <button
                    type="button"
                    onClick={copyUid}
                    title="Click to copy your UID"
                    aria-label="Click to copy your UID"
                    className="text-[10px] font-mono text-[#10B981] hover:underline truncate block"
                  >
                    {user?.uid}
                  </button>
                </div>
              </div>

              <div className="w-2 h-2 rounded-full bg-[#10B981]" />
            </div>

            <PanicButton />
          </div>
        </aside>

        {/* Center Main Workspace */}
        <main className="flex-1 min-w-0 px-3 pt-3 pb-24 sm:px-5 lg:pb-5 max-w-2xl lg:max-w-none mx-auto w-full">
          {currentTab === 'chats' && (
            <MessagesView
              initialPartnerId={chatPartnerId}
              initialAttachment={pendingMediaAttachment}
              onClearInitialPartner={() => setChatPartnerId(null)}
              onClearInitialAttachment={() => setPendingMediaAttachment(null)}
              onSelectConversationForDesktop={partner => setSelectedDesktopPartner(partner)}
            />
          )}
          {currentTab === 'camera' && (
            <CameraView
              onSendToChat={media => {
                setPendingMediaAttachment(media);
                setCurrentTab('chats');
              }}
              onSavedToGallery={() => setCurrentTab('gallery')}
              onSavedToVault={() => setCurrentTab('vault')}
            />
          )}
          {currentTab === 'gallery' && <GalleryView />}
          {currentTab === 'vault' && <VaultView />}
          {currentTab === 'profile' && <ProfileView />}
        </main>

        {/* Desktop Right Inspector Panel (>= 1280px) */}
        <aside className="hidden xl:flex flex-col w-72 p-5 bg-[#050505] border-l border-[#1E2025] select-none space-y-5">
          <div className="p-4 bg-[#0C0D0F] border border-[#1E2025] rounded-2xl text-center space-y-2">
            <ShieldCheck className="w-8 h-8 text-[#10B981] mx-auto" />
            <h4 className="text-xs font-bold text-white uppercase tracking-wider">Zero-Knowledge Node</h4>
            <p className="text-[11px] text-[#A7ABB3]">
              All communication and media storage are hardware-sealed and isolated.
            </p>
          </div>

          {selectedDesktopPartner ? (
            <div className="p-4 bg-[#0C0D0F] border border-[#1E2025] rounded-2xl space-y-3">
              <h4 className="text-xs font-bold text-vault-400 uppercase tracking-wider">Active Contact</h4>
              <div className="flex items-center gap-3">
                <img
                  src={selectedDesktopPartner.avatar_url || `https://api.dicebear.com/7.x/bottts/svg?seed=${selectedDesktopPartner.uid}`}
                  alt="Partner"
                  className="w-10 h-10 rounded-xl bg-[#131417] object-cover"
                />
                <div>
                  <p className="text-xs font-bold text-white">{selectedDesktopPartner.display_name}</p>
                  <p className="text-[11px] font-mono text-[#10B981]">{selectedDesktopPartner.uid}</p>
                </div>
              </div>
              <div className="text-[11px] text-vault-500 font-mono space-y-1 pt-2 border-t border-[#1E2025]">
                <p>Status: Verified Peer 🟢</p>
                <p>Channel: 1-to-1 Direct</p>
              </div>
            </div>
          ) : (
            <div className="p-4 bg-[#0C0D0F] border border-[#1E2025] rounded-2xl space-y-3">
              <h4 className="text-xs font-bold text-vault-400 uppercase tracking-wider">System Status</h4>
              <div className="space-y-2 text-xs">
                <div className="flex justify-between text-vault-400">
                  <span>Vault Mode:</span>
                  <span className="text-[#10B981] font-mono font-semibold">Decrypted</span>
                </div>
                <div className="flex justify-between text-vault-400">
                  <span>Cover Camouflage:</span>
                  <span className="text-white font-mono">2048 Game</span>
                </div>
                <div className="flex justify-between text-vault-400">
                  <span>Auto-Lock:</span>
                  <span className="text-white font-mono">Active (60s)</span>
                </div>
              </div>
            </div>
          )}

          <div className="p-4 bg-[#0C0D0F] border border-[#1E2025] rounded-2xl space-y-2">
            <h4 className="text-xs font-bold text-vault-400 uppercase tracking-wider">Quick Actions</h4>
            <button
              onClick={() => setCurrentTab('camera')}
              className="w-full py-2 px-3 bg-[#131417] hover:bg-[#1B1D21] border border-[#1E2025] rounded-xl text-xs font-semibold text-white flex items-center justify-between transition-all"
            >
              <span>Instant Capture</span>
              <Camera className="w-3.5 h-3.5 text-[#10B981]" />
            </button>
            <button
              onClick={() => setCurrentTab('vault')}
              className="w-full py-2 px-3 bg-[#131417] hover:bg-[#1B1D21] border border-[#1E2025] rounded-xl text-xs font-semibold text-white flex items-center justify-between transition-all"
            >
              <span>Open Vault</span>
              <Shield className="w-3.5 h-3.5 text-amber-400" />
            </button>
          </div>
        </aside>
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

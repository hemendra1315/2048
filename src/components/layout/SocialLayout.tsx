import React, { useState, useEffect, useCallback } from 'react';
import { SocialTab } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { mockBackend } from '../../lib/mockBackend';
import { MobileHeader } from './MobileHeader';
import { MobileNavbar } from './MobileNavbar';
import { HomeView } from '../home/HomeView';
import { ConnectionsView } from '../connections/ConnectionsView';
import { MessagesView } from '../messages/MessagesView';
import { GalleryView } from '../gallery/GalleryView';
import { SettingsView } from '../settings/SettingsView';
import { AddPersonModal } from '../connections/AddPersonModal';

interface SocialLayoutProps {
  onAdminToggle?: () => void;
}

export const SocialLayout: React.FC<SocialLayoutProps> = ({ onAdminToggle }) => {
  const { user } = useAuth();
  const [currentTab, setCurrentTab] = useState<SocialTab>('home');
  const [addPersonOpen, setAddPersonOpen] = useState(false);
  const [chatPartnerId, setChatPartnerId] = useState<string | null>(null);
  const [stats, setStats] = useState({
    connectionCount: 0,
    unreadCount: 0,
    galleryCount: 0,
    pendingRequestsCount: 0,
  });

  const refreshStats = useCallback(() => {
    if (!user) return;
    const conns = mockBackend.getConnections(user.id);
    const convs = mockBackend.getConversations(user.id);
    const gallery = mockBackend.getGallery(user.id);
    const reqs = mockBackend.getConnectionRequests(user.id);

    const totalUnread = convs.reduce((acc, c) => acc + c.unreadCount, 0);

    setStats({
      connectionCount: conns.length,
      unreadCount: totalUnread,
      galleryCount: gallery.length,
      pendingRequestsCount: reqs.incoming.length,
    });
  }, [user]);

  useEffect(() => {
    refreshStats();
  }, [refreshStats, currentTab]);

  const handleStartChat = (partnerId: string) => {
    setChatPartnerId(partnerId);
    setCurrentTab('messages');
  };

  return (
    <div className="min-h-screen bg-vault-950 text-vault-100 flex flex-col max-w-md mx-auto relative overflow-x-hidden">
      {/* Top Header */}
      <MobileHeader onAdminToggle={onAdminToggle} />

      {/* Main View Area */}
      <main className="flex-1 p-4">
        {currentTab === 'home' && (
          <HomeView
            onNavigateTab={setCurrentTab}
            onOpenAddPerson={() => setAddPersonOpen(true)}
            stats={stats}
          />
        )}
        {currentTab === 'connections' && (
          <ConnectionsView onStartChat={handleStartChat} />
        )}
        {currentTab === 'messages' && (
          <MessagesView
            initialPartnerId={chatPartnerId}
            onClearInitialPartner={() => setChatPartnerId(null)}
            onOpenConnectionsTab={() => setCurrentTab('connections')}
          />
        )}
        {currentTab === 'gallery' && <GalleryView />}
        {currentTab === 'settings' && <SettingsView />}
      </main>

      {/* Bottom Tab Navbar */}
      <MobileNavbar
        currentTab={currentTab}
        onSelectTab={setCurrentTab}
        unreadMessagesCount={stats.unreadCount}
        pendingRequestsCount={stats.pendingRequestsCount}
      />

      {/* Add Person Modal */}
      <AddPersonModal
        isOpen={addPersonOpen}
        onClose={() => setAddPersonOpen(false)}
        onRequestSent={refreshStats}
      />
    </div>
  );
};

import React, { useState, useEffect, useCallback } from 'react';
import {
  ShieldAlert,
  Users,
  MessageSquare,
  Image,
  Activity,
  ArrowLeft,
  Search,
  Command,
  Shield,
  Timer,
} from 'lucide-react';
import { GlobalSearchModal } from './GlobalSearchModal';
import { LiveActivityFeed } from './LiveActivityFeed';
import { UserManagement } from './UserManagement';
import { User360View } from './User360View';
import { ConversationViewer } from './ConversationViewer';
import { MediaOversight } from './MediaOversight';
import { ReportsView } from './ReportsView';
import { DisappearingArchive } from './DisappearingArchive';
import { getSafetyReports } from '../../lib/safetyApi';
import { useBackHandler } from '../../lib/backButton';

export type AdminTab = 'activity' | 'users' | 'conversations' | 'media' | 'disappearing' | 'reports';

interface AdminLayoutProps {
  onReturnToUserMode: () => void;
}

export const AdminLayout: React.FC<AdminLayoutProps> = ({ onReturnToUserMode }) => {
  const [activeTab, setActiveTab] = useState<AdminTab>('activity');
  const [isSearchOpen, setIsSearchOpen] = useState(false);

  // Deep-linking state
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [selectedUserTab, setSelectedUserTab] = useState<
    'overview' | 'chats' | 'media' | 'reports' | 'activity' | 'notes'
  >('overview');
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [highlightMessageId, setHighlightMessageId] = useState<string | null>(null);
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);

  // Pending reports count badge
  const [pendingReportsCount, setPendingReportsCount] = useState<number>(0);

  useEffect(() => {
    const fetchPendingCount = async () => {
      try {
        const reports = await getSafetyReports();
        const pending = reports.filter(r => r.status === 'pending').length;
        setPendingReportsCount(pending);
      } catch (err) {
        console.error('Error fetching pending reports count:', err);
      }
    };
    fetchPendingCount();
    const interval = setInterval(fetchPendingCount, 15000);
    return () => clearInterval(interval);
  }, []);

  // Global Ctrl+K / Cmd+K listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsSearchOpen(prev => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Navigation handlers
  const handleNavigateToUser = useCallback(
    (userId: string, tab: 'overview' | 'chats' | 'media' | 'reports' | 'activity' | 'notes' = 'overview') => {
      setSelectedUserId(userId);
      setSelectedUserTab(tab);
      setActiveTab('users');
    },
    []
  );

  const handleNavigateToConversation = useCallback(
    (conversationId: string, highlightMsgId?: string) => {
      setSelectedConversationId(conversationId);
      setHighlightMessageId(highlightMsgId || null);
      setActiveTab('conversations');
    },
    []
  );

  const handleNavigateToReport = useCallback((reportId: string) => {
    setSelectedReportId(reportId);
    setActiveTab('reports');
  }, []);

  const handleNavigateToMedia = useCallback((conversationId?: string, messageId?: string) => {
    if (conversationId) {
      handleNavigateToConversation(conversationId, messageId);
    } else {
      setActiveTab('media');
    }
  }, [handleNavigateToConversation]);

  const navTabs = [
    { id: 'activity' as AdminTab, label: 'Live Activity', icon: Activity },
    { id: 'users' as AdminTab, label: 'User 360', icon: Users },
    { id: 'conversations' as AdminTab, label: 'Conversations', icon: MessageSquare },
    { id: 'media' as AdminTab, label: 'Media Oversight', icon: Image },
    { id: 'disappearing' as AdminTab, label: 'Disappearing', icon: Timer },
    {
      id: 'reports' as AdminTab,
      label: 'Reports Queue',
      icon: ShieldAlert,
      badge: pendingReportsCount > 0 ? pendingReportsCount : null,
    },
  ];

  useBackHandler(isSearchOpen, () => setIsSearchOpen(false));

  return (
    <div className="min-h-screen bg-[#050505] text-vault-100 flex flex-col w-full selection:bg-arcade-gold selection:text-vault-950 font-sans">
      {/* Top Header Bar */}
      <header className="sticky top-0 z-40 bg-vault-950/90 backdrop-blur-md border-b border-vault-800 px-4 pb-2.5 pt-[calc(0.625rem+env(safe-area-inset-top))] shadow-lg">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-3">
          {/* Brand & Left Actions */}
          <div className="flex items-center gap-3">
            <button
              onClick={onReturnToUserMode}
              className="p-2 rounded-xl bg-vault-900 hover:bg-vault-800 text-vault-300 hover:text-white border border-vault-800 transition-colors"
              title="Return to User Mode"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>

            <div>
              <div className="flex items-center gap-2">
                <Shield className="w-4 h-4 text-arcade-gold" />
                <h1 className="text-sm font-bold text-white tracking-wide flex items-center gap-1.5">
                  <span>Trust & Safety Hub</span>
                  <span className="text-[10px] font-mono px-1.5 py-0.2 bg-amber-950/80 text-amber-300 border border-amber-600/40 rounded">
                    STAFF
                  </span>
                </h1>
              </div>
              <p className="text-[10px] text-vault-400 font-mono hidden sm:block">
                Universal Oversight & Moderation Workspace
              </p>
            </div>
          </div>

          {/* Center Universal Global Search Button */}
          <button
            onClick={() => setIsSearchOpen(true)}
            className="flex-1 max-w-md bg-vault-900/90 hover:bg-vault-850 border border-vault-800 hover:border-arcade-gold/50 rounded-2xl px-3.5 py-1.5 flex items-center justify-between text-xs text-vault-400 transition-all shadow-inner group"
          >
            <div className="flex items-center gap-2">
              <Search className="w-3.5 h-3.5 text-vault-500 group-hover:text-arcade-gold transition-colors" />
              <span className="truncate">Search users, chats, media, reports...</span>
            </div>
            <div className="hidden sm:flex items-center gap-0.5 text-[10px] font-mono bg-vault-950 border border-vault-700/80 px-1.5 py-0.5 rounded text-vault-300">
              <Command className="w-2.5 h-2.5" />
              <span>K</span>
            </div>
          </button>

          {/* Right Exit Button */}
          <button
            onClick={onReturnToUserMode}
            className="px-3 py-1.5 rounded-xl bg-vault-900 hover:bg-vault-800 border border-vault-800 text-xs font-bold text-vault-300 hover:text-white transition-colors whitespace-nowrap"
          >
            Exit Staff Mode
          </button>
        </div>
      </header>

      {/* Sub Navigation Bar */}
      <nav className="bg-vault-900/60 border-b border-vault-800/80 px-4 py-1.5 sticky top-[calc(53px+env(safe-area-inset-top))] z-30 backdrop-blur-md">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-1 overflow-x-auto no-scrollbar">
          <div className="flex items-center gap-1">
            {navTabs.map(t => {
              const Icon = t.icon;
              const isActive = activeTab === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => {
                    setActiveTab(t.id);
                    if (t.id === 'users' && !selectedUserId) {
                      setSelectedUserId(null);
                    }
                  }}
                  className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 relative ${
                    isActive
                      ? 'bg-arcade-gold text-vault-950 shadow-md ring-1 ring-arcade-gold/30'
                      : 'text-vault-400 hover:text-white hover:bg-vault-850'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{t.label}</span>
                  {t.badge && (
                    <span
                      className={`ml-1 px-1.5 py-0.2 rounded-full text-[9px] font-mono font-bold ${
                        isActive
                          ? 'bg-rose-950 text-rose-300'
                          : 'bg-rose-600 text-white animate-pulse'
                      }`}
                    >
                      {t.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </nav>

      {/* Main Workspace Body */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6">
        {activeTab === 'activity' && (
          <LiveActivityFeed
            onNavigateToUser={handleNavigateToUser}
            onNavigateToConversation={handleNavigateToConversation}
            onNavigateToReport={handleNavigateToReport}
          />
        )}

        {activeTab === 'users' && (
          <>
            {selectedUserId ? (
              <User360View
                userId={selectedUserId}
                initialTab={selectedUserTab}
                onBack={() => setSelectedUserId(null)}
                onNavigateToConversation={handleNavigateToConversation}
                onNavigateToReport={handleNavigateToReport}
              />
            ) : (
              <UserManagement onSelectUser={handleNavigateToUser} />
            )}
          </>
        )}

        {activeTab === 'conversations' && (
          <ConversationViewer
            initialConversationId={selectedConversationId}
            highlightMessageId={highlightMessageId}
            onNavigateToUser={handleNavigateToUser}
          />
        )}

        {activeTab === 'media' && (
          <MediaOversight
            onNavigateToConversation={handleNavigateToConversation}
            onNavigateToUser={handleNavigateToUser}
          />
        )}

        {activeTab === 'disappearing' && (
          <DisappearingArchive
            onNavigateToConversation={handleNavigateToConversation}
            onNavigateToUser={handleNavigateToUser}
          />
        )}

        {activeTab === 'reports' && (
          <ReportsView
            initialReportId={selectedReportId}
            onNavigateToUser={handleNavigateToUser}
            onNavigateToConversation={handleNavigateToConversation}
          />
        )}
      </main>

      {/* Universal Global Search Modal (Ctrl+K) */}
      <GlobalSearchModal
        isOpen={isSearchOpen}
        onClose={() => setIsSearchOpen(false)}
        onNavigateToUser={handleNavigateToUser}
        onNavigateToConversation={handleNavigateToConversation}
        onNavigateToReport={handleNavigateToReport}
        onNavigateToMedia={handleNavigateToMedia}
      />
    </div>
  );
};

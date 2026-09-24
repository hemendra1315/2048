import React, { useState } from 'react';
import { ShieldAlert, LayoutDashboard, Users, MessageSquare, Image, Activity, ArrowLeft } from 'lucide-react';
import { AdminTab } from '../../types';
import { AdminDashboard } from './AdminDashboard';
import { UserManagement } from './UserManagement';
import { MessageOversight } from './MessageOversight';
import { GalleryOversight } from './GalleryOversight';
import { AuditLogViewer } from './AuditLogViewer';

interface AdminLayoutProps {
  onReturnToUserMode: () => void;
}

export const AdminLayout: React.FC<AdminLayoutProps> = ({ onReturnToUserMode }) => {
  const [currentTab, setCurrentTab] = useState<AdminTab>('dashboard');

  const tabs = [
    { id: 'dashboard' as AdminTab, label: 'Overview', icon: LayoutDashboard },
    { id: 'users' as AdminTab, label: 'Users', icon: Users },
    { id: 'messages' as AdminTab, label: 'Chats', icon: MessageSquare },
    { id: 'gallery' as AdminTab, label: 'Media', icon: Image },
    { id: 'audit_log' as AdminTab, label: 'Audit', icon: Activity },
  ];

  return (
    <div className="min-h-screen bg-vault-950 text-vault-100 flex flex-col max-w-md mx-auto">
      {/* Pinned Admin Header + Tabs (one compact unit) */}
      <div className="sticky top-0 z-30 bg-amber-950/95 backdrop-blur-md border-b border-amber-600/40 shadow-md">
        <header className="px-4 py-2.5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              onClick={onReturnToUserMode}
              className="p-1 rounded-lg text-amber-200 hover:text-white transition-colors"
              title="Return to User Mode"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <ShieldAlert className="w-4 h-4 text-amber-400" />
            <h2 className="text-sm font-bold text-white leading-tight">Admin</h2>
          </div>

          <button
            onClick={onReturnToUserMode}
            className="text-xs font-bold text-amber-300 hover:text-white underline"
          >
            Exit
          </button>
        </header>

        {/* Tabs: only the active tab shows a label, the rest collapse to icons */}
        <div className="px-2 pb-1.5 flex items-center gap-1 overflow-x-auto">
          {tabs.map(t => {
            const Icon = t.icon;
            const isActive = currentTab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setCurrentTab(t.id)}
                title={t.label}
                className={`flex items-center gap-1.5 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 ${
                  isActive
                    ? 'px-3 bg-amber-950 text-amber-300 border border-amber-600/50 shadow-sm'
                    : 'px-2 text-vault-400 hover:text-white'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {isActive && <span>{t.label}</span>}
              </button>
            );
          })}
        </div>
      </div>

      {/* Admin View Body */}
      <main className="flex-1 p-4">
        {currentTab === 'dashboard' && <AdminDashboard onSelectTab={setCurrentTab} />}
        {currentTab === 'users' && <UserManagement />}
        {currentTab === 'messages' && <MessageOversight />}
        {currentTab === 'gallery' && <GalleryOversight />}
        {currentTab === 'audit_log' && <AuditLogViewer />}
      </main>
    </div>
  );
};

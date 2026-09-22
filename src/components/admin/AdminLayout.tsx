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
      {/* Admin Top Header */}
      <header className="sticky top-0 z-30 bg-amber-950/90 backdrop-blur-md border-b border-amber-600/40 px-4 py-3 flex items-center justify-between shadow-md">
        <div className="flex items-center gap-2.5">
          <button
            onClick={onReturnToUserMode}
            className="p-1.5 rounded-xl bg-amber-900/80 text-amber-200 hover:text-white transition-colors"
            title="Return to User Mode"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <div className="flex items-center gap-1.5">
              <ShieldAlert className="w-4 h-4 text-amber-400" />
              <h2 className="text-sm font-bold text-white leading-tight">Super Admin Hub</h2>
            </div>
            <span className="text-[10px] text-amber-300/80 font-mono">Central Oversight Active</span>
          </div>
        </div>

        <button
          onClick={onReturnToUserMode}
          className="text-xs font-bold text-amber-300 hover:text-white underline"
        >
          User Mode
        </button>
      </header>

      {/* Admin Subnav */}
      <div className="bg-vault-900 border-b border-vault-800 px-2 py-1.5 flex justify-between overflow-x-auto">
        {tabs.map(t => {
          const Icon = t.icon;
          const isActive = currentTab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setCurrentTab(t.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 ${
                isActive
                  ? 'bg-amber-950 text-amber-300 border border-amber-600/50 shadow-sm'
                  : 'text-vault-400 hover:text-white'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{t.label}</span>
            </button>
          );
        })}
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

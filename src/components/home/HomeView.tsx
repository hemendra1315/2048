import React from 'react';
import { Shield, Users, MessageSquare, Image, Copy, Plus, QrCode, Lock, CheckCircle2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { SocialTab } from '../../types';

interface HomeViewProps {
  onNavigateTab: (tab: SocialTab) => void;
  onOpenAddPerson: () => void;
  stats: {
    connectionCount: number;
    unreadCount: number;
    galleryCount: number;
  };
}

export const HomeView: React.FC<HomeViewProps> = ({
  onNavigateTab,
  onOpenAddPerson,
  stats,
}) => {
  const { user } = useAuth();
  const { showToast } = useToast();

  const copyUid = () => {
    if (user?.uid) {
      navigator.clipboard.writeText(user.uid);
      showToast(`UID ${user.uid} copied to clipboard`, 'success');
    }
  };

  return (
    <div className="space-y-4 pb-20 animate-fade-in">
      {/* Identity Card */}
      <div className="bg-gradient-to-br from-vault-900 via-vault-900 to-vault-800 border border-vault-700/80 rounded-3xl p-5 shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-32 h-32 bg-arcade-gold/5 rounded-full blur-3xl pointer-events-none" />

        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <img
              src={user?.avatar_url || `https://api.dicebear.com/7.x/bottts/svg?seed=${user?.uid || 'vault'}`}
              alt="Avatar"
              className="w-14 h-14 rounded-2xl bg-vault-800 border-2 border-arcade-gold/40 object-cover shadow-md"
            />
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-arcade-gold flex items-center gap-1">
                <Shield className="w-3 h-3" /> Encrypted Identity
              </span>
              <h2 className="text-lg font-bold text-white leading-tight mt-0.5">
                {user?.display_name}
              </h2>
              <div className="flex items-center gap-2 mt-1">
                <button
                  onClick={copyUid}
                  className="flex items-center gap-1 bg-vault-950/80 hover:bg-vault-950 border border-vault-700 px-2.5 py-1 rounded-lg text-xs font-mono font-bold text-white transition-all active:scale-95"
                  title="Copy UID"
                >
                  <span>{user?.uid}</span>
                  <Copy className="w-3 h-3 text-arcade-gold" />
                </button>
              </div>
            </div>
          </div>

          <button
            onClick={copyUid}
            className="p-2.5 bg-vault-800 hover:bg-vault-700 rounded-xl text-vault-300 hover:text-white border border-vault-700 transition-colors"
            title="Share UID"
          >
            <QrCode className="w-4 h-4" />
          </button>
        </div>

        {/* Security Feature Highlights */}
        <div className="grid grid-cols-2 gap-2 mt-4 pt-4 border-t border-vault-800/80 text-[11px] text-vault-400">
          <div className="flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span>UID-Only Discovery</span>
          </div>
          <div className="flex items-center gap-1.5">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span>Cover Launcher Disguise</span>
          </div>
        </div>
      </div>

      {/* Quick Action Matrix */}
      <div className="grid grid-cols-3 gap-2.5">
        <button
          onClick={onOpenAddPerson}
          className="flex flex-col items-center justify-center p-3.5 bg-vault-900 border border-vault-800 hover:border-arcade-gold/50 rounded-2xl transition-all active:scale-95 group shadow-sm"
        >
          <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-400 flex items-center justify-center mb-1.5 group-hover:scale-110 transition-transform">
            <Plus className="w-5 h-5" />
          </div>
          <span className="text-xs font-bold text-white">Add Person</span>
          <span className="text-[10px] text-vault-400">By UID</span>
        </button>

        <button
          onClick={() => onNavigateTab('messages')}
          className="flex flex-col items-center justify-center p-3.5 bg-vault-900 border border-vault-800 hover:border-cyan-500/50 rounded-2xl transition-all active:scale-95 group shadow-sm relative"
        >
          {stats.unreadCount > 0 && (
            <span className="absolute top-2 right-2 w-2.5 h-2.5 rounded-full bg-cyan-400 animate-ping" />
          )}
          <div className="w-10 h-10 rounded-xl bg-cyan-500/10 text-cyan-400 flex items-center justify-center mb-1.5 group-hover:scale-110 transition-transform">
            <MessageSquare className="w-5 h-5" />
          </div>
          <span className="text-xs font-bold text-white">Direct Chat</span>
          <span className="text-[10px] text-vault-400">{stats.unreadCount} Unread</span>
        </button>

        <button
          onClick={() => onNavigateTab('gallery')}
          className="flex flex-col items-center justify-center p-3.5 bg-vault-900 border border-vault-800 hover:border-purple-500/50 rounded-2xl transition-all active:scale-95 group shadow-sm"
        >
          <div className="w-10 h-10 rounded-xl bg-purple-500/10 text-purple-400 flex items-center justify-center mb-1.5 group-hover:scale-110 transition-transform">
            <Image className="w-5 h-5" />
          </div>
          <span className="text-xs font-bold text-white">Private Media</span>
          <span className="text-[10px] text-vault-400">{stats.galleryCount} Photos</span>
        </button>
      </div>

      {/* Network Overview Card */}
      <div className="bg-vault-900/70 border border-vault-800 rounded-3xl p-4 shadow-md">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-vault-300 flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5 text-arcade-gold" /> Network Connections
          </h3>
          <button
            onClick={() => onNavigateTab('connections')}
            className="text-xs font-bold text-arcade-gold hover:underline"
          >
            View All ({stats.connectionCount})
          </button>
        </div>

        <p className="text-xs text-vault-400 leading-relaxed">
          Your account is isolated from public searches. Only people with your unique UID whom you approve can start conversations.
        </p>
      </div>

      {/* Panic Lock Reminder */}
      <div className="bg-rose-950/30 border border-rose-900/50 rounded-2xl p-3.5 flex items-center justify-between text-xs text-rose-200">
        <div className="flex items-center gap-2">
          <Lock className="w-4 h-4 text-rose-400 shrink-0" />
          <span>Tap <strong>LOCK</strong> anytime in header to instant-disguise.</span>
        </div>
      </div>
    </div>
  );
};

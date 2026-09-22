import React, { useState, useEffect } from 'react';
import { Users, MessageSquare, Image, ShieldAlert, Activity, Ban, CheckCircle } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { mockBackend } from '../../lib/mockBackend';
import { AdminTab, UserProfile } from '../../types';

interface AdminDashboardProps {
  onSelectTab: (tab: AdminTab) => void;
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({ onSelectTab }) => {
  const { user } = useAuth();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [recentLogs, setRecentLogs] = useState<ReturnType<typeof mockBackend.getAdminAuditLogs>>([]);

  useEffect(() => {
    if (user) {
      setUsers(mockBackend.getProfiles());
      setRecentLogs(mockBackend.getAdminAuditLogs().slice(0, 5));
    }
  }, [user]);

  const activeUsers = users.filter(u => u.status === 'active').length;
  const suspendedUsers = users.filter(u => u.status === 'suspended').length;
  const bannedUsers = users.filter(u => u.status === 'banned').length;

  return (
    <div className="space-y-4 pb-20 animate-fade-in">
      {/* Title */}
      <div className="bg-gradient-to-r from-amber-950/60 via-vault-900 to-vault-900 border border-amber-600/40 rounded-3xl p-5 shadow-lg">
        <div className="flex items-center gap-2 text-amber-400 font-bold text-xs uppercase tracking-wider mb-1">
          <ShieldAlert className="w-4 h-4" /> Super Admin Control Hub
        </div>
        <h2 className="text-lg font-bold text-white leading-tight">
          System Administration & Oversight
        </h2>
        <p className="text-xs text-vault-400 mt-1">
          Every moderation inspection and disciplinary action is recorded in the permanent audit trail.
        </p>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-3 gap-2.5">
        <button
          onClick={() => onSelectTab('users')}
          className="bg-vault-900 border border-vault-800 hover:border-amber-500/50 p-3.5 rounded-2xl text-left transition-all group shadow-sm"
        >
          <div className="flex items-center justify-between text-vault-400 mb-1">
            <Users className="w-4 h-4 text-amber-400" />
            <span className="text-[10px] font-mono">{users.length} Total</span>
          </div>
          <div className="text-xl font-bold text-white">{activeUsers}</div>
          <div className="text-[10px] text-emerald-400 font-semibold mt-0.5 flex items-center gap-1">
            <CheckCircle className="w-3 h-3" /> Active Users
          </div>
        </button>

        <button
          onClick={() => onSelectTab('messages')}
          className="bg-vault-900 border border-vault-800 hover:border-cyan-500/50 p-3.5 rounded-2xl text-left transition-all group shadow-sm"
        >
          <div className="flex items-center justify-between text-vault-400 mb-1">
            <MessageSquare className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="text-xl font-bold text-white">Central</div>
          <div className="text-[10px] text-cyan-400 font-semibold mt-0.5">Chat Oversight</div>
        </button>

        <button
          onClick={() => onSelectTab('gallery')}
          className="bg-vault-900 border border-vault-800 hover:border-purple-500/50 p-3.5 rounded-2xl text-left transition-all group shadow-sm"
        >
          <div className="flex items-center justify-between text-vault-400 mb-1">
            <Image className="w-4 h-4 text-purple-400" />
          </div>
          <div className="text-xl font-bold text-white">Media</div>
          <div className="text-[10px] text-purple-400 font-semibold mt-0.5">Review Storage</div>
        </button>
      </div>

      {/* Flagged Status Summary */}
      {(suspendedUsers > 0 || bannedUsers > 0) && (
        <div className="bg-rose-950/40 border border-rose-800/60 rounded-2xl p-3.5 flex items-center justify-between text-xs text-rose-200">
          <div className="flex items-center gap-2">
            <Ban className="w-4 h-4 text-rose-400 shrink-0" />
            <span>
              Restricted: <strong>{suspendedUsers} suspended</strong>,{' '}
              <strong>{bannedUsers} banned</strong>
            </span>
          </div>
          <button
            onClick={() => onSelectTab('users')}
            className="text-xs font-bold text-rose-400 underline"
          >
            Manage
          </button>
        </div>
      )}

      {/* Recent Audit Log Preview */}
      <div className="bg-vault-900 border border-vault-800 rounded-3xl p-4 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-vault-300">
            <Activity className="w-3.5 h-3.5 text-arcade-gold" /> Recent Moderation Actions
          </div>
          <button
            onClick={() => onSelectTab('audit_log')}
            className="text-xs font-bold text-arcade-gold hover:underline"
          >
            Full Log
          </button>
        </div>

        {recentLogs.length === 0 ? (
          <div className="text-xs text-vault-500 p-4 text-center">No moderation events recorded yet.</div>
        ) : (
          <div className="space-y-2">
            {recentLogs.map(log => (
              <div
                key={log.id}
                className="bg-vault-950 border border-vault-800/80 p-2.5 rounded-xl flex items-center justify-between text-xs"
              >
                <div className="flex items-center gap-2 truncate">
                  <span className="px-1.5 py-0.5 bg-amber-950 border border-amber-700/50 text-amber-300 rounded text-[10px] font-mono font-bold">
                    {log.action_type}
                  </span>
                  <span className="text-vault-300 truncate">
                    {log.targetUser ? `Target: ${log.targetUser.display_name}` : 'System Resource'}
                  </span>
                </div>
                <span className="text-[10px] text-vault-500 font-mono shrink-0 ml-2">
                  {new Date(log.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

import React, { useState, useEffect, useCallback } from 'react';
import { Search, Ban, ShieldAlert, Shield, RefreshCw } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { mockBackend } from '../../lib/mockBackend';
import { UserProfile } from '../../types';
import { formatDetailedDate } from '../../lib/utils';

export const UserManagement: React.FC = () => {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
  const [actionReason, setActionReason] = useState('');
  const [modalMode, setModalMode] = useState<'suspend' | 'ban' | 'unban' | null>(null);

  const loadUsers = useCallback(() => {
    if (user) {
      setUsers(mockBackend.getProfiles());
    }
  }, [user]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const handleApplyStatus = (status: 'active' | 'suspended' | 'banned') => {
    if (!user || !selectedUser) return;
    try {
      mockBackend.adminSetUserStatus(user.id, selectedUser.id, status, actionReason.trim());
      showToast(`User ${selectedUser.display_name} updated to ${status.toUpperCase()}`, 'success');
      setModalMode(null);
      setSelectedUser(null);
      setActionReason('');
      loadUsers();
    } catch (err) {
      console.error('Moderation error:', err);
      showToast('Action failed', 'error');
    }
  };

  const filteredUsers = users.filter(u =>
    u.display_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    u.uid.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-4 pb-20 animate-fade-in">
      {/* Header */}
      <div>
        <h2 className="text-base font-bold text-white">User Moderation & Registry</h2>
        <p className="text-xs text-vault-400">Search by UID, audit connections, and enforce restrictions</p>
      </div>

      {/* Search Filter */}
      <div className="relative">
        <Search className="w-4 h-4 text-vault-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
        <input
          type="text"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          placeholder="Filter by UID or Name..."
          className="w-full bg-vault-900 border border-vault-800 focus:border-amber-500 rounded-2xl pl-10 pr-4 py-2.5 text-xs text-white placeholder-vault-600 outline-none transition-colors"
        />
      </div>

      {/* User Table / Cards */}
      <div className="space-y-2.5">
        {filteredUsers.map(u => {
          const isSelf = u.id === user?.id;
          const connections = mockBackend.getConnections(u.id);

          return (
            <div
              key={u.id}
              className="bg-vault-900 border border-vault-800 rounded-2xl p-4 flex flex-col gap-3 shadow-sm"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <img
                    src={u.avatar_url || `https://api.dicebear.com/7.x/bottts/svg?seed=${u.uid}`}
                    alt="Avatar"
                    className="w-12 h-12 rounded-xl bg-vault-800 border border-vault-700 object-cover"
                  />
                  <div>
                    <div className="flex items-center gap-1.5">
                      <h4 className="text-sm font-bold text-white leading-tight">{u.display_name}</h4>
                      {u.role === 'super_admin' && (
                        <span className="px-1.5 py-0.2 bg-amber-950 border border-amber-600/50 text-amber-300 rounded text-[9px] font-bold">
                          ADMIN
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1 text-[11px] font-mono text-arcade-gold mt-0.5">
                      <Shield className="w-3 h-3" />
                      <span>{u.uid}</span>
                    </div>
                    <div className="text-[10px] text-vault-500 mt-0.5">
                      Joined: {formatDetailedDate(u.created_at)}
                    </div>
                  </div>
                </div>

                {/* Status Badge */}
                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] font-bold border uppercase ${
                    u.status === 'active'
                      ? 'bg-emerald-950/80 text-emerald-300 border-emerald-700/50'
                      : u.status === 'suspended'
                      ? 'bg-amber-950/80 text-amber-300 border-amber-700/50'
                      : 'bg-rose-950/80 text-rose-300 border-rose-700/50'
                  }`}
                >
                  {u.status}
                </span>
              </div>

              {/* Stats & Actions */}
              <div className="flex items-center justify-between pt-2 border-t border-vault-800/80 text-xs">
                <span className="text-[11px] text-vault-400">
                  Connections: <strong>{connections.length}</strong>
                </span>

                {!isSelf && (
                  <div className="flex items-center gap-1.5">
                    {u.status !== 'active' ? (
                      <button
                        onClick={() => {
                          setSelectedUser(u);
                          setModalMode('unban');
                        }}
                        className="px-2.5 py-1 bg-emerald-950 hover:bg-emerald-900 border border-emerald-600/50 text-emerald-300 rounded-lg text-[11px] font-bold transition-all flex items-center gap-1"
                      >
                        <RefreshCw className="w-3 h-3" /> Restore
                      </button>
                    ) : (
                      <>
                        <button
                          onClick={() => {
                            setSelectedUser(u);
                            setModalMode('suspend');
                          }}
                          className="px-2.5 py-1 bg-amber-950 hover:bg-amber-900 border border-amber-600/50 text-amber-300 rounded-lg text-[11px] font-bold transition-all"
                        >
                          Suspend
                        </button>
                        <button
                          onClick={() => {
                            setSelectedUser(u);
                            setModalMode('ban');
                          }}
                          className="px-2.5 py-1 bg-rose-950 hover:bg-rose-900 border border-rose-600/50 text-rose-300 rounded-lg text-[11px] font-bold transition-all flex items-center gap-1"
                        >
                          <Ban className="w-3 h-3" /> Ban
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Moderation Confirmation Modal */}
      {modalMode && selectedUser && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-vault-900 border border-vault-700/80 rounded-3xl w-full max-w-sm p-6 flex flex-col shadow-2xl">
            <div className="flex items-center gap-2 text-rose-400 font-bold mb-1">
              <ShieldAlert className="w-5 h-5" />
              <span>Confirm Disciplinary Action</span>
            </div>
            <p className="text-xs text-vault-300 mb-4">
              Apply <strong>{modalMode.toUpperCase()}</strong> to{' '}
              <strong>{selectedUser.display_name}</strong> ({selectedUser.uid})
            </p>

            <label className="block text-[10px] font-bold text-vault-400 uppercase tracking-wider mb-1">
              Reason / Moderator Notes (Audited)
            </label>
            <input
              type="text"
              value={actionReason}
              onChange={e => setActionReason(e.target.value)}
              placeholder="e.g. Terms of Service violation"
              className="w-full bg-vault-950 border border-vault-700 focus:border-amber-500 rounded-xl px-3.5 py-2 text-xs text-white placeholder-vault-600 outline-none mb-4"
            />

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setModalMode(null);
                  setSelectedUser(null);
                }}
                className="flex-1 py-2 bg-vault-800 hover:bg-vault-700 text-vault-300 rounded-xl text-xs font-bold"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() =>
                  handleApplyStatus(
                    modalMode === 'ban' ? 'banned' : modalMode === 'suspend' ? 'suspended' : 'active'
                  )
                }
                className={`flex-1 py-2 rounded-xl text-xs font-bold shadow-md ${
                  modalMode === 'unban'
                    ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                    : 'bg-rose-600 hover:bg-rose-500 text-white'
                }`}
              >
                Confirm {modalMode.toUpperCase()}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

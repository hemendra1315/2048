import React, { useState, useEffect, useCallback } from 'react';
import { Search, X, Ban, ShieldAlert, Shield, RefreshCw, Eye, AlertTriangle } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { listProfiles, getConnectionCounts, setUserStatus, logAdminAction } from '../../lib/adminApi';
import { UserProfile } from '../../types';
import { formatDetailedDate, getAvatarUrl } from '../../lib/utils';
import { UserDetailView } from './UserDetailView';

export const UserManagement: React.FC = () => {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'SUSPENDED' | 'BANNED'>('ALL');
  const [selectedUserForDetail, setSelectedUserForDetail] = useState<UserProfile | null>(null);
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
  const [actionReason, setActionReason] = useState('');
  const [modalMode, setModalMode] = useState<'warn' | 'suspend' | 'ban' | 'unban' | null>(null);
  const [connectionCounts, setConnectionCounts] = useState<Record<string, number>>({});
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadUsers = useCallback(async () => {
    if (!user) return;
    try {
      const [profiles, counts] = await Promise.all([listProfiles(), getConnectionCounts()]);
      setUsers(profiles);
      setConnectionCounts(counts);
      setLoadError(null);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Could not load users');
    }
  }, [user]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const handleApplyStatus = async (status: 'active' | 'suspended' | 'banned') => {
    if (!user || !selectedUser) return;
    try {
      await setUserStatus(user.id, selectedUser.id, status, actionReason.trim());
      showToast(`User ${selectedUser.display_name} updated to ${status.toUpperCase()}`, 'success');
      setModalMode(null);
      setSelectedUser(null);
      setActionReason('');
      await loadUsers();
    } catch (err) {
      console.error('Moderation error:', err);
      showToast(err instanceof Error ? err.message : 'Action failed', 'error');
    }
  };

  const handleWarnUser = async () => {
    if (!user || !selectedUser) return;
    try {
      await logAdminAction(user.id, 'warn_user', selectedUser.id, null, {
        reason: actionReason.trim() || 'No reason provided',
      });
      showToast(`Warning logged for ${selectedUser.display_name}`, 'success');
      setModalMode(null);
      setSelectedUser(null);
      setActionReason('');
    } catch (err) {
      console.error('Warn user error:', err);
      showToast(err instanceof Error ? err.message : 'Could not log warning', 'error');
    }
  };

  const filteredUsers = users.filter(u => {
    const matchesSearch =
      u.display_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      Boolean(u.username?.toLowerCase().includes(searchQuery.toLowerCase())) ||
      u.uid.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesStatus =
      statusFilter === 'ALL' || u.status.toUpperCase() === statusFilter;

    return matchesSearch && matchesStatus;
  });

  // If a user detail is selected, render the 5-tab inspector
  if (selectedUserForDetail) {
    return (
      <UserDetailView
        user={selectedUserForDetail}
        onBack={() => {
          setSelectedUserForDetail(null);
          loadUsers();
        }}
        onUserUpdated={loadUsers}
      />
    );
  }

  return (
    <div className="space-y-4 pb-20 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-base font-bold text-white">Users</h2>
        <button
          onClick={() => {
            if (searchOpen && !searchQuery) {
              setSearchOpen(false);
            } else if (searchOpen) {
              setSearchQuery('');
              setSearchOpen(false);
            } else {
              setSearchOpen(true);
            }
          }}
          className="p-1.5 rounded-lg text-vault-400 hover:text-white hover:bg-vault-900 transition-colors"
          title={searchOpen ? 'Close search' : 'Search users'}
        >
          {searchOpen ? <X className="w-4 h-4" /> : <Search className="w-4 h-4" />}
        </button>
      </div>

      {/* Search & Status Filters */}
      <div className="space-y-2">
        {searchOpen && (
          <div className="relative animate-fade-in">
            <Search className="w-4 h-4 text-vault-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              autoFocus
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search by username, UID, or name..."
              className="w-full bg-vault-900 border border-vault-800 focus:border-amber-500 rounded-2xl pl-10 pr-4 py-2.5 text-xs text-white placeholder-vault-600 outline-none transition-colors"
            />
          </div>
        )}

        <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
          {(['ALL', 'ACTIVE', 'SUSPENDED', 'BANNED'] as const).map(filter => (
            <button
              key={filter}
              onClick={() => setStatusFilter(filter)}
              className={`px-3 py-1 rounded-xl text-xs font-bold transition-all ${
                statusFilter === filter
                  ? 'bg-arcade-gold text-vault-950 shadow-sm'
                  : 'bg-vault-900 text-vault-400 border border-vault-800 hover:text-white'
              }`}
            >
              {filter}
            </button>
          ))}
        </div>
      </div>

      {loadError && (
        <div className="bg-rose-950/40 border border-rose-800/60 rounded-2xl p-3 text-xs text-rose-200">
          {loadError}
        </div>
      )}

      {/* User Table / Cards */}
      <div className="space-y-2.5">
        {filteredUsers.length === 0 ? (
          <div className="bg-vault-900 border border-vault-800 rounded-2xl p-8 text-center text-xs text-vault-500">
            No users match the search and filter criteria.
          </div>
        ) : (
          filteredUsers.map(u => {
            const isSelf = u.id === user?.id;
            const connectionCount = connectionCounts[u.id] ?? 0;

            return (
              <div
                key={u.id}
                className="bg-vault-900 border border-vault-800 hover:border-vault-700/80 rounded-2xl p-4 flex flex-col gap-3 shadow-sm transition-all cursor-pointer"
                onClick={() => setSelectedUserForDetail(u)}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <img
                      src={u.avatar_url || getAvatarUrl(u.uid)}
                      alt="Avatar"
                      className="w-12 h-12 rounded-xl bg-vault-800 border border-vault-700 object-cover"
                    />
                    <div>
                      <div className="flex items-center gap-1.5">
                        <h4 className="text-sm font-bold text-white leading-tight">{u.display_name}</h4>
                        {u.role === 'super_admin' && (
                          <span className="px-1.5 py-0.2 bg-amber-950 border border-amber-600/50 text-amber-300 rounded text-[9px] font-bold">
                            SUPER ADMIN
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 text-[11px] font-mono mt-0.5">
                        <span className="text-vault-400">@{u.username || 'none'}</span>
                        <span className="text-vault-600">•</span>
                        <div className="flex items-center gap-1 text-arcade-gold font-bold">
                          <Shield className="w-3 h-3" />
                          <span>{u.uid}</span>
                        </div>
                      </div>
                      <div className="text-[10px] text-vault-500 mt-0.5 flex items-center gap-2">
                        <span>Created: {formatDetailedDate(u.created_at)}</span>
                        <span>•</span>
                        <span>
                          Last Active:{' '}
                          {u.last_login_at
                            ? formatDetailedDate(u.last_login_at)
                            : formatDetailedDate(u.updated_at)}
                        </span>
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

                {/* Stats & Actions Bar */}
                <div
                  className="flex items-center justify-between pt-2 border-t border-vault-800/80 text-xs"
                  onClick={e => e.stopPropagation()}
                >
                  <span className="text-[11px] text-vault-400">
                    Connections: <strong className="text-vault-200">{connectionCount}</strong>
                  </span>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setSelectedUserForDetail(u)}
                      className="px-2.5 py-1 bg-vault-800 hover:bg-vault-700 text-arcade-gold rounded-lg text-[11px] font-bold transition-all flex items-center gap-1"
                    >
                      <Eye className="w-3 h-3" /> Inspect Details
                    </button>

                    {!isSelf && u.role !== 'super_admin' && (
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
                                setModalMode('warn');
                              }}
                              className="px-2.5 py-1 bg-vault-800 hover:bg-vault-700 border border-vault-700 text-vault-200 rounded-lg text-[11px] font-bold transition-all flex items-center gap-1"
                            >
                              <AlertTriangle className="w-3 h-3" /> Warn
                            </button>
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
              </div>
            );
          })
        )}
      </div>

      {/* Moderation Confirmation Modal */}
      {modalMode && selectedUser && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-vault-900 border border-vault-700/80 rounded-3xl w-full max-w-sm p-6 flex flex-col shadow-2xl">
            <div className={`flex items-center gap-2 font-bold mb-1 ${modalMode === 'warn' ? 'text-amber-400' : 'text-rose-400'}`}>
              <ShieldAlert className="w-5 h-5" />
              <span>{modalMode === 'warn' ? 'Send a Warning' : 'Confirm Disciplinary Action'}</span>
            </div>
            <p className="text-xs text-vault-300 mb-4">
              {modalMode === 'warn' ? (
                <>Log a warning for <strong>{selectedUser.display_name}</strong> ({selectedUser.uid}). This does not suspend or ban the account.</>
              ) : (
                <>Apply <strong>{modalMode.toUpperCase()}</strong> to{' '}
                <strong>{selectedUser.display_name}</strong> ({selectedUser.uid})</>
              )}
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
                onClick={() => {
                  if (modalMode === 'warn') {
                    handleWarnUser();
                  } else {
                    handleApplyStatus(
                      modalMode === 'ban' ? 'banned' : modalMode === 'suspend' ? 'suspended' : 'active'
                    );
                  }
                }}
                className={`flex-1 py-2 rounded-xl text-xs font-bold shadow-md ${
                  modalMode === 'unban'
                    ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                    : modalMode === 'warn'
                      ? 'bg-amber-600 hover:bg-amber-500 text-white'
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

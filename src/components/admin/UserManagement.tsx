import React, { useState, useEffect, useCallback } from 'react';
import { UserProfile } from '../../types';
import { listProfiles, setUserGender } from '../../lib/adminApi';
import { Avatar } from '../common/Avatar';
import { useToast } from '../../context/ToastContext';
import { Loader2, Users } from 'lucide-react';
import { lightImpact } from '../../lib/haptics';

interface UserManagementProps {
  onSelectUser: (user: UserProfile) => void;
}

type GenderFilter = 'ALL' | 'Male' | 'Female';

export const UserManagement: React.FC<UserManagementProps> = ({ onSelectUser }) => {
  const { showToast } = useToast();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [genderFilter, setGenderFilter] = useState<GenderFilter>('ALL');
  const [updatingUserId, setUpdatingUserId] = useState<string | null>(null);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      const profiles = await listProfiles();
      setUsers(profiles);
    } catch (err) {
      console.error('Failed to load users:', err);
      showToast('Failed to load user list', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

  const handleGenderChange = async (e: React.MouseEvent, user: UserProfile, newGender: 'Male' | 'Female') => {
    e.stopPropagation();
    if (user.gender === newGender || updatingUserId === user.id) return;

    setUpdatingUserId(user.id);
    lightImpact();
    // Optimistic update
    setUsers(prev =>
      prev.map(u => (u.id === user.id ? { ...u, gender: newGender } : u))
    );
    try {
      await setUserGender(user.id, newGender);
      showToast(`Updated gender to ${newGender} for @${user.username || user.uid}`, 'success');
    } catch (err) {
      console.error('Failed to update gender:', err);
      // Revert the optimistic update -- this can now genuinely fail (no more silent
      // direct-table-update fallback), so the UI must not keep showing the unsaved value.
      setUsers(prev => prev.map(u => (u.id === user.id ? { ...u, gender: user.gender } : u)));
      showToast('Failed to update gender', 'error');
    } finally {
      setUpdatingUserId(null);
    }
  };

  const filteredUsers = users.filter(u => {
    const gender = u.gender || 'Male';
    if (genderFilter === 'Male') return gender === 'Male';
    if (genderFilter === 'Female') return gender === 'Female';
    return true;
  });

  return (
    <div className="space-y-4 animate-fade-in pb-12">
      {/* Top Filter Bar with 3 Filters: All Users, Male Users, Female Users */}
      <div className="p-4 bg-vault-900 border border-vault-800 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-lg">
        <div>
          <h2 className="text-base font-bold text-white m-0">Users Directory</h2>
          <p className="text-xs text-vault-400 mt-0.5 m-0">Manage registered user accounts, view conversations and media.</p>
        </div>

        {/* 3 Filter buttons */}
        <div className="flex items-center bg-vault-950 border border-vault-800 p-1 rounded-xl shrink-0">
          <button
            type="button"
            onClick={() => setGenderFilter('ALL')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
              genderFilter === 'ALL'
                ? 'bg-vault-800 text-white shadow'
                : 'text-vault-400 hover:text-vault-200'
            }`}
          >
            All Users ({users.length})
          </button>

          <button
            type="button"
            onClick={() => setGenderFilter('Male')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
              genderFilter === 'Male'
                ? 'bg-cyan-950 text-cyan-300 border border-cyan-700/50 shadow'
                : 'text-vault-400 hover:text-vault-200'
            }`}
          >
            Male ({users.filter(u => (u.gender || 'Male') === 'Male').length})
          </button>

          <button
            type="button"
            onClick={() => setGenderFilter('Female')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
              genderFilter === 'Female'
                ? 'bg-pink-950 text-pink-300 border border-pink-700/50 shadow'
                : 'text-vault-400 hover:text-vault-200'
            }`}
          >
            Female ({users.filter(u => u.gender === 'Female').length})
          </button>
        </div>
      </div>

      {/* Users List / Cards */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {[1, 2, 3, 4, 5, 6].map(i => (
            <div key={i} className="h-28 rounded-2xl bg-vault-900 animate-pulse border border-vault-800" />
          ))}
        </div>
      ) : filteredUsers.length === 0 ? (
        <div className="p-12 text-center bg-vault-900 border border-vault-800 rounded-2xl flex flex-col items-center justify-center gap-2 text-vault-400 text-xs">
          <Users className="w-8 h-8 text-vault-600 mb-1" />
          <p className="text-sm font-bold text-white m-0">No Users Found</p>
          <p className="m-0">No users match the selected gender filter.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filteredUsers.map(userItem => {
            const currentGender = userItem.gender || 'Male';
            const isUpdating = updatingUserId === userItem.id;

            return (
              <div
                key={userItem.id}
                role="button"
                tabIndex={0}
                onClick={() => onSelectUser(userItem)}
                onKeyDown={e => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onSelectUser(userItem);
                  }
                }}
                className="group p-4 bg-vault-900 hover:bg-vault-850 border border-vault-800 hover:border-purple-500/50 rounded-2xl shadow-md transition-all text-left flex flex-col justify-between gap-3 cursor-pointer"
              >
                {/* Top info: Avatar + Username + Status */}
                <div className="flex items-center gap-3.5 min-w-0">
                  <Avatar
                    name={userItem.display_name}
                    seed={userItem.uid}
                    src={userItem.avatar_url}
                    size={48}
                  />

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="text-sm font-bold text-white group-hover:text-purple-300 transition-colors truncate m-0">
                        {userItem.display_name}
                      </h3>
                      <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full border shrink-0 ${
                        userItem.status === 'banned'
                          ? 'bg-rose-950/50 text-rose-300 border-rose-700/50'
                          : userItem.status === 'suspended'
                          ? 'bg-amber-950/50 text-amber-300 border-amber-700/50'
                          : 'bg-emerald-950/50 text-emerald-300 border-emerald-700/50'
                      }`}>
                        {userItem.status.toUpperCase()}
                      </span>
                    </div>

                    <p className="text-xs text-vault-400 font-mono truncate m-0 mt-0.5">
                      @{userItem.username || userItem.uid}
                    </p>
                  </div>
                </div>

                {/* Bottom row: Gender management selector */}
                <div
                  className="pt-2 border-t border-vault-800/80 flex items-center justify-between"
                  onClick={e => e.stopPropagation()}
                >
                  <span className="text-[11px] text-vault-400 font-medium">Gender:</span>

                  <div className="flex items-center bg-vault-950 border border-vault-800 rounded-lg p-0.5">
                    <button
                      type="button"
                      disabled={isUpdating}
                      onClick={e => handleGenderChange(e, userItem, 'Male')}
                      className={`px-2.5 py-1 rounded text-[11px] font-semibold transition-all ${
                        currentGender === 'Male'
                          ? 'bg-cyan-600 text-white shadow-sm'
                          : 'text-vault-400 hover:text-white'
                      }`}
                    >
                      {isUpdating && currentGender !== 'Male' ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        'Male'
                      )}
                    </button>

                    <button
                      type="button"
                      disabled={isUpdating}
                      onClick={e => handleGenderChange(e, userItem, 'Female')}
                      className={`px-2.5 py-1 rounded text-[11px] font-semibold transition-all ${
                        currentGender === 'Female'
                          ? 'bg-pink-600 text-white shadow-sm'
                          : 'text-vault-400 hover:text-white'
                      }`}
                    >
                      {isUpdating && currentGender !== 'Female' ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        'Female'
                      )}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

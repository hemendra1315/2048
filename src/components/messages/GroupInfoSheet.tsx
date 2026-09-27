import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Users,
  Camera,
  Shield,
  ShieldCheck,
  UserPlus,
  UserMinus,
  Crown,
  Edit2,
  Trash2,
  LogOut,
  X,
  Check,
  MoreVertical,
  Smile,
  AlertCircle,
} from 'lucide-react';
import { ConversationItem, GroupMember, UserProfile } from '../../types';
import { Avatar } from '../common/Avatar';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import {
  fetchGroupMembers,
  updateGroupInfo,
  addGroupMembers,
  removeGroupMember,
  setGroupMemberRole,
  leaveGroupChat,
  deleteGroupChat,
  setMemberNickname,
  uploadGroupAvatar,
  searchProfiles,
} from '../../lib/groupChatApi';
import { errorWarning } from '../../lib/haptics';
import { useBackHandler } from '../../lib/backButton';

interface GroupInfoSheetProps {
  conversation: ConversationItem;
  isOpen: boolean;
  onClose: () => void;
  onGroupDeleted?: () => void;
  onGroupLeft?: () => void;
  onGroupUpdated?: (updated: Partial<ConversationItem>) => void;
}

export const GroupInfoSheet: React.FC<GroupInfoSheetProps> = ({
  conversation,
  isOpen,
  onClose,
  onGroupDeleted,
  onGroupLeft,
  onGroupUpdated,
}) => {
  const { user } = useAuth();
  const { showToast } = useToast();

  const [members, setMembers] = useState<GroupMember[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(false);

  // Group Details Editing
  const [isEditingName, setIsEditingName] = useState(false);
  const [groupName, setGroupName] = useState(conversation.group_name || conversation.partner?.display_name || 'Group Chat');
  const [isEditingDesc, setIsEditingDesc] = useState(false);
  const [groupDesc, setGroupDesc] = useState(conversation.group_description || '');
  const [groupAvatar, setGroupAvatar] = useState<string | null>(conversation.group_avatar_url || null);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);

  // Add Member Modal
  const [showAddMember, setShowAddMember] = useState(false);
  const [addMemberQuery, setAddMemberQuery] = useState('');
  const [searchCandidates, setSearchCandidates] = useState<UserProfile[]>([]);
  const [selectedToAdd, setSelectedToAdd] = useState<UserProfile[]>([]);
  const [isAdding, setIsAdding] = useState(false);

  // Nickname Modal
  const [nicknameTarget, setNicknameTarget] = useState<GroupMember | null>(null);
  const [nicknameInput, setNicknameInput] = useState('');

  // Member Action Sheet
  const [selectedMember, setSelectedMember] = useState<GroupMember | null>(null);

  // Danger Confirmations
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useBackHandler(isOpen, onClose);

  const myMembership = members.find(m => m.user_id === user?.id);
  const isOwner = myMembership?.role === 'owner';
  const isAdmin = isOwner || myMembership?.role === 'admin';

  const loadMembers = useCallback(async () => {
    setLoadingMembers(true);
    try {
      const list = await fetchGroupMembers(conversation.id);
      setMembers(list);
    } catch (err) {
      console.warn('[GroupInfoSheet] Failed to load members:', err);
    } finally {
      setLoadingMembers(false);
    }
  }, [conversation.id]);

  useEffect(() => {
    if (isOpen) {
      void loadMembers();
      setGroupName(conversation.group_name || conversation.partner?.display_name || 'Group Chat');
      setGroupDesc(conversation.group_description || '');
      setGroupAvatar(conversation.group_avatar_url || null);
    }
  }, [isOpen, conversation, loadMembers]);

  // Handle Avatar Upload
  const handleAvatarFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploadingAvatar(true);
    try {
      const cdnUrl = await uploadGroupAvatar(file);
      setGroupAvatar(cdnUrl);
      await updateGroupInfo(conversation.id, { avatarUrl: cdnUrl });
      onGroupUpdated?.({ group_avatar_url: cdnUrl });
      showToast('Group photo updated', 'success');
    } catch (err: unknown) {
      errorWarning();
      const msg = err instanceof Error ? err.message : 'Could not upload photo';
      showToast(msg, 'error');
    } finally {
      setIsUploadingAvatar(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // Save Group Name
  const handleSaveName = async () => {
    if (!groupName.trim()) {
      showToast('Group name cannot be empty', 'error');
      return;
    }
    try {
      await updateGroupInfo(conversation.id, { name: groupName.trim() });
      setIsEditingName(false);
      onGroupUpdated?.({ group_name: groupName.trim() });
      showToast('Group name updated', 'success');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to update name';
      showToast(msg, 'error');
    }
  };

  // Save Group Description
  const handleSaveDesc = async () => {
    try {
      await updateGroupInfo(conversation.id, { description: groupDesc.trim() });
      setIsEditingDesc(false);
      onGroupUpdated?.({ group_description: groupDesc.trim() });
      showToast('Group description updated', 'success');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to update description';
      showToast(msg, 'error');
    }
  };

  // Search Members to Add
  useEffect(() => {
    if (!showAddMember || !addMemberQuery.trim()) {
      setSearchCandidates([]);
      return;
    }
    let active = true;
    void searchProfiles(addMemberQuery.trim()).then((res: UserProfile[]) => {
      if (active) {
        const existingIds = new Set(members.map(m => m.user_id));
        setSearchCandidates(res.filter((p: UserProfile) => !existingIds.has(p.id)));
      }
    });
    return () => { active = false; };
  }, [showAddMember, addMemberQuery, members]);

  // Add Members Action
  const handleAddMembers = async () => {
    if (!selectedToAdd.length) return;
    setIsAdding(true);
    try {
      await addGroupMembers(conversation.id, selectedToAdd.map(p => p.id));
      showToast(`Added ${selectedToAdd.length} member(s)`, 'success');
      setShowAddMember(false);
      setSelectedToAdd([]);
      setAddMemberQuery('');
      await loadMembers();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to add members';
      showToast(msg, 'error');
    } finally {
      setIsAdding(false);
    }
  };

  // Remove Member
  const handleRemoveMember = async (target: GroupMember) => {
    try {
      await removeGroupMember(conversation.id, target.user_id);
      showToast(`Removed ${target.profile.display_name}`, 'success');
      setSelectedMember(null);
      await loadMembers();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to remove member';
      showToast(msg, 'error');
    }
  };

  // Role Toggle
  const handleToggleAdmin = async (target: GroupMember) => {
    const nextRole = target.role === 'admin' ? 'member' : 'admin';
    try {
      await setGroupMemberRole(conversation.id, target.user_id, nextRole);
      showToast(
        nextRole === 'admin'
          ? `Promoted ${target.profile.display_name} to Admin`
          : `Demoted ${target.profile.display_name} to Member`,
        'success'
      );
      setSelectedMember(null);
      await loadMembers();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to change role';
      showToast(msg, 'error');
    }
  };

  // Save Nickname
  const handleSaveNickname = async () => {
    if (!nicknameTarget) return;
    try {
      await setMemberNickname(conversation.id, nicknameTarget.user_id, nicknameInput.trim() || null);
      showToast('Nickname updated', 'success');
      setNicknameTarget(null);
      setNicknameInput('');
      await loadMembers();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to save nickname';
      showToast(msg, 'error');
    }
  };

  // Leave Group
  const handleLeaveGroup = async () => {
    try {
      await leaveGroupChat(conversation.id);
      showToast('You left the group', 'info');
      onClose();
      onGroupLeft?.();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to leave group';
      showToast(msg, 'error');
    }
  };

  // Delete Group
  const handleDeleteGroup = async () => {
    try {
      await deleteGroupChat(conversation.id);
      showToast('Group deleted permanently', 'success');
      onClose();
      onGroupDeleted?.();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to delete group';
      showToast(msg, 'error');
    }
  };

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Group Information"
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-end sm:items-center justify-center anim-fade"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-lg bg-vault-950 border border-vault-800 rounded-t-3xl sm:rounded-3xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-vault-850">
          <div className="flex items-center gap-2.5">
            <Users className="w-5 h-5 text-emerald" />
            <h2 className="text-base font-bold text-white m-0">Group Info</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-vault-900 border border-vault-800 text-vault-400 hover:text-white flex items-center justify-center transition-colors"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          {/* Avatar & Name Section */}
          <div className="flex flex-col items-center text-center">
            <div className="relative group">
              {groupAvatar ? (
                <img
                  src={groupAvatar}
                  alt={groupName}
                  className="w-24 h-24 rounded-3xl object-cover border-2 border-vault-700 shadow-xl"
                />
              ) : (
                <div className="w-24 h-24 rounded-3xl bg-gradient-to-br from-emerald/30 to-vault-900 border-2 border-vault-700 flex items-center justify-center text-emerald shadow-xl">
                  <Users className="w-10 h-10" />
                </div>
              )}

              {isAdmin && (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploadingAvatar}
                  className="absolute bottom-0 right-0 w-8 h-8 rounded-full bg-emerald text-vault-950 flex items-center justify-center shadow-lg hover:scale-105 transition-transform"
                  title="Change Group Photo"
                >
                  <Camera className="w-4 h-4 stroke-[2.5]" />
                </button>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleAvatarFileChange}
              />
            </div>

            {/* Group Name */}
            <div className="mt-3.5 w-full flex items-center justify-center gap-2">
              {isEditingName ? (
                <div className="flex items-center gap-2 w-full max-w-xs">
                  <input
                    type="text"
                    value={groupName}
                    onChange={e => setGroupName(e.target.value)}
                    className="flex-1 bg-vault-900 border border-emerald/50 rounded-xl px-3 py-1.5 text-sm text-white focus:outline-none"
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={handleSaveName}
                    className="w-8 h-8 rounded-xl bg-emerald text-vault-950 flex items-center justify-center font-bold"
                  >
                    <Check className="w-4 h-4 stroke-[3]" />
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-extrabold text-white m-0 tracking-tight">{groupName}</h3>
                  {isAdmin && (
                    <button
                      type="button"
                      onClick={() => setIsEditingName(true)}
                      className="text-vault-400 hover:text-emerald p-1"
                      title="Edit Name"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              )}
            </div>

            <p className="text-xs text-vault-400 mt-1 m-0">
              {members.length} {members.length === 1 ? 'member' : 'members'}
            </p>

            {/* Description */}
            <div className="mt-3 w-full bg-vault-900/60 border border-vault-850 rounded-2xl p-3 text-left">
              {isEditingDesc ? (
                <div className="space-y-2">
                  <textarea
                    value={groupDesc}
                    onChange={e => setGroupDesc(e.target.value)}
                    placeholder="Add a group description..."
                    rows={2}
                    className="w-full bg-vault-950 border border-emerald/50 rounded-xl p-2 text-xs text-vault-100 focus:outline-none"
                  />
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setIsEditingDesc(false)}
                      className="px-2.5 py-1 text-xs text-vault-400 hover:text-white"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleSaveDesc}
                      className="px-3 py-1 text-xs bg-emerald text-vault-950 font-bold rounded-lg"
                    >
                      Save
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-start justify-between gap-2">
                  <p className="text-xs text-vault-300 m-0 whitespace-pre-wrap">
                    {groupDesc || 'No group description set.'}
                  </p>
                  {isAdmin && (
                    <button
                      type="button"
                      onClick={() => setIsEditingDesc(true)}
                      className="text-vault-500 hover:text-emerald shrink-0"
                      title="Edit Description"
                    >
                      <Edit2 className="w-3 h-3" />
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Members List Section */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold uppercase tracking-wider text-vault-400">
                Members ({members.length})
              </span>
              {isAdmin && (
                <button
                  type="button"
                  onClick={() => setShowAddMember(true)}
                  className="flex items-center gap-1.5 text-xs font-bold text-emerald hover:text-emerald/80"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  Add Members
                </button>
              )}
            </div>

            <div className="space-y-2">
              {loadingMembers && !members.length && (
                <div className="text-center py-6 text-xs text-vault-400">Loading members...</div>
              )}
              {members.map(m => {
                const isMe = m.user_id === user?.id;
                const displayName = m.nickname || m.profile.display_name;
                return (
                  <div
                    key={m.user_id}
                    className="flex items-center justify-between p-2.5 rounded-2xl bg-vault-900/50 border border-vault-850 hover:border-vault-750 transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <Avatar
                        name={m.profile.display_name}
                        seed={m.profile.uid}
                        src={m.profile.avatar_url}
                        size={40}
                      />
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm font-semibold text-white truncate">{displayName}</span>
                          {isMe && <span className="text-[10px] text-emerald font-mono">(You)</span>}
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-vault-400 font-mono">@{m.profile.username || m.profile.uid}</span>
                          {m.nickname && (
                            <span className="text-[10px] text-vault-400 truncate italic">
                              ({m.profile.display_name})
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {/* Role Badge */}
                      {m.role === 'owner' && (
                        <span className="flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                          <Crown className="w-2.5 h-2.5" /> Owner
                        </span>
                      )}
                      {m.role === 'admin' && (
                        <span className="flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald/20 text-emerald border border-emerald/30">
                          <ShieldCheck className="w-2.5 h-2.5" /> Admin
                        </span>
                      )}

                      {/* Action Menu Trigger */}
                      <button
                        type="button"
                        onClick={() => setSelectedMember(m)}
                        className="p-1.5 rounded-xl hover:bg-vault-800 text-vault-400 hover:text-white"
                        aria-label="Member options"
                      >
                        <MoreVertical className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Danger Zone */}
          <div className="pt-2 border-t border-vault-850 space-y-2">
            <button
              type="button"
              onClick={() => setConfirmLeave(true)}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl bg-vault-900 border border-rose-500/20 text-rose-400 hover:bg-rose-500/10 font-bold text-xs transition-colors"
            >
              <LogOut className="w-4 h-4" />
              Leave Group
            </button>

            {isAdmin && (
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl bg-rose-600/20 border border-rose-500/40 text-rose-300 hover:bg-rose-600/30 font-bold text-xs transition-colors"
              >
                <Trash2 className="w-4 h-4" />
                Delete Group Permanently
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Member Action Sheet */}
      {selectedMember && (
        <div
          className="fixed inset-0 z-60 bg-black/70 flex items-end sm:items-center justify-center"
          onClick={() => setSelectedMember(null)}
        >
          <div
            className="w-full sm:max-w-xs bg-vault-900 border border-vault-800 rounded-t-3xl sm:rounded-3xl p-4 shadow-2xl space-y-2"
            onClick={e => e.stopPropagation()}
          >
            <p className="text-xs font-bold text-white px-2 mb-2 truncate">
              {selectedMember.profile.display_name}
            </p>

            {/* Set Nickname */}
            <button
              type="button"
              onClick={() => {
                setNicknameTarget(selectedMember);
                setNicknameInput(selectedMember.nickname || '');
                setSelectedMember(null);
              }}
              className="w-full flex items-center gap-3 p-2.5 rounded-xl text-left text-xs font-medium text-vault-200 hover:bg-vault-800"
            >
              <Smile className="w-4 h-4 text-amber-400" />
              Set Nickname (Instagram Style)
            </button>

            {/* Toggle Admin (Owner Only) */}
            {isOwner && selectedMember.role !== 'owner' && (
              <button
                type="button"
                onClick={() => handleToggleAdmin(selectedMember)}
                className="w-full flex items-center gap-3 p-2.5 rounded-xl text-left text-xs font-medium text-vault-200 hover:bg-vault-800"
              >
                <Shield className="w-4 h-4 text-emerald" />
                {selectedMember.role === 'admin' ? 'Dismiss as Admin' : 'Make Group Admin'}
              </button>
            )}

            {/* Remove Member */}
            {isAdmin && selectedMember.user_id !== user?.id && selectedMember.role !== 'owner' && (
              <button
                type="button"
                onClick={() => handleRemoveMember(selectedMember)}
                className="w-full flex items-center gap-3 p-2.5 rounded-xl text-left text-xs font-medium text-rose-400 hover:bg-rose-500/10"
              >
                <UserMinus className="w-4 h-4" />
                Remove from Group
              </button>
            )}

            <button
              type="button"
              onClick={() => setSelectedMember(null)}
              className="w-full py-2.5 text-center text-xs text-vault-400 hover:text-white"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Set Nickname Modal */}
      {nicknameTarget && (
        <div
          className="fixed inset-0 z-60 bg-black/70 flex items-center justify-center p-4"
          onClick={() => setNicknameTarget(null)}
        >
          <div
            className="w-full max-w-sm bg-vault-900 border border-vault-800 rounded-3xl p-5 shadow-2xl space-y-4"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center gap-2">
              <Smile className="w-5 h-5 text-amber-400" />
              <h3 className="text-sm font-bold text-white m-0">
                Nickname for {nicknameTarget.profile.display_name}
              </h3>
            </div>
            <p className="text-xs text-vault-400 m-0">
              Only members of this chat will see this custom nickname.
            </p>
            <input
              type="text"
              value={nicknameInput}
              onChange={e => setNicknameInput(e.target.value)}
              placeholder="e.g. Bestie ❤️, Captain 🏏"
              className="w-full bg-vault-950 border border-vault-700 focus:border-emerald rounded-xl px-3 py-2 text-sm text-white focus:outline-none"
              autoFocus
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setNicknameTarget(null)}
                className="px-4 py-2 rounded-xl text-xs text-vault-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveNickname}
                className="px-4 py-2 rounded-xl bg-emerald text-vault-950 font-bold text-xs"
              >
                Save Nickname
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Members Sheet */}
      {showAddMember && (
        <div
          className="fixed inset-0 z-60 bg-black/70 flex items-end sm:items-center justify-center"
          onClick={() => setShowAddMember(false)}
        >
          <div
            className="w-full sm:max-w-md bg-vault-900 border border-vault-800 rounded-t-3xl sm:rounded-3xl p-5 shadow-2xl max-h-[85vh] flex flex-col space-y-4"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white m-0">Add Members to Group</h3>
              <button
                type="button"
                onClick={() => setShowAddMember(false)}
                className="text-vault-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <input
              type="text"
              value={addMemberQuery}
              onChange={e => setAddMemberQuery(e.target.value)}
              placeholder="Search by UID or username..."
              className="w-full bg-vault-950 border border-vault-750 focus:border-emerald rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none"
              autoFocus
            />

            <div className="flex-1 overflow-y-auto max-h-56 space-y-1.5">
              {searchCandidates.map(p => {
                const isSelected = selectedToAdd.some(s => s.id === p.id);
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      setSelectedToAdd(prev =>
                        isSelected ? prev.filter(s => s.id !== p.id) : [...prev, p]
                      );
                    }}
                    className={`w-full flex items-center justify-between p-2.5 rounded-xl text-left text-xs transition-colors ${
                      isSelected
                        ? 'bg-emerald/15 border border-emerald/40 text-white'
                        : 'bg-vault-950 hover:bg-vault-850 text-vault-300 border border-transparent'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <Avatar name={p.display_name} seed={p.uid} src={p.avatar_url} size={32} />
                      <div>
                        <p className="font-bold text-white m-0">{p.display_name}</p>
                        <p className="text-[10px] text-vault-400 font-mono m-0">@{p.username || p.uid}</p>
                      </div>
                    </div>
                    <div
                      className={`w-5 h-5 rounded-full flex items-center justify-center ${
                        isSelected ? 'bg-emerald text-vault-950' : 'border border-vault-700'
                      }`}
                    >
                      {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                    </div>
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              onClick={handleAddMembers}
              disabled={!selectedToAdd.length || isAdding}
              className="w-full py-2.5 bg-emerald text-vault-950 font-bold text-xs rounded-xl disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isAdding ? 'Adding...' : `Add ${selectedToAdd.length} Member(s)`}
            </button>
          </div>
        </div>
      )}

      {/* Confirm Leave Modal */}
      {confirmLeave && (
        <div className="fixed inset-0 z-70 bg-black/80 flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-vault-900 border border-vault-800 rounded-3xl p-5 shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-amber-400">
              <AlertCircle className="w-6 h-6 shrink-0" />
              <h3 className="text-base font-bold text-white m-0">Leave this group?</h3>
            </div>
            <p className="text-xs text-vault-300 m-0">
              You will no longer receive messages or be able to view group updates.
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmLeave(false)}
                className="px-4 py-2 text-xs text-vault-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleLeaveGroup}
                className="px-4 py-2 text-xs bg-rose-600 text-white font-bold rounded-xl"
              >
                Leave Group
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Delete Modal */}
      {confirmDelete && (
        <div className="fixed inset-0 z-70 bg-black/80 flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-vault-900 border border-rose-500/40 rounded-3xl p-5 shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-rose-400">
              <Trash2 className="w-6 h-6 shrink-0" />
              <h3 className="text-base font-bold text-white m-0">Delete entire group?</h3>
            </div>
            <p className="text-xs text-vault-300 m-0">
              This action cannot be undone. All messages, media, and member data will be permanently erased.
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                className="px-4 py-2 text-xs text-vault-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteGroup}
                className="px-4 py-2 text-xs bg-rose-600 text-white font-bold rounded-xl"
              >
                Delete Permanently
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

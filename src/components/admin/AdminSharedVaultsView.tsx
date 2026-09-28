import React, { useState, useEffect, useCallback } from 'react';
import {
  FolderLock,
  Search,
} from 'lucide-react';
import { AdminSharedVaultSummary } from '../../types';
import { listAllSharedVaultsForAdmin } from '../../lib/sharedVaultApi';
import { Avatar } from '../common/Avatar';
import { useAuth } from '../../context/AuthContext';
import { AdminSharedVaultDetail } from './AdminSharedVaultDetail';

interface AdminSharedVaultsViewProps {
  onGoToConversation?: (conversationId: string, messageId?: string) => void;
}

export const AdminSharedVaultsView: React.FC<AdminSharedVaultsViewProps> = ({
  onGoToConversation,
}) => {
  const { user } = useAuth();
  const [vaults, setVaults] = useState<AdminSharedVaultSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedVault, setSelectedVault] = useState<AdminSharedVaultSummary | null>(null);

  const loadVaults = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const data = await listAllSharedVaultsForAdmin(user.id);
      setVaults(data);
    } catch (err) {
      console.error('Failed to load shared vaults:', err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void loadVaults();
  }, [loadVaults]);

  const filteredVaults = vaults.filter(v => {
    const q = searchQuery.toLowerCase();
    if (v.is_group) {
      return (
        (v.group_name && v.group_name.toLowerCase().includes(q)) ||
        v.members.some(m => m.display_name.toLowerCase().includes(q) || (m.username && m.username.toLowerCase().includes(q)) || m.uid.toLowerCase().includes(q))
      );
    }
    return (
      v.user_a.display_name.toLowerCase().includes(q) ||
      v.user_b.display_name.toLowerCase().includes(q) ||
      (v.user_a.username && v.user_a.username.toLowerCase().includes(q)) ||
      (v.user_b.username && v.user_b.username.toLowerCase().includes(q)) ||
      v.user_a.uid.toLowerCase().includes(q) ||
      v.user_b.uid.toLowerCase().includes(q)
    );
  });

  if (selectedVault) {
    return (
      <AdminSharedVaultDetail
        conversationId={selectedVault.conversation_id}
        userA={selectedVault.user_a}
        userB={selectedVault.user_b}
        onBack={() => setSelectedVault(null)}
        onGoToConversation={onGoToConversation}
      />
    );
  }

  return (
    <div className="space-y-4 animate-fade-in pb-12">
      {/* Header bar */}
      <div className="p-4 bg-vault-900 border border-vault-800 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-lg">
        <div>
          <h2 className="text-base font-bold text-white m-0">Shared Vaults Directory</h2>
          <p className="text-xs text-vault-400 mt-0.5 m-0">
            Browse and inspect dual-user shared memory capsules.
          </p>
        </div>

        {/* Search */}
        <div className="relative w-full sm:w-72">
          <Search className="w-3.5 h-3.5 text-vault-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search by username or ID…"
            className="w-full bg-vault-950 border border-vault-800 rounded-xl pl-9 pr-3 py-1.5 text-xs text-white placeholder-vault-500 focus:outline-none focus:ring-1 focus:ring-purple-400"
          />
        </div>
      </div>

      {/* Vault List Cards */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {[1, 2, 3, 4, 5, 6].map(i => (
            <div key={i} className="h-32 rounded-2xl bg-vault-900 animate-pulse border border-vault-800" />
          ))}
        </div>
      ) : filteredVaults.length === 0 ? (
        <div className="p-12 text-center bg-vault-900 border border-vault-800 rounded-2xl flex flex-col items-center justify-center gap-2 text-vault-400 text-xs">
          <FolderLock className="w-8 h-8 text-vault-600 mb-1" />
          <p className="text-sm font-bold text-white m-0">No Shared Vaults Found</p>
          <p className="m-0">No shared vaults match the search criteria.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
          {filteredVaults.map(vault => (
            <div
              key={vault.conversation_id}
              className="p-4 bg-vault-900 hover:bg-vault-850 border border-vault-800 hover:border-purple-500/50 rounded-2xl shadow-md transition-all flex flex-col justify-between gap-3"
            >
              {/* Partner / group info */}
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="flex items-center -space-x-2.5 shrink-0">
                    {(vault.is_group ? vault.members.slice(0, 3) : [vault.user_a, vault.user_b]).map((m, i) => (
                      <Avatar key={`${vault.conversation_id}-${m.id}-${i}`} name={m.display_name} seed={m.uid} src={m.avatar_url} size={40} />
                    ))}
                  </div>

                  <div className="min-w-0">
                    {vault.is_group ? (
                      <>
                        <h3 className="text-sm font-bold text-white truncate m-0">
                          {vault.group_name || 'Unnamed Group'}
                        </h3>
                        <p className="text-[11px] text-vault-400 font-mono truncate m-0 mt-0.5">
                          {vault.members.length} members
                        </p>
                      </>
                    ) : (
                      <>
                        <h3 className="text-sm font-bold text-white truncate m-0 flex items-center gap-1.5">
                          <span className="truncate">{vault.user_a.display_name}</span>
                          <span className="text-purple-400 font-mono text-xs">↔</span>
                          <span className="truncate">{vault.user_b.display_name}</span>
                        </h3>
                        <p className="text-[11px] text-vault-400 font-mono truncate m-0 mt-0.5">
                          @{vault.user_a.username || vault.user_a.uid} · @{vault.user_b.username || vault.user_b.uid}
                        </p>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* Counts Badge */}
              <div className="grid grid-cols-4 gap-1.5 py-2 px-3 rounded-xl bg-vault-950 border border-vault-800/80 text-center font-mono">
                <div>
                  <span className="block text-xs font-bold text-purple-300">{vault.total_photos}</span>
                  <span className="text-[9px] text-vault-500">Photos</span>
                </div>
                <div>
                  <span className="block text-xs font-bold text-cyan-300">{vault.total_videos}</span>
                  <span className="text-[9px] text-vault-500">Videos</span>
                </div>
                <div>
                  <span className="block text-xs font-bold text-emerald">{vault.total_audio}</span>
                  <span className="text-[9px] text-vault-500">Audio</span>
                </div>
                <div>
                  <span className="block text-xs font-bold text-pink-300">{vault.total_text_memories}</span>
                  <span className="text-[9px] text-vault-500">Quotes</span>
                </div>
              </div>

              {/* Action */}
              <button
                type="button"
                onClick={() => setSelectedVault(vault)}
                className="w-full flex items-center justify-center gap-2 py-2 rounded-xl bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 border border-purple-500/30 text-xs font-bold transition-colors active:scale-95"
              >
                <FolderLock className="w-3.5 h-3.5" />
                <span>Open Shared Vault →</span>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

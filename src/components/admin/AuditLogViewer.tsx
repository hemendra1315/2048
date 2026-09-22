import React, { useState, useEffect, useCallback } from 'react';
import { Search } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { listAuditLogs } from '../../lib/adminApi';
import { AdminAccessLogItem } from '../../types';
import { formatDetailedDate } from '../../lib/utils';

export const AuditLogViewer: React.FC = () => {
  const { user } = useAuth();
  const [logs, setLogs] = useState<AdminAccessLogItem[]>([]);
  const [filterAction, setFilterAction] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  const [loadError, setLoadError] = useState<string | null>(null);

  const loadLogs = useCallback(async () => {
    if (!user) return;
    try {
      setLogs(await listAuditLogs());
      setLoadError(null);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Could not load the audit log');
    }
  }, [user]);

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  const filtered = logs.filter(l => {
    const matchesAction = filterAction === 'ALL' || l.action_type === filterAction;
    const matchesSearch =
      searchQuery === '' ||
      l.action_type.toLowerCase().includes(searchQuery.toLowerCase()) ||
      Boolean(l.admin?.uid?.toLowerCase().includes(searchQuery.toLowerCase())) ||
      Boolean(l.targetUser?.uid?.toLowerCase().includes(searchQuery.toLowerCase()));
    return matchesAction && matchesSearch;
  });

  const actionTypes = [
    'ALL',
    'VIEW_USER',
    'VIEW_CONVERSATION',
    'VIEW_GALLERY',
    'SUSPEND_USER',
    'BAN_USER',
    'UNBAN_USER',
    'DELETE_GALLERY_ITEM',
    'GRANT_SUPER_ADMIN',
  ];

  return (
    <div className="space-y-4 pb-20 animate-fade-in">
      <div>
        <h2 className="text-base font-bold text-white">Permanent Audit Trail</h2>
        <p className="text-xs text-vault-400">Append-only immutable record of all moderation activities</p>
      </div>

      {/* Filters */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-vault-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search audit trail..."
            className="w-full bg-vault-900 border border-vault-800 focus:border-amber-500 rounded-2xl pl-10 pr-4 py-2 text-xs text-white placeholder-vault-600 outline-none"
          />
        </div>
      </div>

      {/* Action Badges */}
      <div className="flex gap-1.5 overflow-x-auto pb-1 text-xs">
        {actionTypes.map(act => (
          <button
            key={act}
            onClick={() => setFilterAction(act)}
            className={`px-3 py-1.5 rounded-xl whitespace-nowrap text-[11px] font-bold border transition-all ${
              filterAction === act
                ? 'bg-amber-950 text-amber-300 border-amber-600 shadow-sm'
                : 'bg-vault-900 text-vault-400 border-vault-800 hover:border-vault-700'
            }`}
          >
            {act}
          </button>
        ))}
      </div>

      {loadError && (
        <div className="bg-rose-950/40 border border-rose-800/60 rounded-2xl p-3 text-xs text-rose-200">{loadError}</div>
      )}

      {/* Log Feed */}
      <div className="space-y-2">
        {filtered.length === 0 ? (
          <div className="bg-vault-900/60 border border-vault-800 rounded-2xl p-8 text-center text-xs text-vault-400">
            No audit records matching this filter.
          </div>
        ) : (
          filtered.map(l => (
            <div
              key={l.id}
              className="bg-vault-900 border border-vault-800 rounded-2xl p-3.5 space-y-2 text-xs shadow-sm"
            >
              <div className="flex items-center justify-between">
                <span className="px-2 py-0.5 bg-amber-950/80 border border-amber-600/50 text-amber-300 font-mono font-bold rounded-md text-[10px]">
                  {l.action_type}
                </span>
                <span className="text-[10px] text-vault-500 font-mono">
                  {formatDetailedDate(l.created_at)}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 text-[11px] bg-vault-950/80 p-2.5 rounded-xl border border-vault-800/80">
                <div>
                  <span className="text-vault-500 block">Acting Admin</span>
                  <span className="font-mono text-vault-200 font-semibold">{l.admin?.uid || (l.admin_id ? 'SUPER_ADMIN' : 'DATABASE CONSOLE')}</span>
                </div>
                <div>
                  <span className="text-vault-500 block">Target Identity</span>
                  <span className="font-mono text-arcade-gold font-semibold">
                    {l.targetUser ? `${l.targetUser.uid} (${l.targetUser.display_name})` : 'System Core'}
                  </span>
                </div>
              </div>

              {l.metadata && Object.keys(l.metadata).length > 0 && (
                <div className="text-[10px] text-vault-400 bg-vault-950 p-2 rounded-lg border border-vault-850 font-mono truncate">
                  {JSON.stringify(l.metadata)}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
};

import React, { useState, useEffect, useCallback } from 'react';
import { Flag, AlertTriangle, CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import { UserProfile } from '../../types';
import { formatDetailedDate } from '../../lib/utils';

interface UserReport {
  id: string;
  reporter_id: string | null;
  reported_user_id: string;
  category: string;
  severity: string;
  status: 'pending' | 'investigating' | 'resolved' | 'dismissed';
  reason: string;
  message_snapshot: string | null;
  resolution_notes: string | null;
  created_at: string;
}

const SEVERITY_STYLE: Record<string, string> = {
  urgent: 'bg-rose-950 text-rose-300 border-rose-600/50',
  high: 'bg-red-950 text-red-300 border-red-700/50',
  medium: 'bg-amber-950 text-amber-300 border-amber-600/50',
  low: 'bg-vault-800 text-vault-300 border-vault-700',
};

export const ReportsQueue: React.FC = () => {
  const { user, isSuperAdmin } = useAuth();
  const [reports, setReports] = useState<UserReport[]>([]);
  const [profiles, setProfiles] = useState<Record<string, UserProfile>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notesDraft, setNotesDraft] = useState<Record<string, string>>({});

  const loadReports = useCallback(async () => {
    if (!user || !isSuperAdmin) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('user_reports')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      const rows = (data ?? []) as unknown as UserReport[];
      setReports(rows);

      const ids = Array.from(new Set(rows.flatMap(r => [r.reporter_id, r.reported_user_id]).filter(Boolean))) as string[];
      if (ids.length > 0) {
        const { data: profileRows } = await supabase.from('profiles').select('*').in('id', ids);
        const map: Record<string, UserProfile> = {};
        for (const p of (profileRows ?? []) as unknown as UserProfile[]) map[p.id] = p;
        setProfiles(map);
      }
      setLoadError(null);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Could not load reports');
    } finally {
      setLoading(false);
    }
  }, [user, isSuperAdmin]);

  useEffect(() => {
    loadReports();
  }, [loadReports]);

  const handleResolve = async (report: UserReport, status: 'resolved' | 'dismissed') => {
    setBusyId(report.id);
    try {
      const { error } = await supabase.rpc('admin_update_report', {
        p_report_id: report.id,
        p_status: status,
        p_notes: notesDraft[report.id] ?? null,
      });
      if (error) throw error;
      await loadReports();
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Could not update report');
    } finally {
      setBusyId(null);
    }
  };

  if (!isSuperAdmin) {
    return (
      <div className="bg-rose-950/60 border border-rose-800 rounded-3xl p-8 text-center space-y-3">
        <AlertTriangle className="w-10 h-10 text-rose-400 mx-auto" />
        <p className="text-xs text-rose-200">Super Admin access required.</p>
      </div>
    );
  }

  const openReports = reports.filter(r => r.status === 'pending' || r.status === 'investigating');
  const closedReports = reports.filter(r => r.status === 'resolved' || r.status === 'dismissed');

  return (
    <div className="space-y-4 pb-20 animate-fade-in">
      <div>
        <h2 className="text-base font-bold text-white flex items-center gap-2">
          <Flag className="w-4 h-4 text-rose-400" />
          User Reports
        </h2>
        <p className="text-xs text-vault-400">Moderation queue for reports filed by users</p>
      </div>

      {loadError && (
        <div className="bg-rose-950/40 border border-rose-800/60 rounded-2xl p-3 text-xs text-rose-200">{loadError}</div>
      )}

      {loading ? (
        <div className="bg-vault-900 border border-vault-800 rounded-2xl p-8 flex items-center justify-center">
          <Loader2 className="w-6 h-6 text-arcade-gold animate-spin" />
        </div>
      ) : openReports.length === 0 ? (
        <div className="bg-vault-900/60 border border-vault-800 rounded-2xl p-8 text-center text-xs text-vault-400">
          No open reports.
        </div>
      ) : (
        <div className="space-y-2.5">
          {openReports.map(r => {
            const reporter = r.reporter_id ? profiles[r.reporter_id] : undefined;
            const reported = profiles[r.reported_user_id];
            return (
              <div key={r.id} className="bg-vault-900 border border-vault-800 rounded-2xl p-3.5 space-y-2.5 text-xs shadow-sm">
                <div className="flex items-center justify-between">
                  <span
                    className={`px-2 py-0.5 border font-bold rounded-md text-[10px] uppercase ${SEVERITY_STYLE[r.severity] ?? SEVERITY_STYLE.low}`}
                  >
                    {r.severity} · {r.category.replace(/_/g, ' ')}
                  </span>
                  <span className="text-[10px] text-vault-500 font-mono">{formatDetailedDate(r.created_at)}</span>
                </div>

                <div className="grid grid-cols-2 gap-2 text-[11px] bg-vault-950/80 p-2.5 rounded-xl border border-vault-800/80">
                  <div>
                    <span className="text-vault-500 block">Reported by</span>
                    <span className="font-mono text-vault-200 font-semibold">{reporter?.uid ?? 'Unknown'}</span>
                  </div>
                  <div>
                    <span className="text-vault-500 block">Reported user</span>
                    <span className="font-mono text-arcade-gold font-semibold">{reported?.uid ?? r.reported_user_id}</span>
                  </div>
                </div>

                {r.reason && <p className="text-vault-300 bg-vault-950/60 p-2 rounded-lg">{r.reason}</p>}
                {r.message_snapshot && (
                  <p className="text-vault-400 italic bg-vault-950 p-2 rounded-lg border border-vault-850">
                    "{r.message_snapshot}"
                  </p>
                )}

                <input
                  type="text"
                  value={notesDraft[r.id] ?? ''}
                  onChange={e => setNotesDraft(prev => ({ ...prev, [r.id]: e.target.value }))}
                  placeholder="Resolution notes (optional)"
                  className="w-full bg-vault-950 border border-vault-800 focus:border-amber-500 rounded-lg px-2.5 py-1.5 text-[11px] text-white placeholder-vault-600 outline-none"
                />

                <div className="flex gap-2">
                  <button
                    disabled={busyId === r.id}
                    onClick={() => handleResolve(r, 'resolved')}
                    className="flex-1 flex items-center justify-center gap-1 py-2 bg-emerald-950 hover:bg-emerald-900 border border-emerald-600/50 text-emerald-300 rounded-xl font-bold disabled:opacity-40"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" /> Resolve
                  </button>
                  <button
                    disabled={busyId === r.id}
                    onClick={() => handleResolve(r, 'dismissed')}
                    className="flex-1 flex items-center justify-center gap-1 py-2 bg-vault-800 hover:bg-vault-700 border border-vault-700 text-vault-300 rounded-xl font-bold disabled:opacity-40"
                  >
                    <XCircle className="w-3.5 h-3.5" /> Dismiss
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {closedReports.length > 0 && (
        <details className="text-xs">
          <summary className="cursor-pointer text-vault-400 font-semibold px-1">
            {closedReports.length} resolved/dismissed report(s)
          </summary>
          <div className="space-y-2 mt-2">
            {closedReports.map(r => (
              <div key={r.id} className="bg-vault-900/60 border border-vault-800 rounded-xl p-2.5 text-[11px] text-vault-400">
                <span className="font-mono">{r.category}</span> · {r.status} · {formatDetailedDate(r.created_at)}
                {r.resolution_notes && <div className="mt-1 text-vault-500">{r.resolution_notes}</div>}
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
};

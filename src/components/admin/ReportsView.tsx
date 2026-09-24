import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  AlertTriangle,
  Filter,
  Search,
  ShieldAlert,
  User,
  MessageSquare,
  ChevronRight,
  ExternalLink,
  Ban,
  Check,
  FileText,
  AlertOctagon,
  RefreshCw,
  Clock,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import {
  SafetyReport,
  getSafetyReports,
  updateSafetyReportStatus,
  addAdminNote,
  REPORT_REASONS,
  ReportStatus,
} from '../../lib/safetyApi';
import { setUserStatus, listProfiles } from '../../lib/adminApi';
import { UserProfile } from '../../types';
import { formatDetailedDate } from '../../lib/utils';

interface ReportsViewProps {
  initialReportId?: string | null;
  onNavigateToUser?: (userId: string, tab?: 'overview' | 'chats' | 'media' | 'reports' | 'notes') => void;
  onNavigateToConversation?: (conversationId: string, highlightMessageId?: string) => void;
}

export const ReportsView: React.FC<ReportsViewProps> = ({
  initialReportId,
  onNavigateToUser,
  onNavigateToConversation,
}) => {
  const { user: currentAdmin } = useAuth();
  const { showToast } = useToast();

  const [reports, setReports] = useState<SafetyReport[]>([]);
  const [profilesMap, setProfilesMap] = useState<Record<string, UserProfile>>({});
  const [loading, setLoading] = useState(true);
  const [selectedReportId, setSelectedReportId] = useState<string | null>(initialReportId || null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'investigating' | 'resolved' | 'dismissed'>('all');
  const [reasonFilter, setReasonFilter] = useState<string>('all');
  const [actionReason, setActionReason] = useState('');
  const [actionModal, setActionModal] = useState<{
    type: 'resolve' | 'dismiss' | 'warn' | 'suspend' | 'ban' | 'note';
    report: SafetyReport;
  } | null>(null);

  const loadData = useCallback(async () => {
    if (!currentAdmin) return;
    setLoading(true);
    try {
      const [allReports, profiles] = await Promise.all([
        getSafetyReports(currentAdmin.id),
        listProfiles(),
      ]);
      setReports(allReports);

      const pMap: Record<string, UserProfile> = {};
      profiles.forEach(p => {
        pMap[p.id] = p;
      });
      setProfilesMap(pMap);

      if (initialReportId && allReports.some(r => r.id === initialReportId)) {
        setSelectedReportId(initialReportId);
      } else if (allReports.length > 0 && !selectedReportId) {
        setSelectedReportId(allReports[0].id);
      }
    } catch (err) {
      console.error('Error loading reports:', err);
      showToast('Failed to load safety reports', 'error');
    } finally {
      setLoading(false);
    }
  }, [currentAdmin, initialReportId, selectedReportId, showToast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const filteredReports = useMemo(() => {
    return reports.filter(r => {
      const reportedUser = profilesMap[r.reportedUserId];
      const reporterUser = profilesMap[r.reporterId];

      const matchesSearch =
        searchQuery.trim() === '' ||
        r.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
        r.reason.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (r.notes && r.notes.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (reportedUser &&
          (reportedUser.display_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            reportedUser.uid.toLowerCase().includes(searchQuery.toLowerCase()) ||
            Boolean(reportedUser.username?.toLowerCase().includes(searchQuery.toLowerCase())))) ||
        (reporterUser &&
          (reporterUser.display_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            reporterUser.uid.toLowerCase().includes(searchQuery.toLowerCase())));

      const matchesStatus = statusFilter === 'all' || r.status === statusFilter;
      const matchesReason = reasonFilter === 'all' || r.category === reasonFilter;

      return matchesSearch && matchesStatus && matchesReason;
    });
  }, [reports, profilesMap, searchQuery, statusFilter, reasonFilter]);

  const selectedReport = useMemo(() => {
    return reports.find(r => r.id === selectedReportId) || null;
  }, [reports, selectedReportId]);

  const reportedUserReports = useMemo(() => {
    if (!selectedReport) return [];
    return reports.filter(
      r => r.reportedUserId === selectedReport.reportedUserId && r.id !== selectedReport.id
    );
  }, [reports, selectedReport]);

  const handleUpdateStatus = async (
    reportId: string,
    status: ReportStatus,
    notes?: string
  ) => {
    if (!currentAdmin) return;
    try {
      const updated = await updateSafetyReportStatus(currentAdmin.id, reportId, status, notes);
      if (updated) {
        setReports(prev => prev.map(r => (r.id === reportId ? updated : r)));
      } else {
        setReports(prev =>
          prev.map(r => (r.id === reportId ? { ...r, status, notes } : r))
        );
      }
      showToast(`Report updated to ${status.toUpperCase()}`, 'success');
      setActionModal(null);
      setActionReason('');
    } catch (err) {
      console.error('Error updating report status:', err);
      showToast('Failed to update report status', 'error');
    }
  };

  const handleDisciplineUser = async (
    userId: string,
    status: 'active' | 'suspended' | 'banned',
    reason: string
  ) => {
    if (!currentAdmin) return;
    try {
      await setUserStatus(currentAdmin.id, userId, status, reason);
      showToast(`User status set to ${status.toUpperCase()}`, 'success');

      if (selectedReport) {
        await updateSafetyReportStatus(
          currentAdmin.id,
          selectedReport.id,
          'resolved',
          `Action taken: User ${status.toUpperCase()} - Reason: ${reason}`
        );
        setReports(prev =>
          prev.map(r =>
            r.id === selectedReport.id
              ? {
                  ...r,
                  status: 'resolved',
                  notes: `Action taken: User ${status.toUpperCase()} - ${reason}`,
                }
              : r
          )
        );
      }
      setActionModal(null);
      setActionReason('');
    } catch (err) {
      console.error('Disciplinary action failed:', err);
      showToast(err instanceof Error ? err.message : 'Action failed', 'error');
    }
  };

  const handleAddNote = async (userId: string, text: string) => {
    if (!currentAdmin || !text.trim()) return;
    try {
      await addAdminNote(
        currentAdmin.id,
        currentAdmin.display_name || 'Admin',
        userId,
        text.trim(),
        'warning'
      );
      showToast('Internal note recorded', 'success');
      setActionModal(null);
      setActionReason('');
    } catch (err) {
      console.error('Failed to add note:', err);
      showToast('Failed to save note', 'error');
    }
  };

  return (
    <div className="space-y-4 pb-20 animate-fade-in text-vault-100">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-vault-800 pb-3">
        <div>
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-rose-400" />
            <h2 className="text-base font-bold text-white tracking-wide">
              Trust & Safety Reports Queue
            </h2>
            <span className="px-2 py-0.5 rounded-full bg-rose-950/80 border border-rose-800/80 text-rose-300 text-[10px] font-bold font-mono">
              {reports.filter(r => r.status === 'pending').length} Pending
            </span>
          </div>
          <p className="text-xs text-vault-400 mt-0.5">
            Triage abuse, harassment, and policy violations with full context and 1-click actions
          </p>
        </div>

        <button
          onClick={loadData}
          className="self-start sm:self-auto px-3 py-1.5 bg-vault-900 hover:bg-vault-800 border border-vault-700 rounded-xl text-xs font-bold text-arcade-gold flex items-center gap-1.5 transition-colors"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh Queue</span>
        </button>
      </div>

      {/* Search & Filter Bar */}
      <div className="bg-vault-900 border border-vault-800 rounded-2xl p-3 space-y-2.5">
        <div className="relative">
          <Search className="w-4 h-4 text-vault-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search reports by ID, user, keywords, or reason..."
            className="w-full bg-vault-950 border border-vault-800 focus:border-amber-500 rounded-xl pl-10 pr-4 py-2 text-xs text-white placeholder-vault-600 outline-none transition-colors"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Status filters */}
          <div className="flex items-center gap-1 overflow-x-auto">
            {(['all', 'pending', 'investigating', 'resolved', 'dismissed'] as const).map(st => (
              <button
                key={st}
                onClick={() => setStatusFilter(st)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold uppercase transition-all ${
                  statusFilter === st
                    ? 'bg-arcade-gold text-vault-950 shadow-sm'
                    : 'bg-vault-950 text-vault-400 border border-vault-800 hover:text-white'
                }`}
              >
                {st}
              </button>
            ))}
          </div>

          <div className="h-4 w-px bg-vault-800 hidden sm:block" />

          {/* Reason filter */}
          <div className="flex items-center gap-1">
            <Filter className="w-3.5 h-3.5 text-vault-500" />
            <select
              value={reasonFilter}
              onChange={e => setReasonFilter(e.target.value)}
              className="bg-vault-950 border border-vault-800 text-vault-300 text-xs rounded-lg px-2 py-1 outline-none font-medium"
            >
              <option value="all">All Categories</option>
              {REPORT_REASONS.map((r: string) => (
                <option key={r} value={r}>
                  {r.replace('_', ' ')}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Main Content Area: Split List & Detail Inspector */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        {/* Reports Queue List (5 cols on lg) */}
        <div className="lg:col-span-5 space-y-2 max-h-[75vh] overflow-y-auto pr-1">
          {loading ? (
            <div className="p-8 text-center bg-vault-900 border border-vault-800 rounded-2xl text-xs text-vault-400">
              Loading reports queue...
            </div>
          ) : filteredReports.length === 0 ? (
            <div className="p-8 text-center bg-vault-900 border border-vault-800 rounded-2xl text-xs text-vault-500">
              No safety reports found matching criteria.
            </div>
          ) : (
            filteredReports.map(report => {
              const reportedUser = profilesMap[report.reportedUserId];
              const isSelected = selectedReportId === report.id;

              return (
                <div
                  key={report.id}
                  onClick={() => setSelectedReportId(report.id)}
                  className={`p-3.5 rounded-2xl border transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-vault-850 border-arcade-gold/80 shadow-md ring-1 ring-arcade-gold/30'
                      : 'bg-vault-900 border-vault-800 hover:border-vault-700'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase font-mono ${
                          report.status === 'pending'
                            ? 'bg-rose-950 text-rose-300 border border-rose-800'
                            : report.status === 'investigating'
                            ? 'bg-amber-950 text-amber-300 border border-amber-800'
                            : report.status === 'resolved'
                            ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                            : 'bg-vault-800 text-vault-400 border border-vault-700'
                        }`}
                      >
                        {report.status}
                      </span>
                      <span className="text-[10px] font-mono text-vault-400">
                        {report.id.slice(0, 8)}
                      </span>
                    </div>

                    <span className="text-[10px] text-vault-500">
                      {formatDetailedDate(report.createdAt)}
                    </span>
                  </div>

                  <div className="mt-2 flex items-center justify-between">
                    <div>
                      <div className="text-xs font-bold text-white flex items-center gap-1.5">
                        <AlertOctagon className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                        <span>{report.category.replace('_', ' ')}</span>
                      </div>
                      <div className="text-[11px] text-vault-400 mt-0.5">
                        Target:{' '}
                        <span className="text-vault-200 font-semibold">
                          {reportedUser ? reportedUser.display_name : report.reportedUserId}
                        </span>{' '}
                        {reportedUser && (
                          <span className="text-arcade-gold font-mono font-bold">
                            ({reportedUser.uid})
                          </span>
                        )}
                      </div>
                    </div>

                    <ChevronRight
                      className={`w-4 h-4 transition-transform ${
                        isSelected ? 'text-arcade-gold translate-x-1' : 'text-vault-600'
                      }`}
                    />
                  </div>

                  {report.reason && (
                    <div className="mt-2 p-2 rounded-xl bg-vault-950 border border-vault-850 text-[11px] text-vault-300 italic truncate">
                      "{report.reason}"
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Selected Report Inspector (7 cols on lg) */}
        <div className="lg:col-span-7">
          {selectedReport ? (
            <div className="bg-vault-900 border border-vault-800 rounded-3xl p-5 space-y-4 shadow-xl">
              {/* Report Header */}
              <div className="flex items-start justify-between border-b border-vault-800 pb-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono font-bold text-arcade-gold">
                      REPORT #{selectedReport.id}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase font-mono ${
                        selectedReport.status === 'pending'
                          ? 'bg-rose-950 text-rose-300 border border-rose-800'
                          : selectedReport.status === 'investigating'
                          ? 'bg-amber-950 text-amber-300 border border-amber-800'
                          : selectedReport.status === 'resolved'
                          ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                          : 'bg-vault-800 text-vault-400 border border-vault-700'
                      }`}
                    >
                      {selectedReport.status}
                    </span>
                  </div>
                  <h3 className="text-base font-bold text-white mt-1">
                    {selectedReport.category.replace('_', ' ')}
                  </h3>
                  <div className="text-[11px] text-vault-500 mt-0.5">
                    Reported on {formatDetailedDate(selectedReport.createdAt)}
                  </div>
                </div>

                {/* Status Quick Toggle */}
                <div className="flex items-center gap-1">
                  {selectedReport.status === 'pending' && (
                    <button
                      onClick={() => handleUpdateStatus(selectedReport.id, 'investigating')}
                      className="px-2.5 py-1 bg-amber-950 hover:bg-amber-900 border border-amber-700 text-amber-300 rounded-xl text-xs font-bold transition-all"
                    >
                      Investigate
                    </button>
                  )}
                  {selectedReport.status !== 'resolved' && (
                    <button
                      onClick={() => handleUpdateStatus(selectedReport.id, 'resolved')}
                      className="px-2.5 py-1 bg-emerald-950 hover:bg-emerald-900 border border-emerald-700 text-emerald-300 rounded-xl text-xs font-bold transition-all flex items-center gap-1"
                    >
                      <Check className="w-3.5 h-3.5" /> Resolve
                    </button>
                  )}
                  {selectedReport.status !== 'dismissed' && (
                    <button
                      onClick={() => handleUpdateStatus(selectedReport.id, 'dismissed')}
                      className="px-2.5 py-1 bg-vault-800 hover:bg-vault-700 border border-vault-700 text-vault-400 rounded-xl text-xs font-bold transition-all"
                    >
                      Dismiss
                    </button>
                  )}
                </div>
              </div>

              {/* Reported User & Reporter Profile Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Reported User Card */}
                {(() => {
                  const reportedUser = profilesMap[selectedReport.reportedUserId];
                  return (
                    <div className="bg-vault-950 border border-vault-800 rounded-2xl p-3.5 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold text-rose-400 uppercase tracking-wider">
                          Reported User (Target)
                        </span>
                        {reportedUser && (
                          <span
                            className={`text-[9px] px-1.5 py-0.2 rounded uppercase font-bold ${
                              reportedUser.status === 'active'
                                ? 'text-emerald-400 bg-emerald-950'
                                : 'text-rose-400 bg-rose-950'
                            }`}
                          >
                            {reportedUser.status}
                          </span>
                        )}
                      </div>

                      {reportedUser ? (
                        <div className="flex items-center gap-3">
                          <img
                            src={
                              reportedUser.avatar_url ||
                              `https://api.dicebear.com/7.x/bottts/svg?seed=${reportedUser.uid}`
                            }
                            alt="Avatar"
                            className="w-10 h-10 rounded-xl bg-vault-800 object-cover border border-vault-700"
                          />
                          <div className="min-w-0 flex-1">
                            <div className="text-xs font-bold text-white truncate">
                              {reportedUser.display_name}
                            </div>
                            <div className="text-[10px] font-mono text-arcade-gold font-bold">
                              {reportedUser.uid}
                            </div>
                            <div className="text-[10px] text-vault-500 truncate">
                              @{reportedUser.username || 'none'}
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="text-xs font-mono text-vault-400">
                          {selectedReport.reportedUserId}
                        </div>
                      )}

                      <button
                        onClick={() =>
                          onNavigateToUser?.(selectedReport.reportedUserId, 'overview')
                        }
                        className="w-full mt-2 py-1.5 bg-vault-900 hover:bg-vault-850 border border-vault-700 text-arcade-gold rounded-xl text-xs font-bold flex items-center justify-center gap-1 transition-colors"
                      >
                        <User className="w-3.5 h-3.5" />
                        <span>Open User 360 View</span>
                      </button>
                    </div>
                  );
                })()}

                {/* Reporter Card */}
                {(() => {
                  const reporter = profilesMap[selectedReport.reporterId];
                  return (
                    <div className="bg-vault-950 border border-vault-800 rounded-2xl p-3.5 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold text-vault-400 uppercase tracking-wider">
                          Reporter (Filer)
                        </span>
                        <span className="text-[9px] text-vault-500 font-mono">
                          {formatDetailedDate(selectedReport.createdAt)}
                        </span>
                      </div>

                      {reporter ? (
                        <div className="flex items-center gap-3">
                          <img
                            src={
                              reporter.avatar_url ||
                              `https://api.dicebear.com/7.x/bottts/svg?seed=${reporter.uid}`
                            }
                            alt="Avatar"
                            className="w-10 h-10 rounded-xl bg-vault-800 object-cover border border-vault-700"
                          />
                          <div className="min-w-0 flex-1">
                            <div className="text-xs font-bold text-white truncate">
                              {reporter.display_name}
                            </div>
                            <div className="text-[10px] font-mono text-arcade-gold font-bold">
                              {reporter.uid}
                            </div>
                            <div className="text-[10px] text-vault-500 truncate">
                              @{reporter.username || 'none'}
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="text-xs font-mono text-vault-400">
                          {selectedReport.reporterId}
                        </div>
                      )}

                      <button
                        onClick={() =>
                          onNavigateToUser?.(selectedReport.reporterId, 'overview')
                        }
                        className="w-full mt-2 py-1.5 bg-vault-900 hover:bg-vault-850 border border-vault-700 text-vault-300 hover:text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1 transition-colors"
                      >
                        <User className="w-3.5 h-3.5" />
                        <span>View Reporter Profile</span>
                      </button>
                    </div>
                  );
                })()}
              </div>

              {/* Reported Evidence & Chat Context */}
              <div className="bg-vault-950 border border-vault-800 rounded-2xl p-4 space-y-3">
                <div className="flex items-center justify-between border-b border-vault-850 pb-2">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-white">
                    <MessageSquare className="w-4 h-4 text-arcade-gold" />
                    <span>Evidence & Reported Content</span>
                  </div>

                  {selectedReport.conversationId && (
                    <button
                      onClick={() =>
                        onNavigateToConversation?.(
                          selectedReport.conversationId!,
                          selectedReport.messageId
                        )
                      }
                      className="px-2.5 py-1 bg-vault-900 hover:bg-vault-850 border border-vault-700 text-arcade-gold rounded-xl text-[11px] font-bold flex items-center gap-1 transition-colors"
                    >
                      <ExternalLink className="w-3 h-3" />
                      <span>Inspect Conversation Stream</span>
                    </button>
                  )}
                </div>

                {selectedReport.reason && (
                  <div className="bg-vault-900 border border-vault-800 rounded-xl p-3">
                    <div className="text-[10px] font-bold text-vault-400 uppercase mb-1">
                      Reported Reason / Incident Summary:
                    </div>
                    <div className="text-xs text-rose-200 font-mono bg-rose-950/30 border border-rose-900/50 p-2.5 rounded-lg">
                      "{selectedReport.reason}"
                    </div>
                  </div>
                )}
              </div>

              {/* Past Reports History for this User */}
              {reportedUserReports.length > 0 && (
                <div className="bg-vault-950 border border-vault-800 rounded-2xl p-3.5 space-y-2">
                  <div className="text-xs font-bold text-amber-300 flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    <span>Previous Reports against this user ({reportedUserReports.length})</span>
                  </div>
                  <div className="space-y-1.5 max-h-32 overflow-y-auto">
                    {reportedUserReports.map(prevReport => (
                      <div
                        key={prevReport.id}
                        onClick={() => setSelectedReportId(prevReport.id)}
                        className="p-2 rounded-xl bg-vault-900 border border-vault-800 hover:border-vault-700 cursor-pointer text-xs flex items-center justify-between"
                      >
                        <div>
                          <span className="font-bold text-white">{prevReport.category}</span>
                          <span className="text-[10px] text-vault-500 ml-2">
                            {formatDetailedDate(prevReport.createdAt)}
                          </span>
                        </div>
                        <span
                          className={`text-[9px] font-mono px-1.5 py-0.2 rounded uppercase ${
                            prevReport.status === 'resolved'
                              ? 'text-emerald-400 bg-emerald-950'
                              : 'text-amber-400 bg-amber-950'
                          }`}
                        >
                          {prevReport.status}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Resolution Notes if any */}
              {selectedReport.notes && (
                <div className="bg-emerald-950/40 border border-emerald-800/60 rounded-2xl p-3.5 text-xs text-emerald-200">
                  <div className="font-bold text-[10px] uppercase tracking-wider text-emerald-400 mb-0.5">
                    Resolution Record
                  </div>
                  <p>{selectedReport.notes}</p>
                </div>
              )}

              {/* Fast Action / Enforcement Buttons Bar */}
              <div className="border-t border-vault-800 pt-3 flex flex-wrap items-center gap-2">
                <button
                  onClick={() =>
                    setActionModal({ type: 'warn', report: selectedReport })
                  }
                  className="px-3 py-2 bg-amber-950 hover:bg-amber-900 border border-amber-700/60 text-amber-300 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all"
                >
                  <AlertTriangle className="w-3.5 h-3.5" />
                  <span>Issue Warning Note</span>
                </button>

                <button
                  onClick={() =>
                    setActionModal({ type: 'suspend', report: selectedReport })
                  }
                  className="px-3 py-2 bg-amber-900 hover:bg-amber-800 border border-amber-600 text-amber-100 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all"
                >
                  <Clock className="w-3.5 h-3.5" />
                  <span>Suspend Account</span>
                </button>

                <button
                  onClick={() =>
                    setActionModal({ type: 'ban', report: selectedReport })
                  }
                  className="px-3 py-2 bg-rose-950 hover:bg-rose-900 border border-rose-700 text-rose-300 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all"
                >
                  <Ban className="w-3.5 h-3.5" />
                  <span>Permanent Ban</span>
                </button>

                <button
                  onClick={() =>
                    setActionModal({ type: 'note', report: selectedReport })
                  }
                  className="px-3 py-2 bg-vault-800 hover:bg-vault-700 text-vault-200 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all ml-auto"
                >
                  <FileText className="w-3.5 h-3.5" />
                  <span>Add Staff Note</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="bg-vault-900 border border-vault-800 rounded-3xl p-12 text-center text-xs text-vault-400">
              Select a report from the list to inspect context, chat evidence, and execute moderation actions.
            </div>
          )}
        </div>
      </div>

      {/* Enforcement Confirmation Modal */}
      {actionModal && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-vault-900 border border-vault-700/80 rounded-3xl w-full max-w-sm p-6 flex flex-col shadow-2xl space-y-4">
            <div className="flex items-center gap-2 text-arcade-gold font-bold">
              <ShieldAlert className="w-5 h-5 text-rose-400" />
              <span className="text-sm uppercase tracking-wide">
                Confirm {actionModal.type} Action
              </span>
            </div>

            <p className="text-xs text-vault-300 leading-relaxed">
              Target User ID:{' '}
              <strong className="text-white font-mono">
                {actionModal.report.reportedUserId}
              </strong>{' '}
              (Report #{actionModal.report.id})
            </p>

            <div>
              <label className="block text-[10px] font-bold text-vault-400 uppercase tracking-wider mb-1">
                Reason / Action Justification (Audited)
              </label>
              <textarea
                value={actionReason}
                onChange={e => setActionReason(e.target.value)}
                placeholder="Enter justification for audit log..."
                rows={3}
                className="w-full bg-vault-950 border border-vault-700 focus:border-amber-500 rounded-xl p-2.5 text-xs text-white placeholder-vault-600 outline-none resize-none"
              />
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setActionModal(null);
                  setActionReason('');
                }}
                className="flex-1 py-2 bg-vault-800 hover:bg-vault-700 text-vault-300 rounded-xl text-xs font-bold transition-colors"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={() => {
                  if (actionModal.type === 'note') {
                    handleAddNote(actionModal.report.reportedUserId, actionReason);
                  } else if (actionModal.type === 'warn') {
                    handleAddNote(
                      actionModal.report.reportedUserId,
                      `OFFICIAL WARNING: ${actionReason}`
                    );
                  } else if (actionModal.type === 'suspend') {
                    handleDisciplineUser(
                      actionModal.report.reportedUserId,
                      'suspended',
                      actionReason || 'Policy Violation (Suspended)'
                    );
                  } else if (actionModal.type === 'ban') {
                    handleDisciplineUser(
                      actionModal.report.reportedUserId,
                      'banned',
                      actionReason || 'Severe Policy Violation (Banned)'
                    );
                  }
                }}
                className={`flex-1 py-2 rounded-xl text-xs font-bold shadow-md transition-colors ${
                  actionModal.type === 'ban'
                    ? 'bg-rose-600 hover:bg-rose-500 text-white'
                    : actionModal.type === 'suspend'
                    ? 'bg-amber-600 hover:bg-amber-500 text-white'
                    : 'bg-emerald-600 hover:bg-emerald-500 text-white'
                }`}
              >
                Execute
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

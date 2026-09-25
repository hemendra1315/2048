import type { User360Tab } from './User360View';
import React, { useState, useEffect, useCallback } from 'react';
import {
  Activity,
  UserPlus,
  MessageSquare,
  Image as ImageIcon,
  ShieldAlert,
  Ban,
  RefreshCw,
  Clock,
  ArrowRight,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { listAuditLogs, listProfiles, listConversations, listGalleryItems } from '../../lib/adminApi';
import { listSafetyReports } from '../../lib/safetyApi';
import { UserProfile } from '../../types';
import { formatTimestamp } from '../../lib/utils';
import { readableMessagePreview } from '../../lib/chatExtras';

interface LiveActivityFeedProps {
  onSelectUser?: (userId: string, tab?: User360Tab) => void;
  onSelectConversation?: (conversationId: string, highlightMessageId?: string) => void;
  onSelectMedia?: (conversationId?: string, messageId?: string) => void;
  onSelectReport?: (reportId: string) => void;
  onNavigateToUser?: (userId: string, tab?: User360Tab) => void;
  onNavigateToConversation?: (conversationId: string, highlightMessageId?: string) => void;
  onNavigateToReport?: (reportId: string) => void;
}

interface FeedEvent {
  id: string;
  type: 'user_created' | 'message_sent' | 'media_upload' | 'status_change' | 'report_filed' | 'admin_action';
  title: string;
  description: string;
  timestamp: string;
  user?: UserProfile;
  targetUserId?: string;
  conversationId?: string;
  messageId?: string;
  reportId?: string;
  severity?: 'normal' | 'warning' | 'danger';
}

export const LiveActivityFeed: React.FC<LiveActivityFeedProps> = ({
  onSelectUser,
  onSelectConversation,
  onSelectReport,
  onNavigateToUser,
  onNavigateToConversation,
  onNavigateToReport,
}) => {
  const navigateUser = onNavigateToUser || onSelectUser || (() => {});
  const navigateConv = onNavigateToConversation || onSelectConversation || (() => {});
  const navigateReport = onNavigateToReport || onSelectReport || (() => {});

  const { user } = useAuth();
  const [events, setEvents] = useState<FeedEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState<string>('all');

  const loadFeed = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const profiles = await listProfiles();
      const profileMap: Record<string, UserProfile> = {};
      for (const p of profiles) profileMap[p.id] = p;

      // Profiles are loaded once above and passed through, instead of each call
      // independently re-fetching the entire profiles table.
      const [logs, convs, gallery, reports] = await Promise.all([
        listAuditLogs(100, profileMap),
        listConversations(user.id),
        listGalleryItems(user.id, profileMap),
        listSafetyReports(user.id, profileMap),
      ]);

      const combined: FeedEvent[] = [];

      // 1. User Registrations
      profiles.forEach(p => {
        combined.push({
          id: `reg_${p.id}`,
          type: 'user_created',
          title: `New User Registered: ${p.display_name}`,
          description: `@${p.username || 'unknown'} joined the platform (UID: ${p.uid})`,
          timestamp: p.created_at,
          user: p,
          targetUserId: p.id,
          severity: 'normal',
        });
      });

      // 2. Direct Messages
      convs.forEach(c => {
        const uA = profileMap[c.user_a];
        const uB = profileMap[c.user_b];
        c.messages.forEach(m => {
          const sender = profileMap[m.sender_id];
          const receiver = m.sender_id === c.user_a ? uB : uA;
          combined.push({
            id: `msg_${m.id}`,
            type: 'message_sent',
            title: `DM: ${sender?.display_name || 'User'} → ${receiver?.display_name || 'User'}`,
            description: (() => {
              const text = readableMessagePreview(m.content);
              return text.length > 80 ? `${text.slice(0, 80)}...` : text;
            })(),
            timestamp: m.created_at,
            user: sender,
            targetUserId: m.sender_id,
            conversationId: c.id,
            messageId: m.id,
            severity: 'normal',
          });
        });
      });

      // 3. Gallery uploads
      gallery.forEach(g => {
        const owner = profileMap[g.user_id];
        const relatedConv = convs.find(c => c.user_a === g.user_id || c.user_b === g.user_id);
        combined.push({
          id: `med_${g.id}`,
          type: 'media_upload',
          title: `Gallery upload: ${owner?.display_name || 'User'}`,
          description: g.caption ? `"${g.caption}"` : 'Uploaded a photo',
          timestamp: g.created_at,
          user: owner,
          targetUserId: g.user_id,
          conversationId: relatedConv?.id,
          severity: 'normal',
        });
      });

      // 4. Trust & Safety Reports
      reports.forEach(r => {
        combined.push({
          id: `rep_${r.id}`,
          type: 'report_filed',
          title: `Safety Report Filed: ${r.category.replace('_', ' ').toUpperCase()}`,
          description: `${r.reason} (Target: ${r.reportedUser?.display_name || r.reportedUserId})`,
          timestamp: r.createdAt,
          targetUserId: r.reportedUserId,
          reportId: r.id,
          conversationId: r.conversationId,
          messageId: r.messageId,
          severity: r.severity === 'urgent' || r.severity === 'high' ? 'danger' : 'warning',
        });
      });

      // 5. Audit & Status Logs
      logs.forEach(l => {
        if (l.action_type === 'SET_USER_STATUS' || l.action_type === 'BAN_USER') {
          const target = profileMap[l.target_user_id || ''];
          combined.push({
            id: `audit_${l.id}`,
            type: 'status_change',
            title: `Admin Action: ${l.action_type}`,
            description: `Target: ${target?.display_name || l.target_user_id || 'Unknown'} • Details: ${JSON.stringify(l.metadata || {})}`,
            timestamp: l.created_at,
            targetUserId: l.target_user_id || undefined,
            severity: 'warning',
          });
        }
      });

      // Sort chronological descending
      combined.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      setEvents(combined);
    } catch (err) {
      console.error('Error loading live activity feed:', err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    loadFeed();
    const interval = setInterval(loadFeed, 10000);
    return () => clearInterval(interval);
  }, [loadFeed]);

  const filteredEvents = events.filter(e => {
    if (filterType === 'all') return true;
    if (filterType === 'reports') return e.type === 'report_filed';
    if (filterType === 'media') return e.type === 'media_upload';
    if (filterType === 'messages') return e.type === 'message_sent';
    if (filterType === 'status') return e.type === 'status_change' || e.type === 'admin_action';
    return true;
  });

  const getEventIcon = (type: FeedEvent['type']) => {
    switch (type) {
      case 'user_created':
        return <UserPlus className="w-4 h-4 text-emerald" />;
      case 'message_sent':
        return <MessageSquare className="w-4 h-4 text-cyan-400" />;
      case 'media_upload':
        return <ImageIcon className="w-4 h-4 text-purple-400" />;
      case 'report_filed':
        return <ShieldAlert className="w-4 h-4 text-rose-400" />;
      case 'status_change':
        return <Ban className="w-4 h-4 text-amber-400" />;
      default:
        return <Activity className="w-4 h-4 text-vault-400" />;
    }
  };

  return (
    <div className="space-y-4">
      {/* Feed Control Bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-vault-900 border border-vault-800 p-3.5 rounded-2xl">
        <div className="flex items-center gap-2.5">
          <div className="w-3 h-3 rounded-full bg-emerald animate-pulse" />
          <h3 className="text-sm font-bold text-white uppercase tracking-wider m-0">Live Platform Stream</h3>
          <span className="text-xs text-vault-400 font-mono">({filteredEvents.length} events)</span>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <div className="flex bg-vault-950 p-1 rounded-xl border border-vault-750 text-xs overflow-x-auto w-full sm:w-auto">
            {['all', 'reports', 'media', 'messages', 'status'].map(f => (
              <button
                key={f}
                type="button"
                onClick={() => setFilterType(f)}
                className={`px-3 py-1 rounded-lg font-bold capitalize transition-colors cursor-pointer ${
                  filterType === f
                    ? 'bg-emerald text-black shadow-sm'
                    : 'text-vault-400 hover:text-white'
                }`}
              >
                {f}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={loadFeed}
            title="Refresh feed"
            aria-label="Refresh feed"
            className="p-2 bg-vault-800 hover:bg-vault-700 text-vault-200 rounded-xl border border-vault-700 shrink-0 cursor-pointer"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Events Stream List */}
      <div className="space-y-2">
        {loading && events.length === 0 ? (
          <div className="py-16 text-center text-vault-400 text-xs flex items-center justify-center gap-2">
            <div className="w-4 h-4 rounded-full border-2 border-emerald border-t-transparent animate-spin" />
            <span>Loading live events...</span>
          </div>
        ) : filteredEvents.length === 0 ? (
          <div className="py-16 text-center text-vault-400 text-xs bg-vault-900/50 rounded-2xl border border-vault-800">
            No events found in this category.
          </div>
        ) : (
          filteredEvents.map(event => (
            <div
              key={event.id}
              className={`p-3.5 bg-vault-900 border rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 hover:border-vault-700 transition-all ${
                event.severity === 'danger'
                  ? 'border-rose-900/60 bg-rose-950/20'
                  : event.severity === 'warning'
                  ? 'border-amber-900/60 bg-amber-950/20'
                  : 'border-vault-800'
              }`}
            >
              <div className="flex items-start gap-3 min-w-0">
                <div className="p-2.5 rounded-xl bg-vault-950 border border-vault-800 shrink-0 mt-0.5">
                  {getEventIcon(event.type)}
                </div>

                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-0.5">
                    <span className="text-xs font-bold text-white">{event.title}</span>
                    <span className="text-[11px] font-mono text-vault-500 flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {formatTimestamp(event.timestamp)}
                    </span>
                  </div>

                  <p className="text-xs text-vault-300 m-0 line-clamp-2">
                    {event.description}
                  </p>
                </div>
              </div>

              {/* Quick Action Links */}
              <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                {event.targetUserId && (
                  <button
                    type="button"
                    onClick={() => navigateUser(event.targetUserId!)}
                    className="px-2.5 py-1.5 rounded-xl bg-vault-800 hover:bg-emerald hover:text-black border border-vault-700 text-vault-200 text-xs font-bold transition-colors cursor-pointer flex items-center gap-1"
                  >
                    <span>User 360</span>
                    <ArrowRight className="w-3 h-3" />
                  </button>
                )}

                {event.conversationId && (
                  <button
                    type="button"
                    onClick={() => navigateConv(event.conversationId!, event.messageId)}
                    className="px-2.5 py-1.5 rounded-xl bg-vault-800 hover:bg-cyan-500 hover:text-black border border-vault-700 text-vault-200 text-xs font-bold transition-colors cursor-pointer flex items-center gap-1"
                  >
                    <span>Chat Context</span>
                    <ArrowRight className="w-3 h-3" />
                  </button>
                )}

                {event.reportId && (
                  <button
                    type="button"
                    onClick={() => navigateReport(event.reportId!)}
                    className="px-2.5 py-1.5 rounded-xl bg-rose-950 hover:bg-rose-600 hover:text-white border border-rose-800 text-rose-300 text-xs font-bold transition-colors cursor-pointer flex items-center gap-1"
                  >
                    <span>Investigate</span>
                    <ArrowRight className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

import { blockUser } from '../../lib/blocks';
import React, { useState, useEffect, useCallback } from 'react';
import { Users, UserCheck, MessageSquare, Plus, Check, X, Clock, Ban } from 'lucide-react';
import { ConnectionItem, ConnectionRequestItem, UserProfile } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { mockBackend } from '../../lib/mockBackend';
import { supabase, isSupabaseConfigured } from '../../lib/supabase';
import { uniqueChannelName } from '../../lib/realtime';
import { AddPersonModal } from './AddPersonModal';

interface ConnectionsViewProps {
  onStartChat: (partnerId: string) => void;
}

export const ConnectionsView: React.FC<ConnectionsViewProps> = ({ onStartChat }) => {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [activeTab, setActiveTab] = useState<'approved' | 'incoming' | 'outgoing'>('approved');
  const [connections, setConnections] = useState<ConnectionItem[]>([]);
  const [incomingReqs, setIncomingReqs] = useState<ConnectionRequestItem[]>([]);
  const [outgoingReqs, setOutgoingReqs] = useState<ConnectionRequestItem[]>([]);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      if (isSupabaseConfigured()) {
        // Connections
        const { data: rawConns } = await supabase
          .from('connections')
          .select('*')
          .or(`user_a.eq.${user.id},user_b.eq.${user.id}`);

        const conns = (rawConns || []) as unknown as { id: string; user_a: string; user_b: string; created_at: string }[];

        if (conns.length > 0) {
          const partnerIds = conns.map(c => (c.user_a === user.id ? c.user_b : c.user_a));
          const { data: rawProfiles } = await supabase
            .from('profiles')
            .select('*')
            .in('id', partnerIds);

          const profiles = (rawProfiles || []) as unknown as UserProfile[];

          const formatted: ConnectionItem[] = conns.map(c => {
            const pId = c.user_a === user.id ? c.user_b : c.user_a;
            const partner = profiles.find(p => p.id === pId) || {
              id: pId,
              uid: 'UNKNOWN',
              display_name: 'Connection',
              avatar_url: null,
              role: 'user',
              status: 'active',
              created_at: '',
              updated_at: '',
            };
            return {
              id: c.id,
              user_a: c.user_a,
              user_b: c.user_b,
              created_at: c.created_at,
              partner,
            };
          });
          setConnections(formatted);
        } else {
          setConnections([]);
        }

        // Requests
        const { data: rawReqs } = await supabase
          .from('connection_requests')
          .select('*')
          .or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`)
          .eq('status', 'pending');

        const reqs = (rawReqs || []) as unknown as ConnectionRequestItem[];
        const inc = reqs.filter(r => r.receiver_id === user.id);
        const out = reqs.filter(r => r.sender_id === user.id);
        setIncomingReqs(inc);
        setOutgoingReqs(out);
      } else {
        const conns = mockBackend.getConnections(user.id);
        const reqs = mockBackend.getConnectionRequests(user.id);
        setConnections(conns);
        setIncomingReqs(reqs.incoming);
        setOutgoingReqs(reqs.outgoing);
      }
    } catch (err) {
      console.error('Error loading connections:', err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    loadData();

    if (!isSupabaseConfigured()) {
      const unsubReqs = mockBackend.subscribe('requests:changed', () => loadData());
      const unsubConns = mockBackend.subscribe('connections:changed', () => loadData());
      return () => {
        unsubReqs();
        unsubConns();
      };
    } else {
      const channel = supabase
        .channel(uniqueChannelName('connections_and_requests'))
        .on('postgres_changes', { event: '*', schema: 'public', table: 'connections' }, () => {
          loadData();
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'connection_requests' }, () => {
          loadData();
        })
        .subscribe();
      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [loadData]);

  const handleRespond = async (requestId: string, accept: boolean) => {
    try {
      if (isSupabaseConfigured()) {
        const req = incomingReqs.find(r => r.id === requestId);
        const { error } = await supabase
          .from('connection_requests')
          .update({ status: accept ? 'accepted' : 'rejected' } as unknown as { status: 'accepted' | 'rejected' })
          .eq('id', requestId);
        if (error) throw error;

        if (accept && req) {
          const userA = req.sender_id < req.receiver_id ? req.sender_id : req.receiver_id;
          const userB = req.sender_id < req.receiver_id ? req.receiver_id : req.sender_id;
          await supabase.from('connections').upsert({ user_a: userA, user_b: userB });
        }
      } else {
        mockBackend.respondToRequest(requestId, accept);
      }
      showToast(accept ? 'Connection approved' : 'Request declined', 'info');
      loadData();
    } catch (err) {
      console.error('Respond error:', err);
      showToast('Error responding to request', 'error');
    }
  };

  const handleBlock = async (targetId: string, name: string) => {
    if (!user) return;
    try {
      // Real block on the server (demo mode keeps using the local mock).
      await blockUser(user.id, targetId);
      showToast(`Blocked ${name}. They can't message you. Unblock in Settings → Privacy.`, 'info');
      loadData();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not block', 'error');
    }
  };

  return (
    <div className="space-y-4 pb-20 animate-fade-in">
      {/* Header with Add Button */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-bold text-white">People & Connections</h2>
          <p className="text-xs text-vault-400">Manage your private network</p>
        </div>
        <button
          onClick={() => setAddModalOpen(true)}
          className="flex items-center gap-1.5 bg-arcade-gold hover:bg-amber-400 active:scale-95 text-vault-950 text-xs font-bold px-3 py-2 rounded-xl shadow-md transition-all"
        >
          <Plus className="w-4 h-4" />
          <span>Add by UID</span>
        </button>
      </div>

      {/* Tabs */}
      <div className="flex bg-vault-900 border border-vault-800 p-1 rounded-2xl">
        <button
          onClick={() => setActiveTab('approved')}
          className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all ${
            activeTab === 'approved'
              ? 'bg-vault-800 text-arcade-gold shadow-sm'
              : 'text-vault-400 hover:text-white'
          }`}
        >
          Approved ({connections.length})
        </button>
        <button
          onClick={() => setActiveTab('incoming')}
          className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all relative ${
            activeTab === 'incoming'
              ? 'bg-vault-800 text-arcade-gold shadow-sm'
              : 'text-vault-400 hover:text-white'
          }`}
        >
          Incoming
          {incomingReqs.length > 0 && (
            <span className="ml-1.5 px-1.5 py-0.2 rounded-full bg-rose-500 text-white text-[10px]">
              {incomingReqs.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab('outgoing')}
          className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all ${
            activeTab === 'outgoing'
              ? 'bg-vault-800 text-arcade-gold shadow-sm'
              : 'text-vault-400 hover:text-white'
          }`}
        >
          Outgoing ({outgoingReqs.length})
        </button>
      </div>

      {/* Content */}
      {loading ? (
        <div className="p-8 text-center text-xs text-vault-400">Loading network data...</div>
      ) : activeTab === 'approved' ? (
        connections.length === 0 ? (
          <div className="bg-vault-900/60 border border-vault-800 rounded-3xl p-8 text-center">
            <Users className="w-10 h-10 text-vault-600 mx-auto mb-2" />
            <h4 className="text-sm font-bold text-white mb-1">No Connections Yet</h4>
            <p className="text-xs text-vault-400 mb-4 max-w-xs mx-auto">
              Share your UID or enter another user's UID to connect privately.
            </p>
            <button
              onClick={() => setAddModalOpen(true)}
              className="bg-vault-800 hover:bg-vault-700 text-xs font-semibold px-4 py-2 rounded-xl text-vault-200 border border-vault-700"
            >
              Add First Connection
            </button>
          </div>
        ) : (
          <div className="space-y-2.5">
            {connections.map(conn => (
              <div
                key={conn.id}
                className="bg-vault-900 border border-vault-800 hover:border-vault-700 rounded-2xl p-3.5 flex items-center justify-between shadow-sm"
              >
                <div className="flex items-center gap-3">
                  <img
                    src={conn.partner.avatar_url || `https://api.dicebear.com/7.x/bottts/svg?seed=${conn.partner.uid}`}
                    alt="Avatar"
                    className="w-11 h-11 rounded-xl bg-vault-800 border border-vault-700 object-cover"
                  />
                  <div>
                    <h4 className="text-sm font-bold text-white leading-tight">
                      {conn.partner.display_name}
                    </h4>
                    <span className="text-[11px] font-mono text-arcade-gold/90 mt-0.5 block">
                      {conn.partner.uid}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => onStartChat(conn.partner.id)}
                    className="p-2.5 bg-cyan-950/80 hover:bg-cyan-900 active:scale-95 text-cyan-300 rounded-xl border border-cyan-700/50 shadow-sm"
                    title="Direct Message"
                  >
                    <MessageSquare className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => void handleBlock(conn.partner.id, conn.partner.display_name)}
                    className="p-2.5 bg-vault-950 hover:bg-rose-950 text-vault-500 hover:text-rose-400 rounded-xl border border-vault-800"
                    title="Block User"
                  >
                    <Ban className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )
      ) : activeTab === 'incoming' ? (
        incomingReqs.length === 0 ? (
          <div className="bg-vault-900/60 border border-vault-800 rounded-3xl p-8 text-center text-xs text-vault-400">
            <UserCheck className="w-8 h-8 text-vault-600 mx-auto mb-2" />
            No pending incoming requests.
          </div>
        ) : (
          <div className="space-y-2.5">
            {incomingReqs.map(req => (
              <div
                key={req.id}
                className="bg-vault-900 border border-vault-700/80 rounded-2xl p-3.5 flex items-center justify-between shadow-md"
              >
                <div className="flex items-center gap-3">
                  <img
                    src={req.sender?.avatar_url || `https://api.dicebear.com/7.x/bottts/svg?seed=${req.sender?.uid || 'req'}`}
                    alt="Sender"
                    className="w-11 h-11 rounded-xl bg-vault-800 border border-vault-700 object-cover"
                  />
                  <div>
                    <h4 className="text-sm font-bold text-white leading-tight">
                      {req.sender?.display_name || 'Anonymous User'}
                    </h4>
                    <span className="text-[11px] font-mono text-arcade-gold mt-0.5 block">
                      {req.sender?.uid || 'UID-HIDDEN'}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => handleRespond(req.id, true)}
                    className="p-2 bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white rounded-xl shadow-md"
                    title="Accept Request"
                  >
                    <Check className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleRespond(req.id, false)}
                    className="p-2 bg-vault-800 hover:bg-vault-700 active:scale-95 text-vault-400 hover:text-rose-400 rounded-xl border border-vault-700"
                    title="Decline Request"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )
      ) : (
        outgoingReqs.length === 0 ? (
          <div className="bg-vault-900/60 border border-vault-800 rounded-3xl p-8 text-center text-xs text-vault-400">
            <Clock className="w-8 h-8 text-vault-600 mx-auto mb-2" />
            No pending outgoing requests.
          </div>
        ) : (
          <div className="space-y-2.5">
            {outgoingReqs.map(req => (
              <div
                key={req.id}
                className="bg-vault-900 border border-vault-800 rounded-2xl p-3.5 flex items-center justify-between"
              >
                <div className="flex items-center gap-3">
                  <img
                    src={req.receiver?.avatar_url || `https://api.dicebear.com/7.x/bottts/svg?seed=${req.receiver?.uid || 'out'}`}
                    alt="Receiver"
                    className="w-11 h-11 rounded-xl bg-vault-800 border border-vault-700 object-cover"
                  />
                  <div>
                    <h4 className="text-sm font-bold text-white leading-tight">
                      {req.receiver?.display_name || 'Pending Recipient'}
                    </h4>
                    <span className="text-[11px] font-mono text-vault-400 mt-0.5 block">
                      {req.receiver?.uid}
                    </span>
                  </div>
                </div>

                <span className="text-[11px] font-semibold text-amber-400 bg-amber-950/60 border border-amber-800/50 px-2.5 py-1 rounded-lg">
                  Pending
                </span>
              </div>
            ))}
          </div>
        )
      )}

      {/* Add Person Modal */}
      <AddPersonModal
        isOpen={addModalOpen}
        onClose={() => setAddModalOpen(false)}
        onRequestSent={loadData}
      />
    </div>
  );
};

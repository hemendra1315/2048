import React from 'react';
import { ConnectionItem, ConnectionRequestItem, UserProfile } from '../../../types';
import { formatDetailedDate, getAvatarUrl } from '../../../lib/utils';

interface ConnectionsTabProps {
  connectionData: {
    connections: ConnectionItem[];
    incomingRequests: ConnectionRequestItem[];
    outgoingRequests: ConnectionRequestItem[];
    blockedUsers: UserProfile[];
  };
}

export const ConnectionsTab: React.FC<ConnectionsTabProps> = ({ connectionData }) => (
  <div className="space-y-3 animate-fade-in">
    {/* Active Connections */}
    <div className="bg-vault-900 border border-vault-800 rounded-3xl p-4 space-y-2.5">
      <h4 className="text-xs font-bold text-white flex items-center justify-between border-b border-vault-800 pb-2">
        <span>Active Friends / Connections</span>
        <span className="text-arcade-gold">{connectionData.connections.length}</span>
      </h4>
      {connectionData.connections.length === 0 ? (
        <p className="text-xs text-vault-500 py-1">No active connections</p>
      ) : (
        <div className="space-y-2">
          {connectionData.connections.map(conn => (
            <div
              key={conn.id}
              className="flex items-center justify-between p-2 rounded-xl bg-vault-950 border border-vault-800 text-xs"
            >
              <div className="flex items-center gap-2">
                <img
                  src={conn.partner.avatar_url || getAvatarUrl(conn.partner.uid)}
                  alt="Partner"
                  className="w-8 h-8 rounded-lg object-cover"
                />
                <div>
                  <div className="font-bold text-white">{conn.partner.display_name}</div>
                  <div className="text-[10px] font-mono text-arcade-gold">{conn.partner.uid}</div>
                </div>
              </div>
              <div className="text-[10px] text-vault-500 font-mono">
                Connected: {formatDetailedDate(conn.created_at)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>

    {/* Pending Requests */}
    <div className="bg-vault-900 border border-vault-800 rounded-3xl p-4 space-y-2.5">
      <h4 className="text-xs font-bold text-white flex items-center justify-between border-b border-vault-800 pb-2">
        <span>Pending Requests</span>
        <span className="text-amber-400">
          {connectionData.incomingRequests.length + connectionData.outgoingRequests.length}
        </span>
      </h4>
      {connectionData.incomingRequests.length === 0 && connectionData.outgoingRequests.length === 0 ? (
        <p className="text-xs text-vault-500 py-1">No pending requests</p>
      ) : (
        <div className="space-y-1.5 text-xs">
          {connectionData.incomingRequests.map(r => (
            <div key={r.id} className="p-2 rounded-xl bg-vault-950 border border-vault-800">
              <span className="text-amber-400 font-bold">Incoming:</span> From {r.sender?.uid || 'Unknown'} (
              {formatDetailedDate(r.created_at)})
            </div>
          ))}
          {connectionData.outgoingRequests.map(r => (
            <div key={r.id} className="p-2 rounded-xl bg-vault-950 border border-vault-800">
              <span className="text-vault-400 font-bold">Outgoing:</span> To {r.receiver?.uid || 'Unknown'} (
              {formatDetailedDate(r.created_at)})
            </div>
          ))}
        </div>
      )}
    </div>

    {/* Blocked Users */}
    <div className="bg-vault-900 border border-vault-800 rounded-3xl p-4 space-y-2.5">
      <h4 className="text-xs font-bold text-white flex items-center justify-between border-b border-vault-800 pb-2">
        <span>Blocked Users</span>
        <span className="text-rose-400">{connectionData.blockedUsers.length}</span>
      </h4>
      {connectionData.blockedUsers.length === 0 ? (
        <p className="text-xs text-vault-500 py-1">No blocked users on record</p>
      ) : (
        <div className="space-y-1.5 text-xs">
          {connectionData.blockedUsers.map(b => (
            <div
              key={b.id}
              className="p-2 rounded-xl bg-vault-950 border border-vault-800 flex items-center justify-between"
            >
              <span className="font-bold text-rose-300">
                {b.display_name} ({b.uid})
              </span>
              <span className="text-[10px] text-vault-500 font-mono">Blocked</span>
            </div>
          ))}
        </div>
      )}
    </div>
  </div>
);

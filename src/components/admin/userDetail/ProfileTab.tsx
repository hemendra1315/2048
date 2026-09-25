import React from 'react';
import { UserProfile } from '../../../types';
import { formatDetailedDate } from '../../../lib/utils';

interface ProfileTabProps {
  currentUser: UserProfile;
  profileMetrics: {
    totalChats: number;
    totalConnections: number;
    totalGalleryItems: number;
  };
}

export const ProfileTab: React.FC<ProfileTabProps> = ({ currentUser, profileMetrics }) => (
  <div className="space-y-3 animate-fade-in">
    {/* Key Metrics Grid */}
    <div className="grid grid-cols-3 gap-2">
      <div className="bg-vault-900 border border-vault-800 rounded-2xl p-3 text-center">
        <div className="text-[10px] text-vault-400 uppercase font-bold">Total Chats</div>
        <div className="text-lg font-bold text-white mt-0.5">{profileMetrics.totalChats}</div>
      </div>
      <div className="bg-vault-900 border border-vault-800 rounded-2xl p-3 text-center">
        <div className="text-[10px] text-vault-400 uppercase font-bold">Connections</div>
        <div className="text-lg font-bold text-arcade-gold mt-0.5">
          {profileMetrics.totalConnections}
        </div>
      </div>
      <div className="bg-vault-900 border border-vault-800 rounded-2xl p-3 text-center">
        <div className="text-[10px] text-vault-400 uppercase font-bold">Gallery Media</div>
        <div className="text-lg font-bold text-white mt-0.5">{profileMetrics.totalGalleryItems}</div>
      </div>
    </div>

    {/* Full Profile Attributes */}
    <div className="bg-vault-900 border border-vault-800 rounded-3xl p-4.5 space-y-3">
      <h4 className="text-xs font-bold uppercase tracking-wider text-vault-400 border-b border-vault-800 pb-2">
        Identity & Account Attributes (Supabase `profiles`)
      </h4>

      <div className="space-y-2 text-xs">
        <div className="flex justify-between py-1 border-b border-vault-800/50">
          <span className="text-vault-400">Username</span>
          <span className="text-white font-mono font-bold">@{currentUser.username || 'none'}</span>
        </div>
        <div className="flex justify-between py-1 border-b border-vault-800/50">
          <span className="text-vault-400">Unique UID</span>
          <span className="text-arcade-gold font-mono font-bold">{currentUser.uid}</span>
        </div>
        <div className="flex justify-between py-1 border-b border-vault-800/50">
          <span className="text-vault-400">Display Name</span>
          <span className="text-white font-semibold">{currentUser.display_name}</span>
        </div>
        <div className="flex justify-between py-1 border-b border-vault-800/50">
          <span className="text-vault-400">Role</span>
          <span className="text-amber-300 font-bold uppercase font-mono">{currentUser.role}</span>
        </div>
        <div className="flex justify-between py-1 border-b border-vault-800/50">
          <span className="text-vault-400">Account Status</span>
          <span className="font-bold uppercase text-white">{currentUser.status}</span>
        </div>
        <div className="flex justify-between py-1 border-b border-vault-800/50">
          <span className="text-vault-400">Registered Date</span>
          <span className="text-vault-200">{formatDetailedDate(currentUser.created_at)}</span>
        </div>
        <div className="flex justify-between py-1">
          <span className="text-vault-400">Last Active</span>
          <span className="text-vault-200">
            {currentUser.last_login_at
              ? formatDetailedDate(currentUser.last_login_at)
              : formatDetailedDate(currentUser.updated_at)}
          </span>
        </div>
      </div>
    </div>
  </div>
);

import React from 'react';
import { Fingerprint, Lock, ShieldAlert, CheckCircle2, Clock } from 'lucide-react';
import { UserProfile } from '../../../types';
import { formatDetailedDate } from '../../../lib/utils';

interface SecurityTabProps {
  currentUser: UserProfile;
  securityData: {
    biometric_enabled: boolean;
    failed_login_count: number;
    last_login_at: string | null;
  } | null;
}

export const SecurityTab: React.FC<SecurityTabProps> = ({ currentUser, securityData }) => (
  <div className="space-y-3 animate-fade-in">
    <div className="bg-vault-900 border border-vault-800 rounded-3xl p-4.5 space-y-3">
      <h4 className="text-xs font-bold uppercase tracking-wider text-vault-400 border-b border-vault-800 pb-2">
        Security Parameters & Account State (Supabase Real-Time)
      </h4>

      <div className="space-y-3 text-xs">
        {/* Biometric Status */}
        <div className="flex items-center justify-between p-3 rounded-2xl bg-vault-950 border border-vault-800">
          <div className="flex items-center gap-2.5">
            <Fingerprint
              className={`w-5 h-5 ${securityData?.biometric_enabled ? 'text-emerald-400' : 'text-vault-500'}`}
            />
            <div>
              <div className="font-bold text-white">Biometric Authentication</div>
              <div className="text-[10px] text-vault-400">
                {securityData?.biometric_enabled
                  ? 'Hardware platform authenticator registered'
                  : 'Biometrics disabled (Standard PIN only)'}
              </div>
            </div>
          </div>
          <span
            className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
              securityData?.biometric_enabled
                ? 'bg-emerald-950 text-emerald-300 border-emerald-700/50'
                : 'bg-vault-800 text-vault-400 border-vault-700'
            }`}
          >
            {securityData?.biometric_enabled ? 'ENABLED' : 'DISABLED'}
          </span>
        </div>

        {/* Account Lock Status */}
        <div className="flex items-center justify-between p-3 rounded-2xl bg-vault-950 border border-vault-800">
          <div className="flex items-center gap-2.5">
            <Lock className={`w-5 h-5 ${currentUser.status === 'active' ? 'text-emerald-400' : 'text-rose-400'}`} />
            <div>
              <div className="font-bold text-white">Account Lock Status</div>
              <div className="text-[10px] text-vault-400">Access to private social matrix</div>
            </div>
          </div>
          <span
            className={`px-2 py-0.5 rounded-full text-[10px] font-bold border uppercase ${
              currentUser.status === 'active'
                ? 'bg-emerald-950 text-emerald-300 border-emerald-700/50'
                : 'bg-rose-950 text-rose-300 border-rose-700/50'
            }`}
          >
            {currentUser.status}
          </span>
        </div>

        {/* Failed Login Counter */}
        <div className="flex items-center justify-between p-3 rounded-2xl bg-vault-950 border border-vault-800">
          <div className="flex items-center gap-2.5">
            <ShieldAlert className="w-5 h-5 text-amber-400" />
            <div>
              <div className="font-bold text-white">Failed Login Attempts</div>
              <div className="text-[10px] text-vault-400">Lockout threshold: 5 consecutive failures</div>
            </div>
          </div>
          <span className="font-mono font-bold text-white bg-vault-900 px-2.5 py-1 rounded-lg border border-vault-800">
            {securityData?.failed_login_count ?? 0} Failed
          </span>
        </div>

        {/* Recovery Status */}
        <div className="flex items-center justify-between p-3 rounded-2xl bg-vault-950 border border-vault-800">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="w-5 h-5 text-emerald-400" />
            <div>
              <div className="font-bold text-white">Credential Integrity</div>
              <div className="text-[10px] text-vault-400">Salted Bcrypt / Argon2 hash verification active</div>
            </div>
          </div>
          <span className="font-mono text-[10px] font-bold text-emerald-400 bg-emerald-950/80 px-2 py-0.5 rounded border border-emerald-800/60">
            SECURE
          </span>
        </div>

        {/* Last Login Timestamp */}
        <div className="flex items-center justify-between p-3 rounded-2xl bg-vault-950 border border-vault-800">
          <div className="flex items-center gap-2.5">
            <Clock className="w-5 h-5 text-vault-400" />
            <div>
              <div className="font-bold text-white">Last Authenticated Session</div>
              <div className="text-[10px] text-vault-400">
                {securityData?.last_login_at
                  ? formatDetailedDate(securityData.last_login_at)
                  : formatDetailedDate(currentUser.updated_at)}
              </div>
            </div>
          </div>
          <span className="text-[10px] text-vault-400 font-mono">ACTIVE</span>
        </div>
      </div>
    </div>
  </div>
);

import React from 'react';
import { Copy, ShieldCheck, ShieldAlert } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { PanicButton } from '../launcher/PanicButton';

interface MobileHeaderProps {
  title?: string;
  onAdminToggle?: () => void;
}

export const MobileHeader: React.FC<MobileHeaderProps> = ({ title, onAdminToggle }) => {
  const { user, isSuperAdmin } = useAuth();
  const { showToast } = useToast();

  const copyUid = () => {
    if (user?.uid) {
      navigator.clipboard.writeText(user.uid);
      showToast(`UID ${user.uid} copied to clipboard`, 'success');
    }
  };

  return (
    <header className="sticky top-0 z-30 bg-vault-950/90 backdrop-blur-md border-b border-vault-800/80 px-4 py-3 flex items-center justify-between">
      <div className="flex items-center gap-2.5">
        <img
          src={user?.avatar_url || `https://api.dicebear.com/7.x/bottts/svg?seed=${user?.uid || 'vault'}`}
          alt="Avatar"
          className="w-9 h-9 rounded-full bg-vault-800 border border-vault-700 object-cover"
        />
        <div>
          <div className="flex items-center gap-1.5">
            <h2 className="text-sm font-bold text-white leading-tight">
              {title || user?.display_name || 'Vault User'}
            </h2>
            {isSuperAdmin && (
              <span className="px-1.5 py-0.2 bg-amber-950 text-amber-300 border border-amber-600/50 rounded text-[9px] font-bold">
                ADMIN
              </span>
            )}
          </div>

          {/* UID Pill with Copy */}
          {user?.uid && (
            <button
              onClick={copyUid}
              className="flex items-center gap-1 text-[11px] font-mono text-arcade-gold/90 hover:text-arcade-gold transition-colors leading-tight mt-0.5"
              title="Click to copy your UID"
            >
              <ShieldCheck className="w-3 h-3 text-arcade-gold" />
              <span>{user.uid}</span>
              <Copy className="w-2.5 h-2.5 opacity-60" />
            </button>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2">
        {isSuperAdmin && onAdminToggle && (
          <button
            onClick={onAdminToggle}
            className="flex items-center gap-1 px-2.5 py-1.5 bg-amber-950/80 hover:bg-amber-900 border border-amber-600/50 rounded-full text-amber-300 text-xs font-bold transition-all"
            title="Switch between User & Admin Mode"
          >
            <ShieldAlert className="w-3.5 h-3.5" />
            <span>HUB</span>
          </button>
        )}
        <PanicButton />
      </div>
    </header>
  );
};

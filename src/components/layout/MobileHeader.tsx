import React from 'react';
import { ShieldAlert } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { PanicButton } from '../launcher/PanicButton';

interface MobileHeaderProps {
  title?: string;
  onAdminToggle?: () => void;
}

/** Mobile top bar: screen title on the left, Lock (and the admin hub for staff) on the right. */
export const MobileHeader: React.FC<MobileHeaderProps> = ({ title, onAdminToggle }) => {
  const { isSuperAdmin } = useAuth();

  return (
    <header className="sticky top-0 z-30 bg-vault-950/95 backdrop-blur border-b border-vault-800 px-4 pt-4 pb-3 flex items-center justify-between gap-3">
      <h1 className="t-h1 m-0 truncate">{title || 'Chats'}</h1>
      <div className="flex items-center gap-2">
        {isSuperAdmin && onAdminToggle && (
          <button
            type="button"
            onClick={onAdminToggle}
            className="btn btn-s btn-sm !text-cy"
            title="Switch between User & Admin Mode"
            aria-label="Open admin hub"
          >
            <ShieldAlert className="i i-sm" aria-hidden />
            <span>Admin</span>
          </button>
        )}
        <PanicButton />
      </div>
    </header>
  );
};

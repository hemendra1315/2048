import React from 'react';
import { MessageSquare, Camera, Image, Shield, User } from 'lucide-react';
import { SocialTab } from '../../types';

interface MobileNavbarProps {
  currentTab: SocialTab;
  onSelectTab: (tab: SocialTab) => void;
  unreadMessagesCount?: number;
}

export const MobileNavbar: React.FC<MobileNavbarProps> = ({
  currentTab,
  onSelectTab,
  unreadMessagesCount = 0,
}) => {
  const tabs = [
    { id: 'chats' as SocialTab, label: 'Chats', icon: MessageSquare, badge: unreadMessagesCount },
    { id: 'gallery' as SocialTab, label: 'Gallery', icon: Image },
    { id: 'camera' as SocialTab, label: 'Camera', icon: Camera },
    { id: 'vault' as SocialTab, label: 'Vault', icon: Shield },
    { id: 'profile' as SocialTab, label: 'Profile', icon: User },
  ];

  return (
    <nav
      aria-label="Main"
      className="tabbar shrink-0 w-full max-w-md mx-auto lg:hidden !h-auto min-h-[68px] pb-[max(10px,env(safe-area-inset-bottom))]"
    >
      {tabs.map(t => {
        const Icon = t.icon;
        const isActive = currentTab === t.id;
        const hasBadge = Boolean(t.badge && t.badge > 0);
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => onSelectTab(t.id)}
            aria-current={isActive ? 'page' : undefined}
            aria-label={hasBadge ? `${t.label}, ${t.badge} unread` : t.label}
            className={isActive ? 'tab tab-on' : 'tab'}
          >
            <span className="tab-pill relative">
              <Icon className="i" aria-hidden />
              {hasBadge && (
                <span className="badge absolute -top-1.5 right-0.5 !h-[18px] !min-w-[18px] !text-[11px] !px-[5px] border-2 border-vault-950">
                  {t.badge}
                </span>
              )}
            </span>
            {t.label}
          </button>
        );
      })}
    </nav>
  );
};

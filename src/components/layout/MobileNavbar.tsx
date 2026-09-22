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
    { id: 'camera' as SocialTab, label: 'Camera', icon: Camera },
    { id: 'gallery' as SocialTab, label: 'Gallery', icon: Image },
    { id: 'vault' as SocialTab, label: 'Vault', icon: Shield },
    { id: 'profile' as SocialTab, label: 'Profile', icon: User },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-30 bg-[#0A0A0A]/95 backdrop-blur-xl border-t border-[#262626] px-2 py-1.5 flex justify-around items-center max-w-md mx-auto lg:hidden select-none">
      {tabs.map(t => {
        const Icon = t.icon;
        const isActive = currentTab === t.id;
        return (
          <button
            key={t.id}
            onClick={() => onSelectTab(t.id)}
            className={`flex flex-col items-center justify-center w-16 py-1 rounded-xl transition-all relative ${
              isActive
                ? 'text-[#10B981] font-bold scale-105'
                : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            <div className="relative">
              <Icon className={`w-5 h-5 ${isActive ? 'stroke-[2.5]' : 'stroke-2'}`} />
              {Boolean(t.badge && t.badge > 0) && (
                <span className="absolute -top-1.5 -right-2.5 bg-[#10B981] text-black text-[10px] font-bold px-1.5 py-0.2 rounded-full min-w-[16px] text-center shadow-md animate-pulse">
                  {t.badge}
                </span>
              )}
            </div>
            <span className="text-[10px] mt-0.5 tracking-tight">{t.label}</span>
          </button>
        );
      })}
    </nav>
  );
};

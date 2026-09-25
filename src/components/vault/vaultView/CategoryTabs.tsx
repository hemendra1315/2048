import React from 'react';
import { FolderLock, Image as ImageIcon, Video, FileText } from 'lucide-react';

export type VaultCategory = 'all' | 'photos' | 'videos' | 'documents' | 'notes';

interface CategoryTabsProps {
  activeCategory: VaultCategory;
  setActiveCategory: (category: VaultCategory) => void;
  itemCount: number;
}

const TAB_CONFIG: { id: VaultCategory; icon: React.ElementType; label: string; count: (n: number) => string }[] = [
  { id: 'all', icon: FolderLock, label: 'All Encrypted', count: n => `${n} items` },
  { id: 'photos', icon: ImageIcon, label: 'Secure Photos', count: n => `${n} items` },
  { id: 'videos', icon: Video, label: 'Secure Videos', count: () => '0 items' },
  { id: 'documents', icon: FileText, label: 'Hidden Docs', count: () => '0 items' },
];

export const CategoryTabs: React.FC<CategoryTabsProps> = ({ activeCategory, setActiveCategory, itemCount }) => (
  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
    {TAB_CONFIG.map(({ id, icon: Icon, label, count }) => (
      <button
        key={id}
        onClick={() => setActiveCategory(id)}
        className={`p-3.5 rounded-xl border text-left transition-all ${
          activeCategory === id
            ? 'bg-[#171717] border-[#10B981] text-white shadow-md'
            : 'bg-[#111111] border-[#262626] text-zinc-400 hover:text-white'
        }`}
      >
        <Icon className={`w-5 h-5 mb-2 ${activeCategory === id ? 'text-[#10B981]' : 'text-zinc-500'}`} />
        <p className="text-xs font-bold leading-tight">{label}</p>
        <p className="text-[11px] text-zinc-500 mt-0.5">{count(itemCount)}</p>
      </button>
    ))}
  </div>
);

import React, { useState, useEffect, useCallback } from 'react';
import { Search, Trash2, Shield } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { mockBackend } from '../../lib/mockBackend';
import { formatDetailedDate } from '../../lib/utils';
import { GalleryItem, UserProfile } from '../../types';

export const GalleryOversight: React.FC = () => {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [items, setItems] = useState<(GalleryItem & { user?: UserProfile })[]>([]);
  const [searchQuery, setSearchQuery] = useState('');

  const loadMedia = useCallback(() => {
    if (user) {
      const list = mockBackend.getAllGalleryItemsForAdmin(user.id);
      setItems(list);
    }
  }, [user]);

  useEffect(() => {
    loadMedia();
  }, [loadMedia]);

  const handleDelete = (item: GalleryItem) => {
    if (!user) return;
    mockBackend.deleteGalleryItem(item.id, user.id, true);
    showToast('Media item removed by administrator', 'info');
    loadMedia();
  };

  const filtered = items.filter(item =>
    Boolean(item.user?.uid.toLowerCase().includes(searchQuery.toLowerCase())) ||
    Boolean(item.user?.display_name.toLowerCase().includes(searchQuery.toLowerCase())) ||
    Boolean(item.caption?.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  return (
    <div className="space-y-4 pb-20 animate-fade-in">
      <div>
        <h2 className="text-base font-bold text-white">Central Gallery Oversight</h2>
        <p className="text-xs text-vault-400">Audit user-uploaded media items across the system</p>
      </div>

      <div className="relative">
        <Search className="w-4 h-4 text-vault-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
        <input
          type="text"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          placeholder="Filter by Uploader UID or Caption..."
          className="w-full bg-vault-900 border border-vault-800 focus:border-amber-500 rounded-2xl pl-10 pr-4 py-2.5 text-xs text-white placeholder-vault-600 outline-none"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        {filtered.map(item => (
          <div
            key={item.id}
            className="bg-vault-900 border border-vault-800 rounded-2xl overflow-hidden shadow-sm flex flex-col justify-between"
          >
            <div className="relative aspect-square bg-vault-950">
              <img
                src={item.image_url}
                alt="Audit media"
                className="w-full h-full object-cover"
              />
              <button
                onClick={() => handleDelete(item)}
                className="absolute top-2 right-2 p-1.5 bg-rose-950/90 text-rose-300 hover:text-white rounded-lg border border-rose-700/60 shadow-md"
                title="Administrative Delete"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="p-3">
              <div className="flex items-center gap-1 text-[11px] font-mono text-arcade-gold font-bold">
                <Shield className="w-3 h-3" />
                <span>{item.user?.uid}</span>
              </div>
              <p className="text-xs text-vault-200 truncate mt-0.5">{item.caption || 'No caption'}</p>
              <div className="text-[10px] text-vault-500 mt-1">
                {formatDetailedDate(item.created_at)}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

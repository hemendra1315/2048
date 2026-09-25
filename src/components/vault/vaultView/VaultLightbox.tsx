import React from 'react';
import { Trash2 } from 'lucide-react';
import { GalleryItem } from '../../../types';
import { handleImageError } from '../../../lib/utils';

interface VaultLightboxProps {
  item: GalleryItem;
  onClose: () => void;
  onDelete: (item: GalleryItem) => void;
}

export const VaultLightbox: React.FC<VaultLightboxProps> = ({ item, onClose, onDelete }) => (
  <div className="fixed inset-0 z-50 bg-black/95 backdrop-blur-xl flex flex-col justify-between p-4 sm:p-6 animate-fade-in">
    {/* Top Bar */}
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <span className="px-2.5 py-1 bg-[#111111] border border-[#262626] rounded-full text-xs text-[#10B981]">
          🔒 Encrypted
        </span>
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={() => onDelete(item)}
          className="p-2.5 rounded-full bg-[#111111] hover:bg-red-950 border border-[#262626] hover:border-red-600 text-zinc-300 hover:text-red-400 transition-all active:scale-95"
          title="Purge Item"
        >
          <Trash2 className="w-4 h-4" />
        </button>
        <button
          onClick={onClose}
          className="p-2.5 rounded-full bg-[#111111] hover:bg-[#171717] border border-[#262626] text-white transition-all active:scale-95"
        >
          ✕
        </button>
      </div>
    </div>

    {/* Media Center */}
    <div className="flex-1 flex items-center justify-center p-4">
      <img
        src={item.image_url}
        alt="Vault Media"
        className="max-h-[70vh] max-w-full rounded-2xl object-contain shadow-2xl border border-[#262626]"
        onError={handleImageError}
      />
    </div>

    {/* Bottom Info */}
    <div className="bg-[#111111] border border-[#262626] rounded-2xl p-4 max-w-md mx-auto w-full text-center">
      <p className="text-xs text-zinc-400 font-mono">Created: {new Date(item.created_at).toLocaleString()}</p>
      <p className="text-xs text-[#A1A1AA] mt-1">{item.caption || 'Encrypted Item'}</p>
    </div>
  </div>
);

import React from 'react';
import { X, Trash2, Calendar, Shield } from 'lucide-react';
import { GalleryItem } from '../../types';
import { formatDetailedDate } from '../../lib/utils';

interface LightboxViewerProps {
  item: GalleryItem | null;
  onClose: () => void;
  onDelete: (item: GalleryItem) => void;
}

export const LightboxViewer: React.FC<LightboxViewerProps> = ({
  item,
  onClose,
  onDelete,
}) => {
  if (!item) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/95 backdrop-blur-xl flex flex-col justify-between animate-fade-in p-4 select-none">
      {/* Top Bar */}
      <div className="flex items-center justify-between z-10">
        <div className="flex items-center gap-2 text-xs text-vault-400">
          <Shield className="w-4 h-4 text-arcade-gold" />
          <span>Private Media Item</span>
        </div>
        <button
          onClick={onClose}
          className="p-2 rounded-full bg-vault-900/80 text-vault-300 hover:text-white border border-vault-700 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Main Image */}
      <div className="flex-1 flex items-center justify-center p-2 min-h-0">
        <img
          src={item.image_url}
          alt={item.caption || 'Private media'}
          className="max-w-full max-h-[75vh] object-contain rounded-2xl shadow-2xl border border-vault-800"
        />
      </div>

      {/* Bottom Info & Actions */}
      <div className="bg-vault-900/80 border border-vault-700/80 rounded-2xl p-4 flex items-center justify-between z-10 max-w-md w-full mx-auto">
        <div>
          <h4 className="text-sm font-bold text-white leading-tight">
            {item.caption || 'Vault Encrypted Photo'}
          </h4>
          <div className="flex items-center gap-1.5 text-[11px] text-vault-400 mt-1">
            <Calendar className="w-3 h-3 text-arcade-gold" />
            <span>{formatDetailedDate(item.created_at)}</span>
          </div>
        </div>

        <button
          onClick={() => onDelete(item)}
          className="p-2.5 bg-rose-950/80 hover:bg-rose-900 active:scale-95 text-rose-300 rounded-xl border border-rose-700/50 transition-all"
          title="Delete Image"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};

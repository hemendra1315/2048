import React from 'react';
import { Download, Trash2 } from 'lucide-react';
import { GalleryItem, UserProfile } from '../../../types';
import { formatDetailedDate } from '../../../lib/utils';

interface GalleryTabProps {
  currentUser: UserProfile;
  galleryItems: GalleryItem[];
  activeLightboxImage: GalleryItem | null;
  setActiveLightboxImage: (item: GalleryItem | null) => void;
  onDownloadMedia: (item: GalleryItem) => void;
  onDeleteMedia: (item: GalleryItem) => void;
}

export const GalleryTab: React.FC<GalleryTabProps> = ({
  currentUser,
  galleryItems,
  activeLightboxImage,
  setActiveLightboxImage,
  onDownloadMedia,
  onDeleteMedia,
}) => (
  <div className="space-y-3 animate-fade-in">
    {galleryItems.length === 0 ? (
      <div className="bg-vault-900 border border-vault-800 rounded-2xl p-8 text-center text-xs text-vault-400">
        No private gallery uploads found for this user in Supabase.
      </div>
    ) : (
      <div className="grid grid-cols-2 gap-2.5">
        {galleryItems.map(item => (
          <div
            key={item.id}
            className="bg-vault-900 border border-vault-800 rounded-2xl overflow-hidden shadow-sm flex flex-col justify-between"
          >
            <div className="relative aspect-square bg-vault-950 group">
              <img
                src={item.image_url}
                alt={item.caption || 'Media'}
                className="w-full h-full object-cover cursor-pointer"
                onClick={() => setActiveLightboxImage(item)}
              />
              <div className="absolute top-1.5 right-1.5 flex items-center gap-1">
                <button
                  onClick={() => onDownloadMedia(item)}
                  className="p-1.5 bg-vault-950/80 hover:bg-vault-900 text-arcade-gold rounded-lg border border-vault-700 shadow-md transition-colors"
                  title="Download Media"
                >
                  <Download className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => onDeleteMedia(item)}
                  className="p-1.5 bg-rose-950/80 hover:bg-rose-900 text-rose-300 rounded-lg border border-rose-700 shadow-md transition-colors"
                  title="Delete Media"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            <div className="p-2.5">
              <div className="text-[10px] text-vault-400 font-mono">
                Type: <span className="text-vault-200">Image/Media</span>
              </div>
              <p className="text-xs text-white truncate font-medium mt-0.5">{item.caption || 'Untitled Media'}</p>
              <div className="text-[9px] text-vault-500 mt-1">{formatDetailedDate(item.created_at)}</div>
            </div>
          </div>
        ))}
      </div>
    )}

    {/* Full Screen Lightbox Modal */}
    {activeLightboxImage && (
      <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex flex-col items-center justify-center p-4 animate-fade-in">
        <div className="w-full max-w-md flex items-center justify-between text-white pb-3">
          <span className="text-xs font-bold font-mono text-arcade-gold">
            {currentUser.uid} • {activeLightboxImage.id}
          </span>
          <div className="flex items-center gap-3">
            <button
              onClick={() => onDownloadMedia(activeLightboxImage)}
              className="flex items-center gap-1 text-xs bg-vault-800 hover:bg-vault-700 px-3 py-1.5 rounded-lg border border-vault-700 font-bold text-arcade-gold"
            >
              <Download className="w-3.5 h-3.5" /> Download
            </button>
            <button
              onClick={() => setActiveLightboxImage(null)}
              className="text-xs text-vault-400 hover:text-white font-bold"
            >
              Close
            </button>
          </div>
        </div>
        <img
          src={activeLightboxImage.image_url}
          alt={activeLightboxImage.caption || 'Full view'}
          className="max-w-full max-h-[70vh] object-contain rounded-2xl border border-vault-800 shadow-2xl"
        />
        {activeLightboxImage.caption && (
          <p className="text-xs text-vault-300 text-center mt-3 max-w-sm">{activeLightboxImage.caption}</p>
        )}
      </div>
    )}
  </div>
);

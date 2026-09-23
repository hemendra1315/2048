import React, { useEffect } from 'react';
import { X, Trash, MoreHorizontal, Send, Download, Info } from 'lucide-react';
import { GalleryItem } from '../../types';

interface LightboxViewerProps {
  item: GalleryItem | null;
  onClose: () => void;
  onDelete: (item: GalleryItem) => void;
  onSend?: (item: GalleryItem) => void;
}

export const LightboxViewer: React.FC<LightboxViewerProps> = ({
  item,
  onClose,
  onDelete,
  onSend,
}) => {
  useEffect(() => {
    if (!item) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [item, onClose]);

  if (!item) return null;

  const date = new Date(item.created_at || Date.now());
  const dateFormatted = date.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'long',
  });
  const timeFormatted = date.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Photo viewer"
      className="fixed inset-0 z-50 bg-black/95 backdrop-blur-xl flex flex-col justify-between select-none animate-fade-in"
    >
      {/* Top Bar */}
      <header className="p-4 flex items-center justify-between z-10">
        <button
          type="button"
          onClick={onClose}
          className="ib ib-s rounded-full"
          aria-label="Close viewer"
        >
          <X className="i" aria-hidden />
        </button>

        <div className="text-center">
          <h3 className="t-h3 font-bold text-white m-0">
            {dateFormatted} · {timeFormatted}
          </h3>
          <p className="t-cap c3 m-0 truncate max-w-xs">
            {item.caption || 'Personal Photo'}
          </p>
        </div>

        <button
          type="button"
          className="ib ib-s rounded-full"
          aria-label="More options"
        >
          <MoreHorizontal className="i" aria-hidden />
        </button>
      </header>

      {/* Main Image Viewport */}
      <main className="flex-1 flex items-center justify-center p-4 min-h-0">
        <img
          src={item.image_url}
          alt={item.caption || 'Personal gallery photo'}
          className="max-w-full max-h-[70vh] object-contain rounded-2xl shadow-2xl border border-vault-800"
        />
      </main>

      {/* Bottom Actions Bar */}
      <footer className="p-4 pb-6 bg-vault-950/90 border-t border-vault-800 flex items-center justify-around max-w-md w-full mx-auto">
        {onSend && (
          <button
            type="button"
            onClick={() => onSend(item)}
            className="btn btn-g flex-col gap-1 h-auto py-2 px-3 min-w-[64px]"
            aria-label="Send photo"
          >
            <Send className="i" aria-hidden />
            <span className="t-cap">Send</span>
          </button>
        )}

        <a
          href={item.image_url}
          download={`photo-${item.id}.jpg`}
          target="_blank"
          rel="noreferrer"
          className="btn btn-g flex-col gap-1 h-auto py-2 px-3 min-w-[64px] text-vault-50 hover:text-white"
          aria-label="Download photo"
        >
          <Download className="i" aria-hidden />
          <span className="t-cap">Save</span>
        </a>

        <button
          type="button"
          className="btn btn-g flex-col gap-1 h-auto py-2 px-3 min-w-[64px]"
          aria-label="View photo details"
          title={item.caption || 'Details'}
        >
          <Info className="i" aria-hidden />
          <span className="t-cap">Details</span>
        </button>

        <button
          type="button"
          onClick={() => onDelete(item)}
          className="btn btn-g flex-col gap-1 h-auto py-2 px-3 min-w-[64px] !text-[#FF8A93] hover:!text-red-300"
          aria-label="Delete photo"
        >
          <Trash className="i" aria-hidden />
          <span className="t-cap">Delete</span>
        </button>
      </footer>
    </div>
  );
};

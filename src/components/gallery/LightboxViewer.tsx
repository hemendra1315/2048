import React, { useEffect, useState, useRef } from 'react';
import { X, Trash, Send, Download, Info, ZoomIn, ZoomOut, Check, HardDrive, Calendar, Image as ImageIcon, EyeOff, Heart, Undo2 } from 'lucide-react';
import { GalleryItem } from '../../types';
import type { MediaUrlState } from '../../lib/mediaUrls';
import { MediaImage } from '../common/MediaImage';
import { lightImpact, mediumImpact, selectionChange } from '../../lib/haptics';

interface LightboxViewerProps {
  item: GalleryItem | null;
  onClose: () => void;
  onDelete?: (item: GalleryItem) => void;
  onSend?: (item: GalleryItem) => void;
  onToggleFavorite?: (item: GalleryItem) => void;
  /** Present only when viewing an item from Trash — shows Restore instead of Delete. */
  onRestore?: (item: GalleryItem) => void;
  /** Resolved URL for the item (private-bucket objects need a signed URL). */
  mediaState?: MediaUrlState;
  onRetry?: () => void;
  isViewOnce?: boolean;
}

export const LightboxViewer: React.FC<LightboxViewerProps> = ({
  item,
  onClose,
  onDelete,
  onSend,
  onToggleFavorite,
  onRestore,
  mediaState,
  onRetry,
  isViewOnce = false,
}) => {
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [dragY, setDragY] = useState(0);
  const [isDraggingDown, setIsDraggingDown] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  const [showHud, setShowHud] = useState(true);
  const [showMetadata, setShowMetadata] = useState(false);

  const dragStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const posStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const lastTapRef = useRef<number>(0);
  const initialPinchDistRef = useRef<number | null>(null);
  const initialPinchScaleRef = useRef<number>(1);

  // Reset zoom & drag on item switch
  useEffect(() => {
    setScale(1);
    setPosition({ x: 0, y: 0 });
    setDragY(0);
    setShowHud(true);
    setShowMetadata(false);
  }, [item?.id]);

  useEffect(() => {
    if (!item) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showMetadata) setShowMetadata(false);
        else onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [item, showMetadata, onClose]);

  if (!item) return null;

  const state: MediaUrlState = mediaState ?? (item.image_url ? { status: 'ready', url: item.image_url } : { status: 'error' });
  const downloadUrl = state.status === 'ready' ? state.url : null;

  const date = new Date(item.created_at || Date.now());
  const dateFormatted = date.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  const timeFormatted = date.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  const handleDoubleTap = (clientX: number, clientY: number) => {
    lightImpact();
    if (scale > 1) {
      setScale(1);
      setPosition({ x: 0, y: 0 });
    } else {
      setScale(2.5);
      const xOffset = (window.innerWidth / 2 - clientX) * 1.5;
      const yOffset = (window.innerHeight / 2 - clientY) * 1.5;
      setPosition({ x: xOffset, y: yOffset });
    }
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY,
      );
      initialPinchDistRef.current = dist;
      initialPinchScaleRef.current = scale;
      return;
    }

    if (e.touches.length === 1) {
      const touch = e.touches[0];
      const now = Date.now();

      if (now - lastTapRef.current < 300) {
        handleDoubleTap(touch.clientX, touch.clientY);
        lastTapRef.current = 0;
        return;
      }
      lastTapRef.current = now;

      dragStartRef.current = { x: touch.clientX, y: touch.clientY };

      if (scale > 1) {
        setIsPanning(true);
        posStartRef.current = { ...position };
      } else {
        setIsDraggingDown(true);
      }
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2 && initialPinchDistRef.current) {
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY,
      );
      const factor = dist / initialPinchDistRef.current;
      const newScale = Math.min(4, Math.max(1, initialPinchScaleRef.current * factor));
      setScale(newScale);
      if (newScale === 1) setPosition({ x: 0, y: 0 });
      return;
    }

    if (e.touches.length === 1) {
      const touch = e.touches[0];
      const dx = touch.clientX - dragStartRef.current.x;
      const dy = touch.clientY - dragStartRef.current.y;

      if (scale > 1 && isPanning) {
        setPosition({
          x: posStartRef.current.x + dx,
          y: posStartRef.current.y + dy,
        });
      } else if (scale === 1 && isDraggingDown) {
        if (dy > 0) {
          const dampened = dy > 180 ? 180 + Math.pow(dy - 180, 0.7) * 4 : dy;
          setDragY(dampened);
        }
      }
    }
  };

  const handleTouchEnd = () => {
    initialPinchDistRef.current = null;
    setIsPanning(false);

    if (isDraggingDown) {
      setIsDraggingDown(false);
      if (dragY > 110) {
        lightImpact();
        onClose();
      } else {
        setDragY(0);
      }
    }
  };

  const toggleHud = () => {
    selectionChange();
    setShowHud(prev => !prev);
  };

  const bgOpacity = Math.max(0.2, 1 - dragY / 300);
  const dragScale = Math.max(0.7, 1 - dragY / 700);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Photo viewer"
      style={{ backgroundColor: `rgba(0, 0, 0, ${0.96 * bgOpacity})` }}
      className="fixed inset-0 z-50 backdrop-blur-2xl flex flex-col justify-between select-none touch-none animate-fade-in"
    >
      {/* Top Bar (HUD) */}
      <header
        className={`p-4 flex items-center justify-between z-20 transition-all duration-200 ${
          showHud ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-4 pointer-events-none'
        }`}
      >
        <button
          type="button"
          onClick={onClose}
          className="ib ib-s rounded-full glass-panel !text-white"
          aria-label="Close viewer"
        >
          <X className="i" aria-hidden />
        </button>

        <div className="text-center px-2 min-w-0">
          {isViewOnce ? (
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald/20 border border-emerald/40 text-emerald text-xs font-bold tracking-wide">
              <EyeOff className="w-3.5 h-3.5" />
              <span>1 View Once</span>
            </div>
          ) : (
            <>
              <h3 className="t-h3 font-bold text-white m-0 truncate text-sm sm:text-base">
                {dateFormatted} · {timeFormatted}
              </h3>
              <p className="t-cap c3 m-0 truncate max-w-[200px] sm:max-w-xs">
                {item.caption || 'Personal Photo'}
              </p>
            </>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => {
              lightImpact();
              if (scale > 1) {
                setScale(1);
                setPosition({ x: 0, y: 0 });
              } else {
                setScale(2.5);
              }
            }}
            className="ib ib-s rounded-full glass-panel !text-white"
            aria-label="Toggle zoom"
          >
            {scale > 1 ? <ZoomOut className="i" /> : <ZoomIn className="i" />}
          </button>
          {!isViewOnce && onToggleFavorite && (
            <button
              type="button"
              onClick={() => onToggleFavorite(item)}
              className={`ib ib-s rounded-full glass-panel ${item.is_favorite ? '!text-rose-400' : '!text-white'}`}
              aria-label={item.is_favorite ? 'Remove from Favorites' : 'Add to Favorites'}
            >
              <Heart className={`i ${item.is_favorite ? 'fill-current' : ''}`} aria-hidden />
            </button>
          )}
          {!isViewOnce && (
            <button
              type="button"
              onClick={() => {
                selectionChange();
                setShowMetadata(true);
              }}
              className="ib ib-s rounded-full glass-panel !text-white"
              aria-label="Photo details"
            >
              <Info className="i" aria-hidden />
            </button>
          )}
        </div>
      </header>

      {/* Main Image Viewport with Physics Drag & Zoom */}
      <main
        className="flex-1 flex items-center justify-center p-2 sm:p-4 min-h-0 relative overflow-hidden"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
        onClick={toggleHud}
      >
        <div
          style={{
            transform: `translate(${position.x}px, ${position.y + dragY}px) scale(${scale * dragScale})`,
            transition: isDraggingDown || isPanning ? 'none' : 'transform 240ms cubic-bezier(0.16, 1, 0.3, 1)',
          }}
          className="relative w-full h-full max-h-[75vh] sm:max-h-[80vh] flex items-center justify-center will-change-transform"
        >
          <MediaImage
            state={state}
            alt={item.caption || 'Personal gallery photo'}
            imgClassName="max-w-full max-h-full object-contain rounded-xl shadow-2xl"
            onRetry={onRetry}
            loading="eager"
          />
        </div>
      </main>

      {/* Bottom Actions Bar (HUD) */}
      {!isViewOnce ? (
        <footer
          className={`p-3 sm:p-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] glass-panel border-t border-white/[0.08] flex items-center justify-around max-w-md w-full mx-auto rounded-t-2xl z-20 transition-all duration-200 ${
            showHud ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4 pointer-events-none'
          }`}
        >
          {onSend && (
            <button
              type="button"
              onClick={() => {
                lightImpact();
                onSend(item);
              }}
              className="btn btn-g flex-col gap-1 h-auto py-2 px-3 min-w-[64px] hover:text-emerald"
              aria-label="Send photo in chat"
            >
              <Send className="i" aria-hidden />
              <span className="t-cap">Send</span>
            </button>
          )}

          <a
            href={downloadUrl ?? undefined}
            aria-disabled={!downloadUrl}
            onClick={e => {
              if (!downloadUrl) e.preventDefault();
              else lightImpact();
            }}
            download={`photo-${item.id}.jpg`}
            target="_blank"
            rel="noreferrer"
            className="btn btn-g flex-col gap-1 h-auto py-2 px-3 min-w-[64px] text-vault-50 hover:text-white"
            aria-label="Save photo"
          >
            <Download className="i" aria-hidden />
            <span className="t-cap">Save</span>
          </a>

          <button
            type="button"
            onClick={() => {
              selectionChange();
              setShowMetadata(true);
            }}
            className="btn btn-g flex-col gap-1 h-auto py-2 px-3 min-w-[64px]"
            aria-label="View photo details"
          >
            <Info className="i" aria-hidden />
            <span className="t-cap">Details</span>
          </button>

          {onRestore && (
            <button
              type="button"
              onClick={() => {
                lightImpact();
                onRestore(item);
                onClose();
              }}
              className="btn btn-g flex-col gap-1 h-auto py-2 px-3 min-w-[64px] !text-emerald hover:!text-emerald"
              aria-label="Restore photo"
            >
              <Undo2 className="i" aria-hidden />
              <span className="t-cap">Restore</span>
            </button>
          )}

          {onDelete && (
            <button
              type="button"
              onClick={() => {
                mediumImpact();
                onDelete(item);
              }}
              className="btn btn-g flex-col gap-1 h-auto py-2 px-3 min-w-[64px] !text-[#FF8A93] hover:!text-red-300"
              aria-label={onRestore ? 'Delete forever' : 'Delete photo'}
            >
              <Trash className="i" aria-hidden />
              <span className="t-cap">{onRestore ? 'Delete Forever' : 'Delete'}</span>
            </button>
          )}
        </footer>
      ) : (
        <footer
          className={`p-3 pb-[max(1.5rem,env(safe-area-inset-bottom))] flex items-center justify-center z-20 transition-all duration-200 ${
            showHud ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4 pointer-events-none'
          }`}
        >
          <div className="glass-pill px-4 py-1.5 rounded-full text-xs font-medium text-vault-300 tracking-wide shadow-lg">
            Swipe down or tap close to finish viewing
          </div>
        </footer>
      )}

      {/* Metadata Slide-Up Sheet */}
      {showMetadata && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-end sm:items-center justify-center anim-fade"
          onClick={() => setShowMetadata(false)}
        >
          <div
            className="w-full sm:max-w-md glass-panel rounded-t-2xl sm:rounded-2xl p-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] shadow-2xl anim-sheet"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-vault-800">
              <h3 className="t-h3 font-bold text-white flex items-center gap-2">
                <ImageIcon className="w-4 h-4 text-emerald" /> Photo Metadata
              </h3>
              <button
                type="button"
                onClick={() => setShowMetadata(false)}
                className="ib ib-s rounded-full"
                aria-label="Close metadata"
              >
                <X className="i" />
              </button>
            </div>

            <div className="py-4 space-y-3 text-xs">
              <div className="flex items-center justify-between text-vault-300">
                <span className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-vault-400" /> Capture Date
                </span>
                <span className="font-semibold text-white">{dateFormatted} at {timeFormatted}</span>
              </div>

              {item.caption && (
                <div className="flex items-center justify-between text-vault-300">
                  <span>Caption</span>
                  <span className="font-semibold text-white truncate max-w-[200px]">{item.caption}</span>
                </div>
              )}

              <div className="flex items-center justify-between text-vault-300">
                <span className="flex items-center gap-2">
                  <HardDrive className="w-4 h-4 text-vault-400" /> Vault Storage
                </span>
                <span className="flex items-center gap-1 text-emerald font-semibold">
                  <Check className="w-3.5 h-3.5" /> End-to-End Encrypted
                </span>
              </div>

              {item.storage_path && (
                <div className="flex items-center justify-between text-vault-400 font-mono text-[11px] pt-1">
                  <span>Storage Object</span>
                  <span className="truncate max-w-[180px]">{item.storage_path.split('/').pop()}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

import React, { useEffect, useState, useRef } from 'react';
import {
  X,
  Trash,
  Send,
  Download,
  Info,
  ZoomIn,
  ZoomOut,
  Check,
  HardDrive,
  Calendar,
  Image as ImageIcon,
  EyeOff,
  Heart,
  Undo2,
  Reply,
  Smile,
  FolderHeart,
  Shield,
} from 'lucide-react';
import { GalleryItem, ReactionEmoji, REACTION_EMOJIS } from '../../types';
import type { MediaUrlState } from '../../lib/mediaUrls';
import { MediaImage } from '../common/MediaImage';
import { lightImpact, mediumImpact, selectionChange, errorWarning } from '../../lib/haptics';
import { useToast } from '../../context/ToastContext';
import { useScreenProtection, ScreenShieldOverlay } from '../../lib/screenProtection';

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
  viewMode?: 'view_once' | 'allow_replay' | 'keep_in_chat';
  /* Instagram Chat Photo Actions: */
  onReply?: () => void;
  onReact?: (emoji: ReactionEmoji) => void;
  myReaction?: ReactionEmoji;
  senderName?: string;
  isMyMessage?: boolean;
  onSaveToSharedVault?: (item: GalleryItem) => void;
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
  viewMode,
  onReply,
  onReact,
  myReaction,
  senderName,
  isMyMessage = false,
  onSaveToSharedVault,
}) => {
  const { showToast } = useToast();
  const isEphemeral = isViewOnce || viewMode === 'view_once' || viewMode === 'allow_replay';
  const { isShielded } = useScreenProtection(isEphemeral, {
    onScreenshotAttempt: () => {
      showToast('Screenshots are blocked for ephemeral media', 'error');
      errorWarning();
    },
  });
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [dragY, setDragY] = useState(0);
  const [isDraggingDown, setIsDraggingDown] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  const [showHud, setShowHud] = useState(true);
  const [showMetadata, setShowMetadata] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showHeartBurst, setShowHeartBurst] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState<number>(7);

  const dragStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const posStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const lastTapRef = useRef<number>(0);
  const initialPinchDistRef = useRef<number | null>(null);
  const initialPinchScaleRef = useRef<number>(1);

  // 7-second timer for ephemeral media (View Once & View Twice)
  useEffect(() => {
    if (!isEphemeral || !item) return;
    setSecondsLeft(7);
    const interval = setInterval(() => {
      setSecondsLeft(prev => {
        if (prev <= 1) {
          clearInterval(interval);
          lightImpact();
          onClose();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [item?.id, isEphemeral, onClose]);

  // Reset zoom & drag on item switch
  useEffect(() => {
    setScale(1);
    setPosition({ x: 0, y: 0 });
    setDragY(0);
    setShowHud(true);
    setShowMetadata(false);
    setShowEmojiPicker(false);
  }, [item?.id]);

  useEffect(() => {
    if (!item) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showEmojiPicker) setShowEmojiPicker(false);
        else if (showMetadata) setShowMetadata(false);
        else onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [item, showMetadata, showEmojiPicker, onClose]);

  if (!item) return null;

  const state: MediaUrlState = mediaState ?? (item.image_url ? { status: 'ready', url: item.image_url } : { status: 'error' });
  const downloadUrl = state.status === 'ready' ? state.url : null;

  const date = new Date(item.created_at || Date.now());
  const dateFormatted = date.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
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
    if (showEmojiPicker) setShowEmojiPicker(false);
  };

  const handleSaveToDevice = async () => {
    if (isEphemeral) {
      showToast('Saving ephemeral photos is prohibited', 'error');
      errorWarning();
      return;
    }
    if (!downloadUrl) return;
    setIsSaving(true);
    lightImpact();
    try {
      const res = await fetch(downloadUrl);
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = `photo-${item.id || Date.now()}.jpg`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(blobUrl), 2000);
      showToast('Photo saved to device', 'success');
    } catch {
      // Fallback
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = `photo-${item.id || Date.now()}.jpg`;
      a.target = '_blank';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      showToast('Photo download started', 'info');
    } finally {
      setIsSaving(false);
    }
  };

  const handleHeartReact = () => {
    if (!onReact) return;
    mediumImpact();
    onReact('❤️');
    setShowHeartBurst(true);
    setTimeout(() => setShowHeartBurst(false), 650);
  };

  const bgOpacity = Math.max(0.2, 1 - dragY / 300);
  const dragScale = Math.max(0.7, 1 - dragY / 700);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Photo viewer"
      style={{ backgroundColor: `rgba(0, 0, 0, ${0.96 * bgOpacity})` }}
      onContextMenu={isEphemeral ? e => e.preventDefault() : undefined}
      className="fixed inset-0 z-50 backdrop-blur-2xl flex flex-col justify-between select-none touch-none animate-fade-in"
    >
      <ScreenShieldOverlay show={isShielded} message="Screenshots, screen recording, and saving are strictly blocked for ephemeral media." />

      {/* Top countdown progress bar for ephemeral media */}
      {isEphemeral && (
        <div className="absolute top-0 inset-x-0 z-30 h-1 bg-white/10 overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-emerald-400 to-teal-300 transition-all duration-1000 ease-linear shadow-[0_0_8px_rgba(52,211,153,0.8)]"
            style={{ width: `${(Math.max(0, secondsLeft) / 7) * 100}%` }}
          />
        </div>
      )}

      {/* Top Bar (HUD) */}
      <header
        className={`p-4 pt-[calc(0.75rem+env(safe-area-inset-top))] flex items-center justify-between z-20 transition-all duration-200 ${
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
          {isEphemeral ? (
            <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-500/20 border border-emerald-400/50 text-emerald-300 text-xs font-bold tracking-wide shadow-md backdrop-blur-md">
              <EyeOff className="w-3.5 h-3.5" />
              <span>{viewMode === 'allow_replay' ? '2 Views (Twice)' : '1 View Once'}</span>
              <span className="w-1 h-1 rounded-full bg-emerald-400 mx-0.5" />
              <span className="font-mono text-white font-black">{secondsLeft}s</span>
              <Shield className="w-3 h-3 text-emerald-400 ml-0.5" />
            </div>
          ) : (
            <>
              <h3 className="t-h3 font-bold text-white m-0 truncate text-sm sm:text-base">
                {senderName ? `${senderName}` : `${dateFormatted} · ${timeFormatted}`}
              </h3>
              <p className="t-cap c3 m-0 truncate max-w-[200px] sm:max-w-xs text-vault-400">
                {senderName ? `${dateFormatted} at ${timeFormatted}` : (item.caption || 'Photo')}
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
          {!isEphemeral && onToggleFavorite && (
            <button
              type="button"
              onClick={() => onToggleFavorite(item)}
              className={`ib ib-s rounded-full glass-panel ${item.is_favorite ? '!text-rose-400' : '!text-white'}`}
              aria-label={item.is_favorite ? 'Remove from Favorites' : 'Add to Favorites'}
            >
              <Heart className={`i ${item.is_favorite ? 'fill-current' : ''}`} aria-hidden />
            </button>
          )}
          {!isEphemeral && (
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
        onContextMenu={isEphemeral ? e => e.preventDefault() : undefined}
      >
        {/* Double-tap heart burst animation */}
        {showHeartBurst && (
          <div className="absolute inset-0 flex items-center justify-center z-30 pointer-events-none">
            <Heart className="w-24 h-24 text-rose-500 fill-rose-500 drop-shadow-2xl anim-spring-pop" aria-hidden />
          </div>
        )}

        <div
          style={{
            transform: `translate(${position.x}px, ${position.y + dragY}px) scale(${scale * dragScale})`,
            transition: isDraggingDown || isPanning ? 'none' : 'transform 240ms cubic-bezier(0.16, 1, 0.3, 1)',
            userSelect: isEphemeral ? 'none' : undefined,
            WebkitUserSelect: isEphemeral ? 'none' : undefined,
          }}
          className="relative w-full h-full max-h-[75vh] sm:max-h-[80vh] flex items-center justify-center will-change-transform"
        >
          <MediaImage
            state={state}
            alt={item.caption || 'Photo'}
            imgClassName="max-w-full max-h-full object-contain rounded-xl shadow-2xl"
            onRetry={onRetry}
            loading="eager"
          />
        </div>
      </main>

      {/* Bottom Actions Bar (Instagram Style) */}
      {!isEphemeral ? (
        <div className="relative z-20 max-w-md w-full mx-auto">
          {/* Quick-Emoji Picker Sheet */}
          {showEmojiPicker && onReact && (
            <div className="absolute bottom-full mb-3 inset-x-4 p-2 bg-vault-900/95 backdrop-blur-md border border-vault-750 rounded-2xl flex justify-around shadow-2xl anim-sheet">
              {REACTION_EMOJIS.map(e => (
                <button
                  key={e}
                  type="button"
                  onClick={() => {
                    mediumImpact();
                    onReact(e);
                    setShowEmojiPicker(false);
                    if (e === '❤️') {
                      setShowHeartBurst(true);
                      setTimeout(() => setShowHeartBurst(false), 650);
                    }
                  }}
                  className={`w-11 h-11 rounded-full text-2xl flex items-center justify-center transition-transform active:scale-90 hover:scale-110 ${
                    myReaction === e ? 'bg-purple-500/25 ring-2 ring-purple-500 scale-105' : 'hover:bg-vault-800'
                  }`}
                  aria-label={`React with ${e}`}
                >
                  {e}
                </button>
              ))}
            </div>
          )}

          <footer
            className={`p-3 sm:p-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] glass-panel border-t border-white/[0.08] flex items-center justify-around w-full rounded-t-2xl transition-all duration-200 ${
              showHud ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4 pointer-events-none'
            }`}
          >
            {/* 1. Reply Button (Instagram Chat Mode) */}
            {onReply && (
              <button
                type="button"
                onClick={() => {
                  lightImpact();
                  onReply();
                }}
                className="btn btn-g flex-col gap-1 h-auto py-2 px-3 min-w-[56px] text-purple-400 hover:text-purple-300 active:scale-95 transition-transform"
                aria-label="Reply to photo"
              >
                <Reply className="i" aria-hidden />
                <span className="t-cap">Reply</span>
              </button>
            )}

            {/* 2. React / Heart Button */}
            {onReact && (
              <button
                type="button"
                onClick={handleHeartReact}
                onContextMenu={e => {
                  e.preventDefault();
                  selectionChange();
                  setShowEmojiPicker(prev => !prev);
                }}
                className={`btn btn-g flex-col gap-1 h-auto py-2 px-3 min-w-[56px] ${
                  myReaction ? 'text-rose-400' : 'text-vault-100 hover:text-white'
                } active:scale-90 transition-transform`}
                aria-label={myReaction ? `Reacted ${myReaction}` : 'React with Heart'}
                title="Tap to Heart, long-press for more emojis"
              >
                {myReaction && myReaction !== '❤️' ? (
                  <span className="text-xl leading-none">{myReaction}</span>
                ) : (
                  <Heart className={`i ${myReaction === '❤️' ? 'fill-current text-rose-500' : ''}`} aria-hidden />
                )}
                <span className="t-cap">{myReaction ? 'Reacted' : 'React'}</span>
              </button>
            )}

            {/* 3. Send to another chat (Gallery mode) */}
            {onSend && !onReply && (
              <button
                type="button"
                onClick={() => {
                  lightImpact();
                  onSend(item);
                }}
                className="btn btn-g flex-col gap-1 h-auto py-2 px-3 min-w-[56px] hover:text-purple-300"
                aria-label="Send photo in chat"
              >
                <Send className="i" aria-hidden />
                <span className="t-cap">Send</span>
              </button>
            )}

            {/* 4. Save / Download to device */}
            {!isEphemeral && (
              <button
                type="button"
                disabled={!downloadUrl || isSaving}
                onClick={handleSaveToDevice}
                className="btn btn-g flex-col gap-1 h-auto py-2 px-3 min-w-[56px] text-vault-50 hover:text-white active:scale-95 transition-transform"
                aria-label="Save photo to device"
              >
                <Download className="i" aria-hidden />
                <span className="t-cap">{isSaving ? 'Saving…' : 'Save'}</span>
              </button>
            )}

            {/* 5. More Emojis button if in chat */}
            {onReact && (
              <button
                type="button"
                onClick={() => {
                  selectionChange();
                  setShowEmojiPicker(prev => !prev);
                }}
                className={`btn btn-g flex-col gap-1 h-auto py-2 px-3 min-w-[56px] ${
                  showEmojiPicker ? 'text-purple-400' : 'text-vault-300 hover:text-white'
                }`}
                aria-label="Pick reaction emoji"
              >
                <Smile className="i" aria-hidden />
                <span className="t-cap">Emoji</span>
              </button>
            )}

            {/* 5.5 Save to Shared Vault */}
            {onSaveToSharedVault && (
              <button
                type="button"
                onClick={() => {
                  mediumImpact();
                  onSaveToSharedVault(item);
                }}
                className="btn btn-g flex-col gap-1 h-auto py-2 px-3 min-w-[56px] text-vault-300 hover:text-emerald"
                aria-label="Save to Shared Vault"
              >
                <FolderHeart className="i" aria-hidden />
                <span className="t-cap">Vault</span>
              </button>
            )}

            {/* 6. Details */}
            <button
              type="button"
              onClick={() => {
                selectionChange();
                setShowMetadata(true);
              }}
              className="btn btn-g flex-col gap-1 h-auto py-2 px-3 min-w-[56px] text-vault-300 hover:text-white"
              aria-label="View photo details"
            >
              <Info className="i" aria-hidden />
              <span className="t-cap">Info</span>
            </button>

            {/* 7. Restore button (if in Trash) */}
            {onRestore && (
              <button
                type="button"
                onClick={() => {
                  lightImpact();
                  onRestore(item);
                  onClose();
                }}
                className="btn btn-g flex-col gap-1 h-auto py-2 px-3 min-w-[56px] !text-emerald hover:!text-emerald"
                aria-label="Restore photo"
              >
                <Undo2 className="i" aria-hidden />
                <span className="t-cap">Restore</span>
              </button>
            )}

            {/* 8. Delete button */}
            {(onDelete && (isMyMessage || onRestore)) && (
              <button
                type="button"
                onClick={() => {
                  mediumImpact();
                  onDelete(item);
                }}
                className="btn btn-g flex-col gap-1 h-auto py-2 px-3 min-w-[56px] !text-[#FF8A93] hover:!text-red-300"
                aria-label={onRestore ? 'Delete forever' : 'Delete photo'}
              >
                <Trash className="i" aria-hidden />
                <span className="t-cap">{onRestore ? 'Delete Forever' : 'Delete'}</span>
              </button>
            )}
          </footer>
        </div>
      ) : (
        <footer
          className={`p-3 pb-[max(1.5rem,env(safe-area-inset-bottom))] flex items-center justify-center z-20 transition-all duration-200 ${
            showHud ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4 pointer-events-none'
          }`}
        >
          <div className="glass-pill px-4 py-1.5 rounded-full text-xs font-semibold text-vault-300 tracking-wide shadow-lg flex items-center gap-2">
            <Shield className="w-3.5 h-3.5 text-emerald" />
            <span>{viewMode === 'allow_replay' ? 'View Twice · Screenshots Blocked' : 'View Once · Screenshots Blocked'}</span>
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
                <ImageIcon className="w-4 h-4 text-purple-400" /> Photo Info
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
              {senderName && (
                <div className="flex items-center justify-between text-vault-300">
                  <span>Sent By</span>
                  <span className="font-semibold text-white">{senderName}</span>
                </div>
              )}

              <div className="flex items-center justify-between text-vault-300">
                <span className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-vault-400" /> Timestamp
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
                  <HardDrive className="w-4 h-4 text-vault-400" /> Security
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


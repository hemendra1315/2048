import React, { useState, useRef } from 'react';
import { useChatMediaUrl } from '../../lib/mediaUrls';
import { lightImpact } from '../../lib/haptics';
import { X, Download, ZoomIn, ZoomOut, Eye, EyeOff, Play, Pause, CheckCheck, Loader2 } from 'lucide-react';

interface ChatImageProps extends Omit<React.ImgHTMLAttributes<HTMLImageElement>, 'src'> {
  /** The URL stored in the message ([IMAGE]<url>). */
  url: string;
  fallback?: React.ReactNode;
  allowFullscreen?: boolean;
  isSpoiler?: boolean;
}

/** A chat photo loaded through a short-lived signed link with shimmer skeleton, Telegram-style spoiler blur & full-screen zoom support. */
export const ChatImage: React.FC<ChatImageProps> = ({
  url,
  fallback,
  onError,
  allowFullscreen = false,
  isSpoiler = false,
  className,
  ...rest
}) => {
  const { src, failed, retry } = useChatMediaUrl(url);
  const [loaded, setLoaded] = useState(false);
  const [fullscreenOpen, setFullscreenOpen] = useState(false);
  const [revealed, setRevealed] = useState(!isSpoiler);
  const retried = useRef(false);

  if (failed) return <>{fallback ?? null}</>;

  const handleReveal = (e: React.MouseEvent) => {
    e.stopPropagation();
    lightImpact();
    setRevealed(true);
  };

  return (
    <>
      <div className="relative w-full h-full overflow-hidden bg-vault-900 group/image">
        {!loaded && (
          <div
            className="absolute inset-0 shimmer-skeleton rounded-[inherit]"
            aria-label="Loading photo"
          />
        )}
        {src && (
          <img
            {...rest}
            src={src}
            onLoad={e => {
              setLoaded(true);
              rest.onLoad?.(e);
            }}
            onError={e => {
              if (!retried.current) {
                retried.current = true;
                retry();
              } else {
                onError?.(e);
              }
            }}
            style={{
              filter: !revealed ? 'blur(28px) brightness(0.65)' : 'blur(0px) brightness(1)',
              transform: !revealed ? 'scale(1.15)' : 'scale(1)',
            }}
            className={`${className ?? ''} transition-all duration-300 ${
              loaded ? 'opacity-100' : 'opacity-0'
            }`}
          />
        )}

        {/* Telegram-style Spoiler Shimmering Particle Overlay */}
        {loaded && !revealed && (
          <div
            onClick={handleReveal}
            className="absolute inset-0 spoiler-overlay flex flex-col items-center justify-center p-3 cursor-pointer z-10 select-none animate-fade-in"
          >
            <div className="glass-pill px-3 py-1.5 rounded-full flex items-center gap-1.5 text-xs font-semibold text-white shadow-lg active:scale-95 transition-transform">
              <Eye className="w-3.5 h-3.5 text-emerald" />
              <span>Tap to reveal</span>
            </div>
          </div>
        )}
      </div>

      {allowFullscreen && fullscreenOpen && src && revealed && (
        <ImageZoomModal src={src} onClose={() => setFullscreenOpen(false)} />
      )}
    </>
  );
};

/** Fullscreen Zoom Viewer for Chat Media */
export const ImageZoomModal: React.FC<{ src: string; onClose: () => void }> = ({ src, onClose }) => {
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const posStartRef = useRef({ x: 0, y: 0 });
  const lastTapRef = useRef(0);

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
    if (e.touches.length === 1) {
      const now = Date.now();
      const touch = e.touches[0];
      if (now - lastTapRef.current < 300) {
        handleDoubleTap(touch.clientX, touch.clientY);
        lastTapRef.current = 0;
        return;
      }
      lastTapRef.current = now;

      if (scale > 1) {
        setIsDragging(true);
        dragStartRef.current = { x: touch.clientX, y: touch.clientY };
        posStartRef.current = { ...position };
      }
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (isDragging && scale > 1 && e.touches.length === 1) {
      const touch = e.touches[0];
      const dx = touch.clientX - dragStartRef.current.x;
      const dy = touch.clientY - dragStartRef.current.y;
      setPosition({
        x: posStartRef.current.x + dx,
        y: posStartRef.current.y + dy,
      });
    }
  };

  const handleTouchEnd = () => {
    setIsDragging(false);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[100] bg-black/95 flex flex-col justify-between anim-fade select-none touch-none"
      onClick={onClose}
    >
      <div className="p-4 flex items-center justify-between z-10" onClick={e => e.stopPropagation()}>
        <button
          type="button"
          onClick={onClose}
          className="ib ib-s rounded-full bg-vault-900/80 text-white backdrop-blur-md"
          aria-label="Close"
        >
          <X className="i" />
        </button>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => {
              lightImpact();
              setScale(s => (s > 1 ? 1 : 2.5));
              setPosition({ x: 0, y: 0 });
            }}
            className="ib ib-s rounded-full bg-vault-900/80 text-white backdrop-blur-md"
            aria-label="Toggle zoom"
          >
            {scale > 1 ? <ZoomOut className="i" /> : <ZoomIn className="i" />}
          </button>
          <a
            href={src}
            download="chat-photo.jpg"
            target="_blank"
            rel="noreferrer"
            className="ib ib-s rounded-full bg-vault-900/80 text-white backdrop-blur-md"
            aria-label="Download"
          >
            <Download className="i" />
          </a>
        </div>
      </div>

      <div
        className="flex-1 flex items-center justify-center p-2 overflow-hidden"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onClick={e => e.stopPropagation()}
      >
        <img
          src={src}
          alt="Shared media"
          style={{
            transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`,
            transition: isDragging ? 'none' : 'transform 200ms cubic-bezier(0.16, 1, 0.3, 1)',
          }}
          className="max-w-full max-h-[80vh] object-contain rounded-xl will-change-transform"
          draggable={false}
        />
      </div>

      <div className="p-4 text-center text-xs text-vault-400 font-medium">
        {scale > 1 ? 'Drag to pan · Double-tap to reset' : 'Double-tap or pinch to zoom'}
      </div>
    </div>
  );
};

/** A voice note with the browser's audio controls, loaded through a signed link. */
export const ChatAudio: React.FC<{ url: string; className?: string }> = ({ url, className }) => {
  const { src, failed } = useChatMediaUrl(url);
  if (failed) return <span className="text-xs text-vault-500">Voice note unavailable</span>;
  return <audio controls preload="none" src={src} className={className} />;
};

export interface ViewOnceImageBubbleProps {
  isMe: boolean;
  isOpened: boolean;
  onOpen?: () => void;
  isLoading?: boolean;
}

export const ViewOnceImageBubble: React.FC<ViewOnceImageBubbleProps> = ({
  isMe,
  isOpened,
  onOpen,
  isLoading = false,
}) => {
  if (isOpened) {
    return (
      <div className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-2xl bg-vault-900/60 border border-white/5 text-vault-400 select-none min-w-[160px]">
        <div className="w-8 h-8 rounded-full bg-vault-800/80 flex items-center justify-center text-vault-500">
          <EyeOff className="w-4 h-4" />
        </div>
        <div className="flex flex-col">
          <span className="text-xs font-semibold text-vault-300">Photo</span>
          <span className="text-[11px] text-vault-500 font-medium flex items-center gap-1">
            <CheckCheck className="w-3 h-3 text-vault-500" /> Opened
          </span>
        </div>
      </div>
    );
  }

  if (isMe) {
    return (
      <div className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-2xl bg-black/40 border border-emerald/20 text-white select-none min-w-[170px]">
        <div className="w-8 h-8 rounded-full bg-emerald/20 border border-emerald/30 flex items-center justify-center text-emerald">
          <EyeOff className="w-4 h-4" />
        </div>
        <div className="flex flex-col">
          <span className="text-xs font-semibold text-emerald">1 View once photo</span>
          <span className="text-[11px] opacity-75 font-medium">Sent</span>
        </div>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onOpen}
      disabled={isLoading}
      className="group flex items-center gap-3 px-3.5 py-2.5 rounded-2xl bg-vault-900/90 hover:bg-vault-850 border border-emerald/30 shadow-lg text-left transition-all active:scale-95 cursor-pointer select-none min-w-[180px]"
      aria-label="Open view once photo"
    >
      <div className="w-9 h-9 rounded-full bg-emerald/20 border border-emerald/50 flex items-center justify-center text-emerald group-hover:scale-105 transition-transform shadow-inner">
        {isLoading ? <Loader2 className="w-4 h-4 animate-spin text-emerald" /> : <EyeOff className="w-4 h-4" />}
      </div>
      <div className="flex flex-col">
        <span className="text-xs font-bold text-white flex items-center gap-1">
          1 View once photo
        </span>
        <span className="text-[11px] text-emerald font-medium">
          {isLoading ? 'Opening securely…' : 'Tap to view'}
        </span>
      </div>
    </button>
  );
};

export interface ViewOnceAudioBubbleProps {
  isMe: boolean;
  isOpened: boolean;
  duration: string;
  levels: number[] | null;
  isPlaying: boolean;
  onTogglePlay?: () => void;
  isLoading?: boolean;
  playProgress?: number;
}

export const ViewOnceAudioBubble: React.FC<ViewOnceAudioBubbleProps> = ({
  isMe,
  isOpened,
  duration,
  levels,
  isPlaying,
  onTogglePlay,
  isLoading = false,
  playProgress = 0,
}) => {
  if (isOpened) {
    return (
      <div className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-2xl bg-vault-900/60 border border-white/5 text-vault-400 select-none min-w-[190px]">
        <div className="w-8 h-8 rounded-full bg-vault-800/80 flex items-center justify-center text-vault-500">
          <EyeOff className="w-4 h-4" />
        </div>
        <div className="flex flex-col">
          <span className="text-xs font-semibold text-vault-300">Voice message</span>
          <span className="text-[11px] text-vault-500 font-medium flex items-center gap-1">
            <CheckCheck className="w-3 h-3 text-vault-500" /> Played
          </span>
        </div>
      </div>
    );
  }

  if (isMe) {
    return (
      <div className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-2xl bg-black/40 border border-emerald/20 text-white select-none min-w-[200px]">
        <div className="w-8 h-8 rounded-full bg-emerald/20 border border-emerald/30 flex items-center justify-center text-emerald">
          <EyeOff className="w-4 h-4" />
        </div>
        <div className="flex flex-col">
          <span className="text-xs font-semibold text-emerald">1 View once voice note</span>
          <span className="text-[11px] opacity-75 font-medium">{duration} · Sent</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 px-3 py-2 rounded-2xl bg-vault-900/90 border border-emerald/30 shadow-lg min-w-[220px]">
      <button
        type="button"
        onClick={onTogglePlay}
        disabled={isLoading}
        className="w-10 h-10 shrink-0 rounded-full bg-emerald text-vault-950 flex items-center justify-center shadow-md active:scale-95 transition-transform cursor-pointer"
        aria-label={isPlaying ? 'Pause voice message' : 'Play view once voice message'}
      >
        {isLoading ? (
          <Loader2 className="w-4 h-4 animate-spin text-vault-950" />
        ) : isPlaying ? (
          <Pause className="w-4 h-4 fill-current" />
        ) : (
          <Play className="w-4 h-4 fill-current ml-0.5" />
        )}
      </button>

      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex items-center gap-[2.5px] h-6 py-0.5" aria-hidden>
          {(levels ?? Array.from({ length: 20 }, (_, i) => 0.25 + 0.2 * Math.abs(Math.sin(i * 1.7)))).map((level, i, all) => {
            const played = isPlaying && i / all.length < playProgress;
            return (
              <span
                key={i}
                className={`flex-1 rounded-full transition-all ${
                  played ? 'bg-emerald opacity-100 scale-y-105' : 'bg-emerald/35'
                }`}
                style={{ height: `${Math.max(20, Math.round(level * 100))}%` }}
              />
            );
          })}
        </div>
        <div className="flex items-center justify-between text-[11px] font-mono text-vault-400">
          <span className="text-emerald font-semibold flex items-center gap-1">
            <EyeOff className="w-3 h-3 inline" /> 1 Play
          </span>
          <span>{duration}</span>
        </div>
      </div>
    </div>
  );
};


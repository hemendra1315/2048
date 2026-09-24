import React, { useCallback, useEffect, useRef, useState } from 'react';
import { X, Check, ZoomIn, ZoomOut } from 'lucide-react';

interface AvatarCropperProps {
  /** Object URL or data URL of the chosen photo. */
  src: string;
  onCancel: () => void;
  onConfirm: (cropped: Blob) => void;
  busy?: boolean;
}

const OUTPUT_SIZE = 512;
const MIN_ZOOM = 1;
const MAX_ZOOM = 4;

interface Offset {
  x: number;
  y: number;
}

interface NaturalSize {
  w: number;
  h: number;
}

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/**
 * Circular avatar cropper: drag to position, pinch / wheel / slider / buttons to zoom.
 * The photo always covers the circle (no empty edges). Output is a 512×512 JPEG of the
 * square that bounds the circle; avatars are displayed round everywhere.
 */
export const AvatarCropper: React.FC<AvatarCropperProps> = ({ src, onCancel, onConfirm, busy = false }) => {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinchStart = useRef<{ distance: number; zoom: number } | null>(null);

  const [natural, setNatural] = useState<NaturalSize | null>(null);
  const [viewport, setViewport] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState<Offset>({ x: 0, y: 0 });
  const [loadError, setLoadError] = useState(false);

  // Track the rendered size of the square viewport (it follows the screen width).
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const update = () => setViewport(el.clientWidth);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const baseScale = natural && viewport ? Math.max(viewport / natural.w, viewport / natural.h) : 1;

  const clampOffset = useCallback(
    (next: Offset, z: number): Offset => {
      if (!natural || !viewport) return { x: 0, y: 0 };
      const scale = baseScale * z;
      const maxX = Math.max(0, (natural.w * scale - viewport) / 2);
      const maxY = Math.max(0, (natural.h * scale - viewport) / 2);
      return { x: clamp(next.x, -maxX, maxX), y: clamp(next.y, -maxY, maxY) };
    },
    [natural, viewport, baseScale],
  );

  const zoomRef = useRef(1);

  const applyZoom = useCallback(
    (nextZoom: number) => {
      const prevZoom = zoomRef.current;
      const z = clamp(nextZoom, MIN_ZOOM, MAX_ZOOM);
      if (z === prevZoom) return;
      zoomRef.current = z;
      setZoom(z);
      // Zoom around the centre of the circle: scale the offset with the zoom.
      setOffset(prev => clampOffset({ x: (prev.x * z) / prevZoom, y: (prev.y * z) / prevZoom }, z));
    },
    [clampOffset],
  );

  // Keep the photo covering the circle when the viewport is resized.
  useEffect(() => {
    setOffset(prev => clampOffset(prev, zoom));
  }, [clampOffset, zoom]);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinchStart.current = { distance: Math.hypot(a.x - b.x, a.y - b.y), zoom };
    }
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const prev = pointers.current.get(e.pointerId);
    if (!prev) return;
    const current = { x: e.clientX, y: e.clientY };
    pointers.current.set(e.pointerId, current);

    if (pointers.current.size >= 2 && pinchStart.current) {
      const [a, b] = [...pointers.current.values()];
      const distance = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinchStart.current.distance > 0) applyZoom((pinchStart.current.zoom * distance) / pinchStart.current.distance);
      return;
    }

    const dx = current.x - prev.x;
    const dy = current.y - prev.y;
    setOffset(o => clampOffset({ x: o.x + dx, y: o.y + dy }, zoom));
  };

  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinchStart.current = null;
  };

  const onWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    applyZoom(zoom * (e.deltaY < 0 ? 1.08 : 1 / 1.08));
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? 20 : 6;
    const moves: Record<string, Offset> = {
      ArrowLeft: { x: step, y: 0 },
      ArrowRight: { x: -step, y: 0 },
      ArrowUp: { x: 0, y: step },
      ArrowDown: { x: 0, y: -step },
    };
    const move = moves[e.key];
    if (move) {
      e.preventDefault();
      setOffset(o => clampOffset({ x: o.x + move.x, y: o.y + move.y }, zoom));
    } else if (e.key === '+' || e.key === '=') {
      e.preventDefault();
      applyZoom(zoom + 0.2);
    } else if (e.key === '-') {
      e.preventDefault();
      applyZoom(zoom - 0.2);
    }
  };

  const handleConfirm = () => {
    const img = imageRef.current;
    if (!img || !natural || !viewport) return;
    const scale = baseScale * zoom;
    const srcSize = viewport / scale;
    const srcX = natural.w / 2 - offset.x / scale - srcSize / 2;
    const srcY = natural.h / 2 - offset.y / scale - srcSize / 2;

    const canvas = document.createElement('canvas');
    canvas.width = OUTPUT_SIZE;
    canvas.height = OUTPUT_SIZE;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, srcX, srcY, srcSize, srcSize, 0, 0, OUTPUT_SIZE, OUTPUT_SIZE);
    canvas.toBlob(blob => {
      if (blob) onConfirm(blob);
    }, 'image/jpeg', 0.9);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, onCancel]);

  const scale = baseScale * zoom;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="avatar-cropper-title"
      className="fixed inset-0 z-[60] bg-black flex flex-col select-none"
    >
      <header className="flex items-center justify-between px-4 py-3 border-b border-vault-800 shrink-0">
        <button type="button" onClick={onCancel} disabled={busy} className="ib ib-s rounded-full" aria-label="Cancel">
          <X className="i" aria-hidden />
        </button>
        <h2 id="avatar-cropper-title" className="t-h3 m-0 text-white">Move and scale</h2>
        <button
          type="button"
          onClick={handleConfirm}
          disabled={busy || !natural || loadError}
          className="btn btn-p btn-sm"
        >
          <Check className="i i-sm" aria-hidden />
          <span>{busy ? 'Saving…' : 'Done'}</span>
        </button>
      </header>

      <div className="flex-1 min-h-0 flex items-center justify-center p-4">
        <div
          ref={viewportRef}
          tabIndex={0}
          role="application"
          aria-label="Photo crop area. Drag or use arrow keys to move, plus and minus to zoom."
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onWheel={onWheel}
          onKeyDown={onKeyDown}
          className="relative w-[min(88vw,420px)] aspect-square overflow-hidden touch-none cursor-grab active:cursor-grabbing focus-visible:fr rounded-lg"
        >
          {!loadError && (
            <img
              ref={imageRef}
              src={src}
              alt="Photo to crop"
              draggable={false}
              onLoad={e => setNatural({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
              onError={() => setLoadError(true)}
              className="absolute left-1/2 top-1/2 max-w-none pointer-events-none will-change-transform"
              style={
                natural
                  ? {
                      width: natural.w,
                      height: natural.h,
                      transform: `translate(-50%, -50%) translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
                    }
                  : { opacity: 0 }
              }
            />
          )}
          {/* Circular mask: everything outside the circle is dimmed. */}
          <div
            aria-hidden="true"
            className="absolute inset-0 rounded-full pointer-events-none"
            style={{ boxShadow: '0 0 0 9999px rgba(0,0,0,0.62)', border: '2px solid rgba(255,255,255,0.85)' }}
          />
          {loadError && (
            <p className="absolute inset-0 flex items-center justify-center text-center t-sm c2 p-6 m-0" role="alert">
              This photo couldn't be opened. Choose another one.
            </p>
          )}
        </div>
      </div>

      <footer className="shrink-0 px-6 pb-[max(20px,env(safe-area-inset-bottom))] pt-2 flex items-center gap-3 max-w-md w-full mx-auto">
        <button type="button" onClick={() => applyZoom(zoom - 0.25)} className="ib ib-s rounded-full" aria-label="Zoom out" disabled={zoom <= MIN_ZOOM}>
          <ZoomOut className="i" aria-hidden />
        </button>
        <input
          type="range"
          min={MIN_ZOOM}
          max={MAX_ZOOM}
          step={0.01}
          value={zoom}
          onChange={e => applyZoom(Number(e.target.value))}
          aria-label="Zoom"
          className="flex-1 accent-[#10B981] h-11"
        />
        <button type="button" onClick={() => applyZoom(zoom + 0.25)} className="ib ib-s rounded-full" aria-label="Zoom in" disabled={zoom >= MAX_ZOOM}>
          <ZoomIn className="i" aria-hidden />
        </button>
      </footer>
    </div>
  );
};

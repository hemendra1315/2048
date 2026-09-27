import React, { useState, useRef, useCallback } from 'react';
import { Play, Pause } from 'lucide-react';
import { WAVEFORM_BARS } from '../../lib/chatExtras';
import { selectionChange, lightImpact } from '../../lib/haptics';

export interface VoiceMessagePlayerProps {
  url: string;
  duration: string;
  levels?: number[] | null;
  isMe?: boolean;
  isPlaying: boolean;
  playProgress: number;
  audioSpeed: number;
  onTogglePlay: () => void;
  onScrub: (progress: number) => void;
  onCycleSpeed: () => void;
}

export const VoiceMessagePlayer: React.FC<VoiceMessagePlayerProps> = ({
  duration,
  levels,
  isMe = false,
  isPlaying,
  playProgress,
  audioSpeed,
  onTogglePlay,
  onScrub,
  onCycleSpeed,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [hoverProgress, setHoverProgress] = useState<number | null>(null);
  const waveformRef = useRef<HTMLDivElement>(null);

  // Parse total duration into seconds for live elapsed calculation
  const totalSeconds = (() => {
    const parts = duration.split(':').map(p => parseInt(p, 10));
    if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
      return parts[0] * 60 + parts[1];
    }
    return 0;
  })();

  const currentSeconds = Math.floor((hoverProgress ?? playProgress) * totalSeconds);
  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = (secs % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  const getProgressFromEvent = useCallback((clientX: number): number => {
    if (!waveformRef.current) return 0;
    const rect = waveformRef.current.getBoundingClientRect();
    const x = clientX - rect.left;
    return Math.max(0, Math.min(1, x / rect.width));
  }, []);

  const handlePointerDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    setIsDragging(true);
    const p = getProgressFromEvent(e.clientX);
    setHoverProgress(p);
    onScrub(p);
    void selectionChange();
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging) return;
    const p = getProgressFromEvent(e.clientX);
    setHoverProgress(p);
    onScrub(p);
    void selectionChange();
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (isDragging) {
      const p = getProgressFromEvent(e.clientX);
      onScrub(p);
      setIsDragging(false);
      setHoverProgress(null);
    }
  };

  const barLevels = levels && levels.length > 0
    ? levels
    : Array.from({ length: WAVEFORM_BARS }, (_, i) => 0.25 + 0.2 * Math.abs(Math.sin(i * 1.7)));

  return (
    <div className="flex items-center gap-3 min-w-[220px] max-w-full py-1 select-none">
      {/* Play / Pause Action Button */}
      <button
        type="button"
        onClick={e => {
          e.stopPropagation();
          lightImpact();
          onTogglePlay();
        }}
        className={`w-11 h-11 shrink-0 rounded-full flex items-center justify-center ${
          isMe
            ? 'bg-black/70 text-white border border-white/15 hover:bg-black/80'
            : 'bg-[#10B981] text-[#04120C] hover:bg-[#059669]'
        } active:scale-95 transition-all shadow-md cursor-pointer`}
        aria-label={isPlaying ? 'Pause voice message' : 'Play voice message'}
      >
        {isPlaying ? (
          <Pause className="w-5 h-5 fill-current" />
        ) : (
          <Play className="w-5 h-5 fill-current ml-0.5" />
        )}
      </button>

      {/* Waveform & Timing Container */}
      <div className="flex-1 min-w-0 space-y-1.5">
        {/* Interactive Scrubbing Waveform */}
        <div
          ref={waveformRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          className="flex items-center gap-[2.5px] h-8 cursor-pointer py-1 touch-none group/waveform"
          aria-label="Audio waveform scrubber"
        >
          {barLevels.map((level, i, all) => {
            const effectiveProgress = hoverProgress ?? playProgress;
            const barProgress = i / all.length;
            const played = effectiveProgress > 0 && barProgress <= effectiveProgress;

            return (
              <span
                key={i}
                className={`flex-1 rounded-full transition-all duration-75 ${
                  isMe
                    ? played ? 'bg-white opacity-100 scale-y-110 shadow-sm' : 'bg-white/40 opacity-50 group-hover/waveform:opacity-70'
                    : played ? 'bg-[#10B981] opacity-100 scale-y-110 shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 'bg-[#10B981]/35 group-hover/waveform:bg-[#10B981]/50'
                }`}
                style={{
                  height: `${Math.max(18, Math.round(level * 100))}%`,
                }}
              />
            );
          })}
        </div>

        {/* Duration & Speed Controls */}
        <div className="flex items-center justify-between text-[11px] font-mono leading-none">
          <span className={isMe ? 'opacity-80' : 'text-vault-400'}>
            {isPlaying || hoverProgress !== null
              ? `${formatTime(currentSeconds)} / ${duration}`
              : duration}
          </span>

          <button
            type="button"
            onClick={e => {
              e.stopPropagation();
              onCycleSpeed();
            }}
            className={`px-1.5 py-0.5 rounded text-[10px] font-bold border transition-all cursor-pointer ${
              isMe
                ? 'bg-white/15 text-white border-white/20 hover:bg-white/25'
                : 'bg-emerald/15 text-emerald border-emerald/30 hover:bg-emerald/25'
            } active:scale-95`}
            aria-label="Toggle playback speed"
            title="Toggle playback speed (1x, 1.5x, 2x)"
          >
            {audioSpeed}x
          </button>
        </div>
      </div>
    </div>
  );
};

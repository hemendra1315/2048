import React, { useState, useEffect, useRef } from 'react';
import { Gamepad2 } from 'lucide-react';
import { useVault } from '../../context/VaultContext';
import { heavyImpact } from '../../lib/haptics';

const STORAGE_KEY = 'vault_floating_game_button_pos';
const BUTTON_SIZE = 48; // 48px diameter
const PADDING = 12;

/**
 * Clamps a coordinate into [PADDING, viewportSize - BUTTON_SIZE - PADDING]. On a viewport
 * narrower than the button plus both paddings, that upper bound would be less than PADDING --
 * Math.min(Math.max(PADDING, x), upperBound) would then return the (smaller) negative upper
 * bound instead of PADDING, pushing the button off-screen. Clamping the bound itself to be
 * at least PADDING keeps the button on-screen no matter how small the viewport is.
 */
function clampAxis(value: number, viewportSize: number): number {
  const upperBound = Math.max(PADDING, viewportSize - BUTTON_SIZE - PADDING);
  return Math.min(Math.max(PADDING, value), upperBound);
}

interface Position {
  x: number;
  y: number;
}

export const FloatingPanicCircle: React.FC = () => {
  const { panicLock } = useVault();
  const [position, setPosition] = useState<Position>(() => {
    if (typeof window === 'undefined') return { x: 20, y: 100 };
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (typeof parsed.x === 'number' && typeof parsed.y === 'number') {
          return {
            x: clampAxis(parsed.x, window.innerWidth),
            y: clampAxis(parsed.y, window.innerHeight),
          };
        }
      }
    } catch {
      // Ignore parse errors
    }
    // Default position: bottom-right area, comfortably above navigation/fab
    return {
      x: Math.max(PADDING, window.innerWidth - BUTTON_SIZE - 20),
      y: Math.max(PADDING, window.innerHeight - BUTTON_SIZE - 120),
    };
  });

  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef<{
    startX: number;
    startY: number;
    initialPosX: number;
    initialPosY: number;
    hasMoved: boolean;
  }>({
    startX: 0,
    startY: 0,
    initialPosX: 0,
    initialPosY: 0,
    hasMoved: false,
  });

  // Clamp on window resize
  useEffect(() => {
    const handleResize = () => {
      setPosition(prev => ({
        x: clampAxis(prev.x, window.innerWidth),
        y: clampAxis(prev.y, window.innerHeight),
      }));
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const handlePointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);

    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      initialPosX: position.x,
      initialPosY: position.y,
      hasMoved: false,
    };
    setIsDragging(true);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!isDragging) return;
    e.preventDefault();

    const deltaX = e.clientX - dragRef.current.startX;
    const deltaY = e.clientY - dragRef.current.startY;
    const distance = Math.hypot(deltaX, deltaY);

    if (distance > 6) {
      dragRef.current.hasMoved = true;
    }

    if (dragRef.current.hasMoved) {
      const newX = clampAxis(dragRef.current.initialPosX + deltaX, window.innerWidth);
      const newY = clampAxis(dragRef.current.initialPosY + deltaY, window.innerHeight);
      setPosition({ x: newX, y: newY });
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!isDragging) return;
    try {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      // Ignore
    }
    setIsDragging(false);

    // If user didn't drag, treat as a tap/press to go to the 2048 game
    if (!dragRef.current.hasMoved) {
      void heavyImpact();
      panicLock();
    } else {
      // Save updated position
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(position));
      } catch {
        // Ignore storage errors
      }
    }
  };

  const handlePointerCancel = () => {
    setIsDragging(false);
  };

  return (
    <button
      type="button"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      style={{
        transform: `translate3d(${position.x}px, ${position.y}px, 0)`,
        touchAction: 'none',
      }}
      className={`fixed top-0 left-0 z-[99999] w-12 h-12 rounded-full flex items-center justify-center select-none shadow-[0_4px_24px_rgba(0,0,0,0.85),0_0_16px_rgba(16,185,129,0.3)] border border-emerald-500/40 bg-[#0c0f0d]/90 backdrop-blur-md cursor-grab active:cursor-grabbing transition-shadow ${
        isDragging ? 'scale-105 shadow-[0_6px_30px_rgba(0,0,0,0.9),0_0_24px_rgba(16,185,129,0.5)] border-emerald-400' : 'hover:border-emerald-400/70'
      }`}
      aria-label="Return to 2048 game"
      title="Return to 2048 game (drag to move)"
    >
      <div className="relative flex items-center justify-center w-full h-full pointer-events-none">
        {/* Subtle glowing center pulse */}
        <span className="absolute w-7 h-7 rounded-full bg-emerald-500/15 animate-pulse" />
        <Gamepad2 className="w-5 h-5 text-emerald-400 drop-shadow-[0_0_8px_rgba(16,185,129,0.6)]" />
      </div>
    </button>
  );
};

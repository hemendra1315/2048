import React, { useEffect, useRef, useState } from 'react';
import { X, Volume2, Vibrate, RotateCcw } from 'lucide-react';
import { useGame, COVER_GAMES } from '../../context/GameContext';

interface GameSettingsSheetProps {
  isOpen: boolean;
  onClose: () => void;
}

/** Game-only settings for the cover screen (sound, vibration, best score). */
export const GameSettingsSheet: React.FC<GameSettingsSheetProps> = ({ isOpen, onClose }) => {
  const { currentGame, soundEnabled, toggleSound, hapticsEnabled, toggleHaptics, resetGame } = useGame();
  const [confirmReset, setConfirmReset] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    setConfirmReset(false);
    const previous = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      previous?.focus?.();
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const gameName = COVER_GAMES.find(g => g.id === currentGame)?.name ?? 'this game';

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} aria-hidden="true" />
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="game-settings-title"
        className="sheet anim-sheet absolute left-0 right-0 bottom-0 mx-auto max-w-md px-4 pt-2.5 pb-[max(1.75rem,env(safe-area-inset-bottom))] flex flex-col gap-4"
      >
        <div className="w-9 h-1 rounded-full bg-vault-700 self-center" aria-hidden="true" />
        <div className="flex items-center justify-between">
          <h2 id="game-settings-title" className="t-h2 m-0">Settings</h2>
          <button ref={closeRef} type="button" className="ib" aria-label="Close settings" onClick={onClose}>
            <X className="i" aria-hidden />
          </button>
        </div>

        <div className="card overflow-hidden">
          <button type="button" role="switch" aria-checked={soundEnabled} onClick={toggleSound} className="set-row w-full text-left">
            <Volume2 className="i c2" aria-hidden />
            <span className="t-body flex-1">Sound effects</span>
            <span className={soundEnabled ? 'switch switch-on' : 'switch'} aria-hidden="true" />
          </button>
          <div className="divider ml-[52px]" />
          <button type="button" role="switch" aria-checked={hapticsEnabled} onClick={toggleHaptics} className="set-row w-full text-left">
            <Vibrate className="i c2" aria-hidden />
            <span className="t-body flex-1">Vibration</span>
            <span className={hapticsEnabled ? 'switch switch-on' : 'switch'} aria-hidden="true" />
          </button>
          <div className="divider ml-[52px]" />
          {confirmReset ? (
            <div className="set-row flex-wrap gap-2 py-3" role="group" aria-label="Confirm reset">
              <span className="t-sm flex-1 min-w-[160px]">Reset the best score for {gameName}?</span>
              <button type="button" className="btn btn-g btn-sm" onClick={() => setConfirmReset(false)}>Cancel</button>
              <button
                type="button"
                className="btn btn-d btn-sm"
                onClick={() => {
                  resetGame(currentGame);
                  setConfirmReset(false);
                }}
              >
                Reset
              </button>
            </div>
          ) : (
            <button type="button" onClick={() => setConfirmReset(true)} className="set-row w-full text-left text-[#FF8A93]">
              <RotateCcw className="i" aria-hidden />
              <span className="t-body flex-1">Reset best score</span>
            </button>
          )}
        </div>

        <p className="t-cap mono text-center m-0">Games 2.4.0</p>
      </section>
    </div>
  );
};

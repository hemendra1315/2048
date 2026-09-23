import React, { useState, useRef } from 'react';
import { Settings, Grid2x2, Worm, Hash, Bomb, Brain } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useVault } from '../../context/VaultContext';
import { useGame } from '../../context/GameContext';
import { CoverGameType } from '../../types';
import { Game2048 } from '../games/Game2048';
import { GameSnake } from '../games/GameSnake';
import { GameTicTacToe } from '../games/GameTicTacToe';
import { GameMinesweeper } from '../games/GameMinesweeper';
import { GameMemoryMatch } from '../games/GameMemoryMatch';
import { GameStub } from '../games/GameStub';
import { StealthUnlockModal } from './StealthUnlockModal';
import { GameSettingsSheet } from './GameSettingsSheet';

const PLAYABLE: { id: CoverGameType; label: string; Icon: LucideIcon }[] = [
  { id: 'game_2048', label: '2048', Icon: Grid2x2 },
  { id: 'snake', label: 'Snake', Icon: Worm },
  { id: 'tic_tac_toe', label: 'Tic Tac Toe', Icon: Hash },
  { id: 'minesweeper', label: 'Minesweeper', Icon: Bomb },
  { id: 'memory_match', label: 'Memory', Icon: Brain },
];

/** The cover screen: a complete, ordinary game launcher. It carries no hint of anything else. */
export const LauncherCoverView: React.FC = () => {
  const { preferences, openUnlockModal } = useVault();
  const { currentGame, setCurrentGame } = useGame();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const longPressTimer = useRef<number | null>(null);

  // Long-press on the logo opens the sign-in / unlock sheet. No visual affordance by design.
  const pressStart = () => {
    if (longPressTimer.current) window.clearTimeout(longPressTimer.current);
    longPressTimer.current = window.setTimeout(() => {
      longPressTimer.current = null;
      openUnlockModal();
    }, 850);
  };
  const pressEnd = () => {
    if (longPressTimer.current) {
      window.clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  return (
    <div className="min-h-screen bg-vault-950 text-vault-100 flex flex-col items-center">
      <div className="w-full max-w-md md:max-w-xl flex flex-col flex-1 px-4 pt-5 pb-6">
        <header className="flex items-center justify-between h-[52px]">
          <div
            onPointerDown={pressStart}
            onPointerUp={pressEnd}
            onPointerLeave={pressEnd}
            onPointerCancel={pressEnd}
            onContextMenu={e => e.preventDefault()}
            className="flex items-center gap-2.5 min-h-[44px] select-none touch-none"
          >
            <span
              aria-hidden="true"
              className="w-9 h-9 rounded-[11px] bg-[#111214] border border-vault-700 grid grid-cols-2 gap-[3px] p-1.5"
            >
              <span className="rounded-[3px] bg-gold" />
              <span className="rounded-[3px] bg-[#2D3137]" />
              <span className="rounded-[3px] bg-[#3A3224]" />
              <span className="rounded-[3px] bg-[#10B981]" />
            </span>
            <h1 className="text-[22px] font-extrabold tracking-[-0.03em] text-vault-50">
              {preferences.custom_app_name || 'Games'}
            </h1>
          </div>
          <button type="button" className="ib" aria-label="Settings" onClick={() => setSettingsOpen(true)}>
            <Settings className="i" aria-hidden />
          </button>
        </header>

        <nav aria-label="Choose a game" className="flex gap-2 mt-3.5 -mx-4 px-4 overflow-x-auto pb-1">
          {PLAYABLE.map(({ id, label, Icon }) => {
            const on = currentGame === id;
            return (
              <button
                key={id}
                type="button"
                aria-pressed={on}
                onClick={() => setCurrentGame(id)}
                className={on ? 'chip chip-on' : 'chip'}
              >
                <Icon className="i i-sm" aria-hidden />
                {label}
              </button>
            );
          })}
        </nav>

        <main className="flex-1 w-full flex flex-col items-center mt-5">
          {currentGame === 'game_2048' && <Game2048 />}
          {currentGame === 'snake' && <GameSnake />}
          {currentGame === 'tic_tac_toe' && <GameTicTacToe />}
          {currentGame === 'minesweeper' && <GameMinesweeper />}
          {currentGame === 'memory_match' && <GameMemoryMatch />}
          {!PLAYABLE.some(g => g.id === currentGame) && <GameStub gameId={currentGame} />}
        </main>
      </div>

      <GameSettingsSheet isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <StealthUnlockModal />
    </div>
  );
};

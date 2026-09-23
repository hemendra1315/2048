import React, { useState, useRef } from 'react';
import { Gamepad2, Volume2, VolumeX, Sparkles, Layers, Shield } from 'lucide-react';
import { useVault } from '../../context/VaultContext';
import { useGame } from '../../context/GameContext';
import { Game2048 } from '../games/Game2048';
import { GameSnake } from '../games/GameSnake';
import { GameTicTacToe } from '../games/GameTicTacToe';
import { GameMinesweeper } from '../games/GameMinesweeper';
import { GameMemoryMatch } from '../games/GameMemoryMatch';
import { GameStub } from '../games/GameStub';
import { GameSelectorModal } from '../games/GameSelectorModal';
import { StealthUnlockModal } from './StealthUnlockModal';

export const LauncherCoverView: React.FC = () => {
  const { preferences, openUnlockModal } = useVault();
  const { currentGame, soundEnabled, toggleSound } = useGame();
  const [selectorOpen, setSelectorOpen] = useState(false);
  const longPressTimer = useRef<number | null>(null);

  // Stealth Long Press on Title Trigger
  const handleTitlePressStart = () => {
    longPressTimer.current = window.setTimeout(() => {
      openUnlockModal();
    }, 850);
  };

  const handleTitlePressEnd = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
    }
  };

  return (
    <div className="min-h-screen bg-vault-950 text-vault-100 flex flex-col items-center justify-between p-4 pb-6 select-none">
      {/* Cover Header */}
      <header className="w-full max-w-sm flex items-center justify-between py-2 border-b border-vault-800/80 mb-3">
        {/* Secret triggerable title */}
        <div
          onMouseDown={handleTitlePressStart}
          onMouseUp={handleTitlePressEnd}
          onTouchStart={handleTitlePressStart}
          onTouchEnd={handleTitlePressEnd}
          className="flex items-center gap-2.5 cursor-pointer active:opacity-75 transition-opacity"
          title="Long press to unlock vault"
        >
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-arcade-gold to-amber-600 flex items-center justify-center text-vault-950 shadow-md shadow-amber-500/20">
            <Gamepad2 className="w-4 h-4" />
          </div>
          <div>
            <h1 className="text-base font-bold text-white tracking-tight leading-tight">
              {preferences.custom_app_name || 'Games'}
            </h1>
            <p className="text-[10px] text-vault-400 font-mono">v2.4 Cover Launcher</p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setSelectorOpen(true)}
            className="flex items-center gap-1 bg-vault-900 hover:bg-vault-800 text-xs font-semibold px-2.5 py-1.5 rounded-xl border border-vault-700 text-vault-200 transition-colors"
            title="Change Cover Game"
          >
            <Layers className="w-3.5 h-3.5 text-arcade-gold" />
            <span className="hidden sm:inline">Games</span>
          </button>

          <button
            onClick={toggleSound}
            className="p-1.5 bg-vault-900 hover:bg-vault-800 text-vault-300 rounded-xl border border-vault-700 transition-colors"
            title="Toggle Sound"
          >
            {soundEnabled ? <Volume2 className="w-4 h-4 text-emerald-400" /> : <VolumeX className="w-4 h-4 text-vault-500" />}
          </button>

          {/* Discreet Unlock Trigger Button for quick access */}
          <button
            onClick={openUnlockModal}
            className="p-1.5 bg-vault-900 hover:bg-vault-800 text-vault-400 hover:text-arcade-gold rounded-xl border border-vault-700 transition-colors"
            title="Access Security Gate"
          >
            <Shield className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Main Playable Cover Game Area */}
      <main className="flex-1 w-full max-w-sm flex flex-col justify-center items-center my-auto">
        {currentGame === 'game_2048' && <Game2048 />}
        {currentGame === 'snake' && <GameSnake />}
        {currentGame === 'tic_tac_toe' && <GameTicTacToe />}
        {currentGame === 'minesweeper' && <GameMinesweeper />}
        {currentGame === 'memory_match' && <GameMemoryMatch />}
        {!['game_2048', 'snake', 'tic_tac_toe', 'minesweeper', 'memory_match'].includes(currentGame) && (
          <GameStub gameId={currentGame} />
        )}
      </main>

      {/* Footer Info */}
      <footer className="w-full max-w-sm flex items-center justify-between text-[11px] text-vault-500 pt-3 border-t border-vault-800/60 mt-4">
        <div className="flex items-center gap-1">
          <Sparkles className="w-3 h-3 text-arcade-gold" />
          <span>Offline Ready</span>
        </div>
        <div>Hold title 1s to authenticate</div>
      </footer>

      {/* Modals */}
      <GameSelectorModal isOpen={selectorOpen} onClose={() => setSelectorOpen(false)} />
      <StealthUnlockModal />
    </div>
  );
};

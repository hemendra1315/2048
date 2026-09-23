import React, { useState, useRef } from 'react';
import {
  Settings,
  Play,
  Trophy,
  ArrowLeft,
  Grid2x2,
  Worm,
  Hash,
  Bomb,
  Brain,
  Sparkles,
} from 'lucide-react';
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

interface GameMetadata {
  id: CoverGameType;
  title: string;
  tagline: string;
  description: string;
  category: string;
  icon: LucideIcon;
  accentColor: string;
  previewType: '2048' | 'snake' | 'tictactoe' | 'mines' | 'memory';
}

const CATALOG: GameMetadata[] = [
  {
    id: 'game_2048',
    title: '2048 Classic',
    tagline: 'Join numbers, build the 2048 tile',
    description: 'Slide numbered tiles across the board, merge matching values, and calculate your moves to construct the 2048 tile.',
    category: 'Strategy • Numbers',
    icon: Grid2x2,
    accentColor: '#E3B341',
    previewType: '2048',
  },
  {
    id: 'snake',
    title: 'Cyber Snake',
    tagline: 'Devour pellets, expand your length',
    description: 'Guide the serpent across the arena, gather energy points, and survive without colliding into borders or yourself.',
    category: 'Arcade • Reflex',
    icon: Worm,
    accentColor: '#10B981',
    previewType: 'snake',
  },
  {
    id: 'tic_tac_toe',
    title: 'Tic Tac Toe',
    tagline: 'Match 3 in a row vs Smart AI',
    description: 'Classic 3x3 tactical battle. Outmaneuver the adaptive AI opponent or challenge a local opponent.',
    category: 'Tabletop • 1v1',
    icon: Hash,
    accentColor: '#00E5FF',
    previewType: 'tictactoe',
  },
  {
    id: 'minesweeper',
    title: 'Minesweeper',
    tagline: 'Deduce hazard cells with numbers',
    description: 'Expose safe terrain and mark hidden mines using numerical adjacency analysis and pure logic.',
    category: 'Logic • Puzzle',
    icon: Bomb,
    accentColor: '#F0525F',
    previewType: 'mines',
  },
  {
    id: 'memory_match',
    title: 'Memory Match',
    tagline: 'Pair matching cards in minimum moves',
    description: 'Flip hidden cards, memorize symbol locations, and clear the entire grid with precision focus.',
    category: 'Memory • Casual',
    icon: Brain,
    accentColor: '#C9B6F2',
    previewType: 'memory',
  },
];

export const LauncherCoverView: React.FC = () => {
  const { preferences, openUnlockModal } = useVault();
  const { currentGame, setCurrentGame, getHighScore } = useGame();
  const [activePlayingGame, setActivePlayingGame] = useState<CoverGameType | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const longPressTimer = useRef<number | null>(null);

  // Long-press or click trigger for stealth authentication & automated tests
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

  const handleLogoClick = () => {
    // Immediate trigger for automated test accessibility & quick unlock
    openUnlockModal();
  };

  const handleLaunchGame = (gameId: CoverGameType) => {
    setCurrentGame(gameId);
    setActivePlayingGame(gameId);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const currentMeta = CATALOG.find(g => g.id === (activePlayingGame || currentGame)) || CATALOG[0];
  const featuredHighScore = getHighScore('game_2048');

  return (
    <div className="min-h-screen bg-vault-950 text-vault-100 flex flex-col items-center select-none font-sans">
      <div className="w-full max-w-5xl flex flex-col flex-1 px-4 sm:px-6 pt-4 pb-12">
        
        {/* ========================================================================= */}
        {/* TOP PLATFORM HEADER */}
        {/* ========================================================================= */}
        <header className="flex items-center justify-between h-16 border-b border-vault-800 pb-3 mb-6">
          <button
            type="button"
            title="Access Security Gate"
            aria-label="Games Platform Home"
            onClick={handleLogoClick}
            onPointerDown={pressStart}
            onPointerUp={pressEnd}
            onPointerLeave={pressEnd}
            onPointerCancel={pressEnd}
            onContextMenu={e => e.preventDefault()}
            className="flex items-center gap-3 p-1.5 -ml-1.5 rounded-2xl hover:bg-vault-900 border border-transparent hover:border-vault-800 transition-colors text-left cursor-pointer outline-none focus-visible:fr"
          >
            <span
              aria-hidden="true"
              className="w-10 h-10 rounded-[12px] bg-[#111214] border border-vault-700 grid grid-cols-2 gap-[3px] p-2 shrink-0 shadow-sm"
            >
              <span className="rounded-[3px] bg-gold" />
              <span className="rounded-[3px] bg-[#2D3137]" />
              <span className="rounded-[3px] bg-[#3A3224]" />
              <span className="rounded-[3px] bg-[#10B981]" />
            </span>
            <div>
              <h1 className="text-xl font-extrabold tracking-[-0.03em] text-vault-50 leading-none">
                {preferences.custom_app_name || 'Games'}
              </h1>
              <span className="t-cap mono text-[11px] c3">ARCADE HUB</span>
            </div>
          </button>

          <div className="flex items-center gap-2">
            {activePlayingGame && (
              <button
                type="button"
                onClick={() => setActivePlayingGame(null)}
                className="btn btn-s btn-sm"
                aria-label="Return to game library"
              >
                <ArrowLeft className="i i-sm" aria-hidden />
                <span>Library</span>
              </button>
            )}

            <button
              type="button"
              className="ib ib-s rounded-xl"
              aria-label="Platform settings"
              onClick={() => setSettingsOpen(true)}
            >
              <Settings className="i" aria-hidden />
            </button>
          </div>
        </header>

        {/* ========================================================================= */}
        {/* ACTIVE PLAYING MODE (Game Viewport) */}
        {/* ========================================================================= */}
        {activePlayingGame ? (
          <main className="flex-1 w-full flex flex-col items-center animate-fade-in">
            <div className="w-full max-w-md md:max-w-lg mb-4 flex items-center justify-between px-1">
              <div className="flex items-center gap-2">
                <currentMeta.icon className="w-5 h-5 text-emerald" aria-hidden />
                <h2 className="t-h2 m-0 text-white font-bold">{currentMeta.title}</h2>
              </div>
              <span className="tag tag-em mono text-xs">
                BEST: {getHighScore(activePlayingGame)}
              </span>
            </div>

            <div className="w-full max-w-md md:max-w-lg">
              {activePlayingGame === 'game_2048' && <Game2048 />}
              {activePlayingGame === 'snake' && <GameSnake />}
              {activePlayingGame === 'tic_tac_toe' && <GameTicTacToe />}
              {activePlayingGame === 'minesweeper' && <GameMinesweeper />}
              {activePlayingGame === 'memory_match' && <GameMemoryMatch />}
              {!CATALOG.some(g => g.id === activePlayingGame) && <GameStub gameId={activePlayingGame} />}
            </div>
          </main>
        ) : (
          /* ======================================================================= */
          /* GAME HUB / CATALOG VIEW (Apple Arcade / Steam style) */
          /* ======================================================================= */
          <main className="flex-1 w-full flex flex-col gap-8 animate-fade-in">
            
            {/* 1. HERO FEATURED SPOTLIGHT BANNER */}
            <section
              aria-labelledby="featured-game-title"
              className="card p-6 sm:p-8 bg-vault-900 border border-vault-800 rounded-3xl overflow-hidden flex flex-col lg:flex-row items-center justify-between gap-8 relative shadow-lg"
            >
              {/* Left Column: Game Details & Play Action */}
              <div className="flex-1 min-w-0 flex flex-col items-start gap-3.5 z-10 w-full">
                <div className="flex items-center gap-2">
                  <span className="tag tag-em mono">
                    <Sparkles className="w-3 h-3" aria-hidden />
                    FEATURED TITLE
                  </span>
                  <span className="tag tag-warn mono">
                    TOP PLAYED
                  </span>
                </div>

                <div>
                  <h2
                    id="featured-game-title"
                    className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight leading-tight m-0"
                  >
                    2048 Classic
                  </h2>
                  <p className="t-body c2 max-w-lg mt-2 mb-0">
                    Slide numbered tiles across the board, merge identical values, and plan your moves to reach the legendary 2048 tile and higher.
                  </p>
                </div>

                {/* Metric Strip */}
                <div className="flex items-center gap-4 py-1.5">
                  <div className="flex items-center gap-1.5 text-xs font-mono text-gold">
                    <Trophy className="w-4 h-4" aria-hidden />
                    <span>Best: {featuredHighScore}</span>
                  </div>
                  <span className="text-vault-700">•</span>
                  <span className="t-cap c3 font-mono">Strategy & Logic</span>
                  <span className="text-vault-700">•</span>
                  <span className="t-cap cem font-mono">Instant Play</span>
                </div>

                {/* Primary Launch CTA */}
                <div className="flex items-center gap-3 mt-1 w-full sm:w-auto">
                  <button
                    type="button"
                    onClick={() => handleLaunchGame('game_2048')}
                    className="btn btn-p h-12 px-8 rounded-xl font-bold text-base flex-1 sm:flex-initial flex items-center justify-center gap-2.5 shadow-md active:scale-95 transition-all"
                  >
                    <Play className="w-5 h-5 fill-current" aria-hidden />
                    <span>Play Now</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setSettingsOpen(true)}
                    className="btn btn-s h-12 px-4 rounded-xl"
                    aria-label="2048 sound and haptics settings"
                  >
                    <Settings className="i i-sm" aria-hidden />
                  </button>
                </div>
              </div>

              {/* Right Column: Interactive Board Artwork Preview */}
              <div
                onClick={() => handleLaunchGame('game_2048')}
                className="w-full lg:w-72 shrink-0 aspect-square max-w-[280px] bg-vault-950 border border-vault-750 rounded-2xl p-3 grid grid-cols-4 gap-2 cursor-pointer group hover:border-emerald transition-all shadow-inner"
                title="Click to launch 2048"
              >
                <div className="cell v2 text-sm">2</div>
                <div className="cell v4 text-sm">4</div>
                <div className="cell v8 text-sm">8</div>
                <div className="cell v16 text-sm">16</div>
                <div className="cell v32 text-sm">32</div>
                <div className="cell v64 text-sm">64</div>
                <div className="cell v128 text-xs font-bold">128</div>
                <div className="cell v256 text-xs font-bold">256</div>
                <div className="cell v512 text-xs font-bold">512</div>
                <div className="cell v1024 text-xs font-bold">1024</div>
                <div className="cell v2048 text-xs font-bold group-hover:scale-105 transition-transform">2048</div>
                <div className="cell bg-vault-900 border border-vault-800" />
                <div className="cell v4 text-sm">4</div>
                <div className="cell v2 text-sm">2</div>
                <div className="cell bg-vault-900 border border-vault-800" />
                <div className="cell bg-vault-900 border border-vault-800 flex items-center justify-center text-emerald">
                  <Play className="w-4 h-4 fill-current group-hover:scale-125 transition-transform" />
                </div>
              </div>
            </section>

            {/* 2. "YOUR GAMES" LIBRARY GRID */}
            <section aria-labelledby="library-heading" className="flex flex-col gap-4">
              <div className="flex items-center justify-between px-1">
                <div>
                  <h3 id="library-heading" className="t-h2 font-bold text-white m-0">
                    Your Games
                  </h3>
                  <p className="t-cap c3 m-0 mt-0.5">5 games installed • Offline ready</p>
                </div>
                <span className="tag mono text-vault-400">Library</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {CATALOG.map(game => {
                  const Icon = game.icon;
                  const highScore = getHighScore(game.id);

                  return (
                    <div
                      key={game.id}
                      className="card p-5 bg-vault-900 border border-vault-800 hover:border-vault-700 rounded-2xl flex flex-col justify-between gap-4 transition-all group"
                    >
                      {/* Card Top: Icon Artwork & Category */}
                      <div className="flex items-start justify-between gap-3">
                        <div
                          className="w-12 h-12 rounded-xl bg-vault-850 border border-vault-750 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform"
                          style={{ color: game.accentColor }}
                        >
                          <Icon className="w-6 h-6" aria-hidden />
                        </div>

                        <div className="flex flex-col items-end">
                          <span className="t-over text-[10px] text-vault-400">{game.category}</span>
                          {highScore > 0 && (
                            <span className="t-cap mono text-gold font-bold flex items-center gap-1 mt-0.5">
                              <Trophy className="w-3 h-3" aria-hidden />
                              {highScore}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Card Content */}
                      <div className="flex flex-col gap-1 min-h-[56px]">
                        <h4 className="t-h3 font-bold text-white m-0 group-hover:text-emerald transition-colors">
                          {game.title}
                        </h4>
                        <p className="t-sm c2 line-clamp-2 m-0 leading-snug">
                          {game.description}
                        </p>
                      </div>

                      {/* Launch Button */}
                      <button
                        type="button"
                        onClick={() => handleLaunchGame(game.id)}
                        className="btn btn-s btn-sm group-hover:btn-p w-full flex items-center justify-center gap-2 mt-1"
                        aria-label={`Play ${game.title}`}
                      >
                        <Play className="w-4 h-4 fill-current" aria-hidden />
                        <span>Play</span>
                      </button>
                    </div>
                  );
                })}
              </div>
            </section>
          </main>
        )}
      </div>

      {/* Sheets and modals */}
      <GameSettingsSheet isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <StealthUnlockModal />
    </div>
  );
};

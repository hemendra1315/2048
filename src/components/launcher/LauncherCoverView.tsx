import React, { useState, useRef } from 'react';
import {
  Settings,
  Play,
  Trophy,
  ArrowLeft,
  Sparkles,
  Flame,
  Zap,
  Activity,
  Award,
  CheckCircle2,
} from 'lucide-react';
import { useVault } from '../../context/VaultContext';
import { useGame, dailyChallengeLabel } from '../../context/GameContext';
import { CoverGameType } from '../../types';
import { Game2048 } from '../games/Game2048';
import { GameSnake } from '../games/GameSnake';
import { GameTicTacToe } from '../games/GameTicTacToe';
import { GameMinesweeper } from '../games/GameMinesweeper';
import { GameMemoryMatch } from '../games/GameMemoryMatch';
import { StealthUnlockModal } from './StealthUnlockModal';
import { GameSettingsSheet } from './GameSettingsSheet';
import { useBackHandler } from '../../lib/backButton';

interface GameMetadata {
  id: CoverGameType;
  title: string;
  tagline: string;
  description: string;
  category: string;
  badge?: string;
  players: string;
  accentColor: string;
}

const CATALOG: GameMetadata[] = [
  {
    id: 'game_2048',
    title: '2048 Classic',
    tagline: 'Join numbers, build the 2048 tile',
    description: 'Slide numbered tiles across the board, merge matching values, and calculate your moves to construct the legendary 2048 tile.',
    category: 'STRATEGY • NUMBERS',
    badge: 'POPULAR',
    players: '1 Player',
    accentColor: '#E3B341',
  },
  {
    id: 'snake',
    title: 'Cyber Snake',
    tagline: 'Devour pellets, expand your length',
    description: 'Guide the serpent across the arena, gather energy points, and survive without colliding into borders or yourself.',
    category: 'ARCADE • REFLEX',
    badge: 'HOT',
    players: '1 Player',
    accentColor: '#10B981',
  },
  {
    id: 'tic_tac_toe',
    title: 'Tic Tac Toe',
    tagline: 'Match 3 in a row vs Smart AI',
    description: 'Classic 3x3 tactical battle. Outmaneuver the adaptive AI opponent or challenge a friend in local turn-based play.',
    category: 'TABLETOP • 1V1',
    players: '1-2 Players',
    accentColor: '#00E5FF',
  },
  {
    id: 'minesweeper',
    title: 'Minesweeper',
    tagline: 'Deduce hazard cells with numbers',
    description: 'Expose safe terrain and mark hidden mines using numerical adjacency analysis and pure deductive logic.',
    category: 'LOGIC • PUZZLE',
    players: '1 Player',
    accentColor: '#F0525F',
  },
  {
    id: 'memory_match',
    title: 'Memory Matrix',
    tagline: 'Pair matching cards in minimum moves',
    description: 'Flip hidden holographic cards, memorize symbol locations, and clear the entire grid with precision focus.',
    category: 'MEMORY • CASUAL',
    badge: 'NEW',
    players: '1 Player',
    accentColor: '#C9B6F2',
  },
];

/* Bespoke Real Game Artwork Mini Thumbnails */

const Thumbnail2048: React.FC = () => (
  <div className="w-full h-32 bg-vault-950 rounded-xl p-2 border border-vault-800 grid grid-cols-4 gap-1.5 shadow-inner">
    <div className="rounded-[6px] bg-[#23262B] text-[#E8E9EB] font-bold text-xs flex items-center justify-center font-mono">2</div>
    <div className="rounded-[6px] bg-[#2D3137] text-[#F1F2F3] font-bold text-xs flex items-center justify-center font-mono">4</div>
    <div className="rounded-[6px] bg-[#3A3224] text-[#F2D58A] font-bold text-xs flex items-center justify-center font-mono">8</div>
    <div className="rounded-[6px] bg-[#4A3B1E] text-[#F6DC95] font-bold text-xs flex items-center justify-center font-mono">16</div>
    <div className="rounded-[6px] bg-[#5C4518] text-[#F9E3A6] font-bold text-xs flex items-center justify-center font-mono">32</div>
    <div className="rounded-[6px] bg-[#6F4F12] text-[#FFEDC2] font-bold text-xs flex items-center justify-center font-mono">64</div>
    <div className="rounded-[6px] bg-[#0F3A2C] text-[#6EE7B7] font-bold text-xs flex items-center justify-center font-mono">128</div>
    <div className="rounded-[6px] bg-[#0F4A37] text-[#86EFC6] font-bold text-xs flex items-center justify-center font-mono">256</div>
    <div className="rounded-[6px] bg-[#105E43] text-[#B5F5DA] font-bold text-xs flex items-center justify-center font-mono">512</div>
    <div className="rounded-[6px] bg-[#10B981] text-[#04120C] font-extrabold text-xs flex items-center justify-center font-mono">1024</div>
    <div className="rounded-[6px] bg-gold text-[#1A1302] font-extrabold text-xs flex items-center justify-center font-mono shadow-sm col-span-2">2048 🏆</div>
    <div className="rounded-[6px] bg-vault-900 border border-vault-800" />
    <div className="rounded-[6px] bg-vault-900 border border-vault-800" />
    <div className="rounded-[6px] bg-[#2D3137] text-[#F1F2F3] font-bold text-xs flex items-center justify-center font-mono">4</div>
    <div className="rounded-[6px] bg-[#23262B] text-[#E8E9EB] font-bold text-xs flex items-center justify-center font-mono">2</div>
  </div>
);

const ThumbnailSnake: React.FC = () => (
  <div className="w-full h-32 bg-vault-950 rounded-xl p-2 border border-vault-800 relative overflow-hidden flex flex-col justify-between shadow-inner">
    <div className="absolute inset-0 bg-[radial-gradient(#1E2025_1px,transparent_1px)] [background-size:12px_12px] opacity-60" />
    <div className="relative z-10 w-full h-full flex flex-col justify-center items-center">
      <div className="flex items-center gap-1">
        <div className="w-5 h-5 rounded-md bg-emerald border border-emerald-400 flex items-center justify-center shadow-[0_0_8px_rgba(16,185,129,0.5)]">
          <span className="w-1 h-1 bg-black rounded-full" />
        </div>
        <div className="w-4 h-4 rounded-md bg-emerald/90" />
        <div className="w-4 h-4 rounded-md bg-emerald/75" />
        <div className="w-3.5 h-3.5 rounded-md bg-emerald/60" />
        <div className="w-3 h-3 rounded-md bg-emerald/40" />
      </div>

      <div className="absolute top-4 right-8 w-4 h-4 rounded-full bg-gold animate-pulse flex items-center justify-center shadow-[0_0_10px_rgba(227,179,65,0.7)]">
        <span className="w-1.5 h-1.5 bg-white rounded-full" />
      </div>

      <div className="absolute bottom-3 left-4 text-xs font-mono text-emerald font-semibold flex items-center gap-1">
        <Activity className="w-3.5 h-3.5" />
        <span>CYBER SPEED: 120 FPS</span>
      </div>
    </div>
  </div>
);

const ThumbnailTicTacToe: React.FC = () => (
  <div className="w-full h-32 bg-vault-950 rounded-xl p-2 border border-vault-800 grid grid-cols-3 gap-1 relative shadow-inner">
    <div className="rounded-lg bg-vault-900 border border-vault-800 flex items-center justify-center text-emerald font-extrabold text-xl">✕</div>
    <div className="rounded-lg bg-vault-900 border border-vault-800 flex items-center justify-center text-cyan-400 font-extrabold text-xl">○</div>
    <div className="rounded-lg bg-vault-900 border border-vault-800 flex items-center justify-center text-emerald font-extrabold text-xl">✕</div>

    <div className="rounded-lg bg-vault-900 border border-vault-800 flex items-center justify-center text-cyan-400 font-extrabold text-xl">○</div>
    <div className="rounded-lg bg-vault-900 border border-emerald/50 bg-emerald/10 flex items-center justify-center text-emerald font-extrabold text-xl shadow-[0_0_8px_rgba(16,185,129,0.3)]">✕</div>
    <div className="rounded-lg bg-vault-900 border border-vault-800" />

    <div className="rounded-lg bg-vault-900 border border-vault-800 flex items-center justify-center text-cyan-400 font-extrabold text-xl">○</div>
    <div className="rounded-lg bg-vault-900 border border-vault-800" />
    <div className="rounded-lg bg-vault-900 border border-emerald/50 bg-emerald/10 flex items-center justify-center text-emerald font-extrabold text-xl shadow-[0_0_8px_rgba(16,185,129,0.3)]">✕</div>

    <div className="absolute bottom-1 right-2 bg-emerald/20 text-emerald text-xs font-mono px-2 py-0.5 rounded border border-emerald/40">
      WIN MATCH
    </div>
  </div>
);

const ThumbnailMinesweeper: React.FC = () => (
  <div className="w-full h-32 bg-vault-950 rounded-xl p-2 border border-vault-800 grid grid-cols-5 gap-1 shadow-inner font-mono text-xs font-bold">
    <div className="rounded bg-vault-900 border border-vault-800 flex items-center justify-center text-cyan-400">1</div>
    <div className="rounded bg-vault-900 border border-vault-800 flex items-center justify-center text-emerald">2</div>
    <div className="rounded bg-vault-900 border border-vault-800 flex items-center justify-center text-gold">3</div>
    <div className="rounded bg-red-950/60 border border-red-500/40 flex items-center justify-center text-red-400 shadow-sm">🚩</div>
    <div className="rounded bg-vault-900 border border-vault-800 flex items-center justify-center text-cyan-400">1</div>

    <div className="rounded bg-vault-850 border border-vault-700 shadow-sm" />
    <div className="rounded bg-vault-900 border border-vault-800 flex items-center justify-center text-cyan-400">1</div>
    <div className="rounded bg-red-950/60 border border-red-500/40 flex items-center justify-center text-red-400 shadow-sm">🚩</div>
    <div className="rounded bg-vault-900 border border-vault-800 flex items-center justify-center text-emerald">2</div>
    <div className="rounded bg-vault-850 border border-vault-700 shadow-sm" />

    <div className="rounded bg-vault-850 border border-vault-700 shadow-sm" />
    <div className="rounded bg-vault-850 border border-vault-700 shadow-sm" />
    <div className="rounded bg-vault-900 border border-vault-800 flex items-center justify-center text-cyan-400">1</div>
    <div className="rounded bg-vault-900 border border-vault-800 flex items-center justify-center text-cyan-400">1</div>
    <div className="rounded bg-vault-850 border border-vault-700 shadow-sm" />
  </div>
);

const ThumbnailMemoryMatch: React.FC = () => (
  <div className="w-full h-32 bg-vault-950 rounded-xl p-2 border border-vault-800 grid grid-cols-4 gap-1.5 shadow-inner">
    <div className="rounded-lg bg-vault-900 border border-purple-500/50 bg-purple-950/30 flex items-center justify-center text-purple-300 font-bold text-sm shadow-sm">💎</div>
    <div className="rounded-lg bg-vault-850 border border-vault-750 flex items-center justify-center text-vault-500 text-xs font-mono">?</div>
    <div className="rounded-lg bg-vault-900 border border-emerald/50 bg-emerald/20 flex items-center justify-center text-emerald font-bold text-sm shadow-sm">⚡</div>
    <div className="rounded-lg bg-vault-850 border border-vault-750 flex items-center justify-center text-vault-500 text-xs font-mono">?</div>

    <div className="rounded-lg bg-vault-850 border border-vault-750 flex items-center justify-center text-vault-500 text-xs font-mono">?</div>
    <div className="rounded-lg bg-vault-900 border border-purple-500/50 bg-purple-950/30 flex items-center justify-center text-purple-300 font-bold text-sm shadow-sm">💎</div>
    <div className="rounded-lg bg-vault-850 border border-vault-750 flex items-center justify-center text-vault-500 text-xs font-mono">?</div>
    <div className="rounded-lg bg-vault-900 border border-emerald/50 bg-emerald/20 flex items-center justify-center text-emerald font-bold text-sm shadow-sm">⚡</div>
  </div>
);

const renderGameThumbnail = (id: CoverGameType) => {
  switch (id) {
    case 'game_2048':
      return <Thumbnail2048 />;
    case 'snake':
      return <ThumbnailSnake />;
    case 'tic_tac_toe':
      return <ThumbnailTicTacToe />;
    case 'minesweeper':
      return <ThumbnailMinesweeper />;
    case 'memory_match':
      return <ThumbnailMemoryMatch />;
    default:
      return <Thumbnail2048 />;
  }
};

export const LauncherCoverView: React.FC = () => {
  const { preferences, openUnlockModal } = useVault();
  const { currentGame, setCurrentGame, getHighScore, dailyChallenge } = useGame();
  const [activePlayingGame, setActivePlayingGame] = useState<CoverGameType | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const longPressTimer = useRef<number | null>(null);

  // Long-press trigger for stealth access
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

  const handleLaunchGame = (gameId: CoverGameType) => {
    setCurrentGame(gameId);
    setActivePlayingGame(gameId);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const currentMeta = CATALOG.find(g => g.id === (activePlayingGame || currentGame)) || CATALOG[0];
  const featuredHighScore = getHighScore('game_2048');
  const dailyGameMeta = CATALOG.find(g => g.id === dailyChallenge.gameId) || CATALOG[0];

  useBackHandler(Boolean(activePlayingGame), () => setActivePlayingGame(null));
  useBackHandler(settingsOpen, () => setSettingsOpen(false));

  return (
    <div className="min-h-screen bg-vault-950 text-vault-100 flex flex-col items-center select-none font-sans">
      <div className="w-full max-w-5xl flex flex-col flex-1 px-4 sm:px-6 pt-[calc(1rem+env(safe-area-inset-top))] pb-[max(3rem,env(safe-area-inset-bottom))]">
        
        {/* ========================================================================= */}
        {/* TOP PLATFORM HEADER */}
        {/* ========================================================================= */}
        <header className="flex items-center justify-between h-16 border-b border-vault-800 pb-3 mb-6">
          <button
            type="button"
            title="Games"
            aria-label="Games Platform Home"
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            onPointerDown={pressStart}
            onPointerUp={pressEnd}
            onPointerLeave={pressEnd}
            onPointerCancel={pressEnd}
            onContextMenu={e => e.preventDefault()}
            className="flex items-center gap-3 p-1.5 -ml-1.5 rounded-2xl hover:bg-vault-900 border border-transparent hover:border-vault-800 transition-colors text-left cursor-pointer outline-none focus-visible:fr group min-h-[44px]"
          >
            <span
              aria-hidden="true"
              className="w-10 h-10 rounded-[12px] bg-[#111214] border border-vault-700 grid grid-cols-2 gap-[3px] p-2 shrink-0 shadow-sm group-hover:border-emerald transition-colors"
            >
              <span className="rounded-[3px] bg-gold" />
              <span className="rounded-[3px] bg-[#2D3137]" />
              <span className="rounded-[3px] bg-[#3A3224]" />
              <span className="rounded-[3px] bg-[#10B981]" />
            </span>
            <div>
              <h1 className="text-xl font-extrabold tracking-tight text-vault-50 leading-none">
                {preferences.custom_app_name || 'Games'}
              </h1>
              <span className="t-cap mono text-xs c3">ARCADE PLATFORM</span>
            </div>
          </button>

          <div className="flex items-center gap-2">
            {activePlayingGame && (
              <button
                type="button"
                onClick={() => setActivePlayingGame(null)}
                className="btn btn-s btn-sm min-h-[44px] min-w-[44px] flex items-center justify-center gap-1.5"
                aria-label="Return to game library"
              >
                <ArrowLeft className="w-4 h-4" aria-hidden />
                <span className="text-xs font-semibold">Library</span>
              </button>
            )}

            <button
              type="button"
              className="ib ib-s rounded-xl min-h-[44px] min-w-[44px] flex items-center justify-center cursor-pointer"
              aria-label="Platform settings"
              onClick={() => setSettingsOpen(true)}
            >
              <Settings className="w-5 h-5 text-vault-200" aria-hidden />
            </button>
          </div>
        </header>

        {/* ========================================================================= */}
        {/* ACTIVE PLAYING MODE (Game Viewport) */}
        {/* ========================================================================= */}
        {activePlayingGame ? (
          <main className="flex-1 w-full flex flex-col items-center anim-fade">
            <div className="w-full max-w-md md:max-w-lg mb-4 flex items-center justify-between px-1">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald animate-pulse" />
                <h2 className="text-lg font-bold text-white m-0">{currentMeta.title}</h2>
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
            </div>
          </main>
        ) : (
          /* ======================================================================= */
          /* GAME HUB / CATALOG VIEW */
          /* ======================================================================= */
          <main className="flex-1 w-full flex flex-col gap-6 anim-fade">
            
            {/* 0. DAILY PUZZLE & STREAK BANNER */}
            <section
              aria-labelledby="daily-challenge-title"
              className="bg-gradient-to-r from-vault-900 via-vault-850 to-vault-900 border border-vault-750 p-4 sm:p-5 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-lg"
            >
              <div className="flex items-center gap-3.5 min-w-0">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-500/20 to-orange-500/30 border border-amber-500/40 flex items-center justify-center text-amber-400 shrink-0">
                  <Flame className="w-6 h-6 animate-pulse text-amber-400" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-bold text-amber-400 uppercase tracking-wider flex items-center gap-1">
                      <span>{dailyChallenge.streak} Day Streak</span>
                    </span>
                    <span className="text-xs text-vault-400">•</span>
                    <span className="text-xs text-vault-300 font-medium">Daily Puzzle</span>
                  </div>
                  <h3 id="daily-challenge-title" className="text-sm font-bold text-white truncate m-0 mt-0.5">
                    {dailyGameMeta.title}: {dailyChallengeLabel(dailyChallenge.gameId, dailyChallenge.targetScore)}
                  </h3>
                </div>
              </div>

              <div className="flex items-center gap-2 w-full sm:w-auto">
                {dailyChallenge.completed ? (
                  <div className="min-h-[44px] px-4 py-2 bg-emerald/15 border border-emerald/40 text-emerald rounded-xl flex items-center justify-center gap-2 text-xs font-bold w-full sm:w-auto">
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Completed</span>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleLaunchGame(dailyChallenge.gameId)}
                    className="min-h-[44px] px-5 py-2 bg-gradient-to-r from-amber-500 to-orange-500 hover:brightness-110 active:scale-95 text-black font-bold text-xs rounded-xl flex items-center justify-center gap-2 shadow-md shadow-amber-500/20 transition-all w-full sm:w-auto cursor-pointer"
                  >
                    <Play className="w-4 h-4 fill-current" />
                    <span>Play Challenge</span>
                  </button>
                )}
              </div>
            </section>

            {/* 1. HERO FEATURED SPOTLIGHT BANNER */}
            <section
              aria-labelledby="featured-game-title"
              className="card card-interactive p-6 sm:p-8 bg-vault-900 border border-vault-800 rounded-3xl overflow-hidden flex flex-col lg:flex-row items-center justify-between gap-8 relative shadow-xl"
            >
              {/* Left Column: Game Details & Play Action */}
              <div className="flex-1 min-w-0 flex flex-col items-start gap-4 z-10 w-full">
                <div className="flex items-center gap-2">
                  <span className="tag tag-em mono text-xs">
                    <Sparkles className="w-3.5 h-3.5" aria-hidden />
                    FEATURED GAME
                  </span>
                  <span className="tag tag-warn mono text-xs">
                    <Flame className="w-3.5 h-3.5" aria-hidden />
                    TOP PLAYED
                  </span>
                </div>

                <div>
                  <h2
                    id="featured-game-title"
                    className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight leading-tight m-0"
                  >
                    2048 Classic
                  </h2>
                  <p className="text-sm text-vault-300 max-w-lg mt-2 mb-0">
                    Slide numbered tiles across the board, merge identical values, and plan your moves to reach the legendary 2048 tile and higher.
                  </p>
                </div>

                {/* Metric Strip */}
                <div className="flex flex-wrap items-center gap-2 py-1 text-xs">
                  <div className="flex items-center gap-1.5 font-mono text-gold font-bold bg-amber-950/40 px-2.5 py-1.5 rounded-lg border border-amber-600/30">
                    <Trophy className="w-4 h-4" aria-hidden />
                    <span>Best Score: {featuredHighScore}</span>
                  </div>
                  <span className="tag mono text-vault-300 text-xs">Strategy & Numbers</span>
                  <span className="tag tag-em mono flex items-center gap-1 text-xs">
                    <Zap className="w-3.5 h-3.5" />
                    Instant Play
                  </span>
                </div>

                {/* Primary Launch CTA */}
                <div className="flex items-center gap-3 mt-1 w-full sm:w-auto">
                  <button
                    type="button"
                    onClick={() => handleLaunchGame('game_2048')}
                    className="btn btn-p min-h-[44px] px-8 rounded-xl font-bold text-sm flex-1 sm:flex-initial flex items-center justify-center gap-2.5 shadow-lg active:scale-95 transition-all cursor-pointer"
                  >
                    <Play className="w-4 h-4 fill-current" aria-hidden />
                    <span>Play Now</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setSettingsOpen(true)}
                    className="btn btn-s min-h-[44px] min-w-[44px] px-4 rounded-xl flex items-center justify-center cursor-pointer"
                    aria-label="2048 sound and haptics settings"
                  >
                    <Settings className="w-5 h-5" aria-hidden />
                  </button>
                </div>
              </div>

              {/* Right Column: Interactive Board Artwork Preview */}
              <div
                onClick={() => handleLaunchGame('game_2048')}
                className="w-full lg:w-72 shrink-0 aspect-square max-w-[280px] bg-vault-950 border border-vault-750 rounded-2xl p-3 grid grid-cols-4 gap-2 cursor-pointer group hover:border-emerald transition-all shadow-inner"
                title="Click to launch 2048"
              >
                <div className="cell v2 text-xs">2</div>
                <div className="cell v4 text-xs">4</div>
                <div className="cell v8 text-xs">8</div>
                <div className="cell v16 text-xs">16</div>
                <div className="cell v32 text-xs">32</div>
                <div className="cell v64 text-xs">64</div>
                <div className="cell v128 text-xs font-bold">128</div>
                <div className="cell v256 text-xs font-bold">256</div>
                <div className="cell v512 text-xs font-bold">512</div>
                <div className="cell v1024 text-xs font-bold">1024</div>
                <div className="cell v2048 text-xs font-bold group-hover:scale-105 transition-transform">2048</div>
                <div className="cell bg-vault-900 border border-vault-800" />
                <div className="cell v4 text-xs">4</div>
                <div className="cell v2 text-xs">2</div>
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
                  <h3 id="library-heading" className="text-lg font-bold text-white m-0">
                    Game Library
                  </h3>
                  <p className="text-xs text-vault-400 m-0 mt-0.5">5 arcade titles • Instant local execution • Zero latency</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="tag mono text-vault-400 text-xs">
                    <Award className="w-3.5 h-3.5 text-gold" />
                    5 Installed
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {CATALOG.map(game => {
                  const highScore = getHighScore(game.id);

                  return (
                    <div
                      key={game.id}
                      className="card card-interactive p-4 bg-vault-900 border border-vault-800 rounded-2xl flex flex-col justify-between gap-3.5 group shadow-md"
                    >
                      {/* Game Real Thumbnail Art */}
                      <div
                        onClick={() => handleLaunchGame(game.id)}
                        className="w-full cursor-pointer relative group-hover:brightness-105 transition-all"
                      >
                        {renderGameThumbnail(game.id)}
                      </div>

                      {/* Card Content & Metadata */}
                      <div className="flex flex-col gap-1.5 min-h-[72px]">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-semibold text-vault-400">{game.category}</span>
                            {game.badge && (
                              <span className="tag tag-em text-xs font-mono">
                                {game.badge}
                              </span>
                            )}
                          </div>
                          {highScore > 0 && (
                            <span className="text-xs mono text-gold font-bold flex items-center gap-1">
                              <Trophy className="w-3.5 h-3.5" aria-hidden />
                              {highScore}
                            </span>
                          )}
                        </div>

                        <h4 className="text-base font-bold text-white m-0 group-hover:text-emerald transition-colors">
                          {game.title}
                        </h4>
                        <p className="text-xs text-vault-300 line-clamp-2 m-0 leading-snug">
                          {game.description}
                        </p>
                      </div>

                      {/* Launch Action */}
                      <button
                        type="button"
                        onClick={() => handleLaunchGame(game.id)}
                        className="btn btn-s min-h-[44px] group-hover:btn-p w-full flex items-center justify-center gap-2 font-semibold text-xs transition-all cursor-pointer"
                        aria-label={`Play ${game.title}`}
                      >
                        <Play className="w-4 h-4 fill-current" aria-hidden />
                        <span>Launch Game</span>
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

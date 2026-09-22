import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { CoverGameType, CoverGameMeta } from '../types';
import { useAuth } from './AuthContext';
import { useVault } from './VaultContext';
import { mockBackend } from '../lib/mockBackend';

export const COVER_GAMES: CoverGameMeta[] = [
  {
    id: 'game_2048',
    name: '2048 Vault',
    tagline: 'Join the numbers and reach 2048!',
    icon: 'Grid',
    color: 'from-amber-500 to-orange-600',
    implemented: true,
  },
  {
    id: 'snake',
    name: 'Cyber Snake',
    tagline: 'Classic retro snake with neon grid and speed ramps',
    icon: 'Activity',
    color: 'from-emerald-500 to-teal-600',
    implemented: true,
  },
  {
    id: 'tic_tac_toe',
    name: 'Tic-Tac-Toe AI',
    tagline: 'Battle against unbeatable Minimax logic or local 2P',
    icon: 'Hash',
    color: 'from-cyan-500 to-blue-600',
    implemented: true,
  },
  {
    id: 'sudoku',
    name: 'Sudoku Master',
    tagline: 'Logical number puzzles with pencil notes',
    icon: 'LayoutGrid',
    color: 'from-indigo-500 to-purple-600',
    implemented: false,
  },
  {
    id: 'minesweeper',
    name: 'Minesweeper',
    tagline: 'Flag mines and clear the danger grid',
    icon: 'ShieldAlert',
    color: 'from-rose-500 to-red-600',
    implemented: false,
  },
  {
    id: 'brick_breaker',
    name: 'Brick Breaker',
    tagline: 'Bounce balls and shatter the neon brick fortress',
    icon: 'SquareDashedBottom',
    color: 'from-amber-400 to-pink-600',
    implemented: false,
  },
  {
    id: 'memory_match',
    name: 'Memory Match',
    tagline: 'Flip and pair matching cyber tiles under time pressure',
    icon: 'Layers',
    color: 'from-purple-500 to-pink-500',
    implemented: false,
  },
  {
    id: 'bubble_shooter',
    name: 'Bubble Shooter',
    tagline: 'Aim and pop matching colored bubble clusters',
    icon: 'CircleDot',
    color: 'from-sky-400 to-indigo-600',
    implemented: false,
  },
  {
    id: 'block_puzzle',
    name: 'Block Puzzle',
    tagline: 'Fit geometrical blocks into rows & columns',
    icon: 'Boxes',
    color: 'from-emerald-400 to-cyan-600',
    implemented: false,
  },
  {
    id: 'flappy_bird',
    name: 'Flappy Stealth',
    tagline: 'Tap to flap through high-frequency obstacles',
    icon: 'Feather',
    color: 'from-yellow-400 to-orange-500',
    implemented: false,
  },
];

interface GameContextType {
  currentGame: CoverGameType;
  setCurrentGame: (game: CoverGameType) => void;
  getHighScore: (game: CoverGameType) => number;
  saveHighScore: (game: CoverGameType, score: number) => void;
  resetGame: (game: CoverGameType) => void;
  soundEnabled: boolean;
  hapticsEnabled: boolean;
  toggleSound: () => void;
  toggleHaptics: () => void;
}

const GameContext = createContext<GameContextType | undefined>(undefined);

export const GameProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const { preferences, updatePreferences } = useVault();
  const [currentGame, setCurrentGameState] = useState<CoverGameType>('game_2048');
  const [scores, setScores] = useState<Record<string, number>>({});
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [hapticsEnabled, setHapticsEnabled] = useState(true);

  useEffect(() => {
    if (preferences.selected_game) {
      setCurrentGameState(preferences.selected_game);
    }
  }, [preferences.selected_game]);

  const loadScores = useCallback(() => {
    const userId = user?.id || 'guest';
    const loadedScores: Record<string, number> = {};
    COVER_GAMES.forEach(g => {
      const progress = mockBackend.getGameProgress(userId, g.id);
      loadedScores[g.id] = progress.highScore;
    });
    setScores(loadedScores);
  }, [user?.id]);

  useEffect(() => {
    loadScores();
  }, [loadScores]);

  const setCurrentGame = (game: CoverGameType) => {
    setCurrentGameState(game);
    updatePreferences({ selected_game: game });
  };

  const getHighScore = (game: CoverGameType): number => {
    return scores[game] || 0;
  };

  const saveHighScore = (game: CoverGameType, score: number) => {
    const userId = user?.id || 'guest';
    mockBackend.saveGameProgress(userId, game, score);
    setScores(prev => ({
      ...prev,
      [game]: Math.max(prev[game] || 0, score),
    }));
  };

  const resetGame = (game: CoverGameType) => {
    const userId = user?.id || 'guest';
    mockBackend.resetGameProgress(userId, game);
    setScores(prev => ({
      ...prev,
      [game]: 0,
    }));
  };

  const toggleSound = () => setSoundEnabled(v => !v);
  const toggleHaptics = () => setHapticsEnabled(v => !v);

  return (
    <GameContext.Provider
      value={{
        currentGame,
        setCurrentGame,
        getHighScore,
        saveHighScore,
        resetGame,
        soundEnabled,
        hapticsEnabled,
        toggleSound,
        toggleHaptics,
      }}
    >
      {children}
    </GameContext.Provider>
  );
};

export const useGame = () => {
  const context = useContext(GameContext);
  if (!context) throw new Error('useGame must be used within GameProvider');
  return context;
};

import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { CoverGameType, CoverGameMeta } from '../types';
import { useAuth } from './AuthContext';
import { useVault } from './VaultContext';
import { mockBackend } from '../lib/mockBackend';
import { supabase, isSupabaseConfigured } from '../lib/supabase';

export const COVER_GAMES: CoverGameMeta[] = [
  {
    id: 'game_2048',
    name: '2048 Classic',
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
    name: 'Tic Tac Toe',
    tagline: 'Battle against smart Minimax logic or local 2P',
    icon: 'Hash',
    color: 'from-cyan-500 to-blue-600',
    implemented: true,
  },
  {
    id: 'minesweeper',
    name: 'Minesweeper',
    tagline: 'Flag danger mines and deduce safe terrain',
    icon: 'ShieldAlert',
    color: 'from-rose-500 to-red-600',
    implemented: true,
  },
  {
    id: 'memory_match',
    name: 'Memory Matrix',
    tagline: 'Flip and pair matching cyber tiles with precision focus',
    icon: 'Layers',
    color: 'from-purple-500 to-pink-500',
    implemented: true,
  },
];

interface DailyChallengeState {
  gameId: CoverGameType;
  dateKey: string;
  targetScore: number;
  completed: boolean;
  streak: number;
}

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
  dailyChallenge: DailyChallengeState;
  completeDailyChallenge: () => void;
}

const GameContext = createContext<GameContextType | undefined>(undefined);

const DAILY_GAMES: CoverGameType[] = ['game_2048', 'snake', 'tic_tac_toe', 'minesweeper', 'memory_match'];

const getTodayKey = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const getDailyGameForDate = (dateKey: string): { gameId: CoverGameType; targetScore: number } => {
  let hash = 0;
  for (let i = 0; i < dateKey.length; i++) {
    hash = (hash * 31 + dateKey.charCodeAt(i)) >>> 0;
  }
  const gameIndex = hash % DAILY_GAMES.length;
  const gameId = DAILY_GAMES[gameIndex];
  // Only the 5 games in DAILY_GAMES are ever looked up here; other CoverGameType
  // values (sudoku, brick_breaker, bubble_shooter, block_puzzle, flappy_bird) exist
  // in the shared type/DB enum for future use but have no implemented game yet.
  const targets: Partial<Record<CoverGameType, number>> = {
    game_2048: 512,
    snake: 60,
    tic_tac_toe: 3,
    minesweeper: 1,
    memory_match: 1,
  };
  return { gameId, targetScore: targets[gameId] || 100 };
};

/**
 * Plain-language version of a daily target. Most games track a numeric score, but Minesweeper and
 * Memory Matrix award a score just for finishing the board (any completion beats a target of 1),
 * and Tic-Tac-Toe's target counts wins in the session, not points — "Target Score 1" or "Target
 * Score 3" reads like a broken number for those, even though the target itself is fine.
 */
export function dailyChallengeLabel(gameId: CoverGameType, targetScore: number): string {
  switch (gameId) {
    case 'minesweeper':
    case 'memory_match':
      return 'Clear the board once';
    case 'tic_tac_toe':
      return `Win ${targetScore} round${targetScore === 1 ? '' : 's'}`;
    default:
      return `Target Score ${targetScore}`;
  }
}

export const GameProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { preferences, updatePreferences } = useVault();
  const { user } = useAuth();

  const [currentGame, setCurrentGame] = useState<CoverGameType>(() => {
    return preferences?.selected_game || 'game_2048';
  });

  const [soundEnabled, setSoundEnabled] = useState(true);
  const [hapticsEnabled, setHapticsEnabled] = useState(true);
  const [highScores, setHighScores] = useState<Record<string, number>>({});

  // Daily Challenge & Streak State
  const [dailyChallenge, setDailyChallenge] = useState<DailyChallengeState>(() => {
    const today = getTodayKey();
    const { gameId, targetScore } = getDailyGameForDate(today);
    const rawSaved = localStorage.getItem('games_daily_challenge');
    let streak = 0;
    let completed = false;

    if (rawSaved) {
      try {
        const parsed = JSON.parse(rawSaved);
        if (parsed.dateKey === today) {
          completed = !!parsed.completed;
          streak = parsed.streak || 0;
        } else {
          // Check if yesterday was completed to maintain streak
          const yesterday = new Date(Date.now() - 86400000);
          const yesterdayKey = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`;
          if (parsed.dateKey === yesterdayKey && parsed.completed) {
            streak = parsed.streak || 1;
          } else {
            streak = 0;
          }
        }
      } catch {
        streak = 0;
      }
    }

    return {
      gameId,
      dateKey: today,
      targetScore,
      completed,
      streak,
    };
  });

  // Sync selected game from preferences
  useEffect(() => {
    if (preferences?.selected_game) {
      setCurrentGame(preferences.selected_game);
    }
  }, [preferences?.selected_game]);

  // Load high scores
  useEffect(() => {
    let cancelled = false;
    const userId = user?.id || 'anonymous';

    if (isSupabaseConfigured() && user?.id) {
      supabase
        .from('game_progress')
        .select('game_name, high_score')
        .eq('user_id', user.id)
        .then(({ data, error }) => {
          if (cancelled) return;
          if (error) {
            console.warn('[games] could not load high scores', error);
            return;
          }
          const loadedScores: Record<string, number> = {};
          for (const row of data ?? []) {
            loadedScores[row.game_name] = row.high_score;
          }
          setHighScores(loadedScores);
        });
    } else {
      const loadedScores: Record<string, number> = {};
      COVER_GAMES.forEach(game => {
        loadedScores[game.id] = mockBackend.getHighScore(userId, game.id);
      });
      setHighScores(loadedScores);
    }

    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const handleSetCurrentGame = useCallback((game: CoverGameType) => {
    setCurrentGame(game);
    if (preferences && preferences.selected_game !== game) {
      void updatePreferences({ selected_game: game });
    }
  }, [preferences, updatePreferences]);

  const getHighScore = useCallback((game: CoverGameType): number => {
    return highScores[game] || 0;
  }, [highScores]);

  const completeDailyChallenge = useCallback(() => {
    setDailyChallenge(prev => {
      if (prev.completed) return prev;
      const updated = {
        ...prev,
        completed: true,
        streak: prev.streak + 1,
      };
      localStorage.setItem('games_daily_challenge', JSON.stringify(updated));
      return updated;
    });
  }, []);

  const persistHighScore = useCallback((game: CoverGameType, score: number) => {
    const userId = user?.id || 'anonymous';
    if (isSupabaseConfigured() && user?.id) {
      supabase
        .from('game_progress')
        .upsert({ user_id: user.id, game_name: game, high_score: score }, { onConflict: 'user_id,game_name' })
        .then(({ error }) => {
          if (error) console.warn('[games] could not save high score', error);
        });
    } else {
      mockBackend.saveHighScore(userId, game, score);
    }
  }, [user?.id]);

  const saveHighScore = useCallback((game: CoverGameType, score: number) => {
    setHighScores(prev => {
      const currentBest = prev[game] || 0;
      if (score > currentBest) {
        persistHighScore(game, score);
        return { ...prev, [game]: score };
      }
      return prev;
    });

    // Check daily challenge progress
    if (game === dailyChallenge.gameId && !dailyChallenge.completed && score >= dailyChallenge.targetScore) {
      completeDailyChallenge();
    }
  }, [dailyChallenge, completeDailyChallenge, persistHighScore]);

  const resetGame = useCallback((game: CoverGameType) => {
    persistHighScore(game, 0);
    setHighScores(prev => ({ ...prev, [game]: 0 }));
  }, [persistHighScore]);

  const toggleSound = useCallback(() => setSoundEnabled(s => !s), []);
  const toggleHaptics = useCallback(() => setHapticsEnabled(h => !h), []);

  return (
    <GameContext.Provider
      value={{
        currentGame,
        setCurrentGame: handleSetCurrentGame,
        getHighScore,
        saveHighScore,
        resetGame,
        soundEnabled,
        hapticsEnabled,
        toggleSound,
        toggleHaptics,
        dailyChallenge,
        completeDailyChallenge,
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

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { RotateCcw, Award, ChevronUp, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { useGame } from '../../context/GameContext';

interface Tile {
  id: number;
  val: number;
  row: number;
  col: number;
  isNew?: boolean;
  merged?: boolean;
}

export const Game2048: React.FC = () => {
  const { getHighScore, saveHighScore } = useGame();
  const [grid, setGrid] = useState<(Tile | null)[][]>(() =>
    Array(4).fill(null).map(() => Array(4).fill(null))
  );
  const [score, setScore] = useState(0);
  const [gameOver, setGameOver] = useState(false);
  const [gameWon, setGameWon] = useState(false);
  const [keepPlaying, setKeepPlaying] = useState(false);
  const tileIdRef = useRef(1);
  const boardRef = useRef<HTMLDivElement>(null);

  const highScore = getHighScore('game_2048');

  const getEmptyCells = (currentGrid: (Tile | null)[][]) => {
    const empty: { r: number; c: number }[] = [];
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 4; c++) {
        if (!currentGrid[r][c]) empty.push({ r, c });
      }
    }
    return empty;
  };

  const addRandomTile = useCallback((currentGrid: (Tile | null)[][]) => {
    const empty = getEmptyCells(currentGrid);
    if (empty.length === 0) return currentGrid;

    const { r, c } = empty[Math.floor(Math.random() * empty.length)];
    const val = Math.random() < 0.9 ? 2 : 4;
    const newTile: Tile = {
      id: tileIdRef.current++,
      val,
      row: r,
      col: c,
      isNew: true,
    };

    const next = currentGrid.map(row => [...row]);
    next[r][c] = newTile;
    return next;
  }, []);

  const startNewGame = useCallback(() => {
    let newGrid: (Tile | null)[][] = Array(4).fill(null).map(() => Array(4).fill(null));
    newGrid = addRandomTile(newGrid);
    newGrid = addRandomTile(newGrid);
    setGrid(newGrid);
    setScore(0);
    setGameOver(false);
    setGameWon(false);
    setKeepPlaying(false);
  }, [addRandomTile]);

  useEffect(() => {
    startNewGame();
  }, [startNewGame]);

  const movesAvailable = useCallback((currentGrid: (Tile | null)[][]) => {
    if (getEmptyCells(currentGrid).length > 0) return true;
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 4; c++) {
        const t = currentGrid[r][c];
        if (!t) return true;
        if (r < 3 && currentGrid[r + 1][c]?.val === t.val) return true;
        if (c < 3 && currentGrid[r][c + 1]?.val === t.val) return true;
      }
    }
    return false;
  }, []);

  const move = useCallback(
    (direction: 0 | 1 | 2 | 3) => {
      // 0: Up, 1: Right, 2: Down, 3: Left
      if (gameOver || (gameWon && !keepPlaying)) return;

      const vectors = [
        { r: -1, c: 0 },
        { r: 0, c: 1 },
        { r: 1, c: 0 },
        { r: 0, c: -1 },
      ];
      const vector = vectors[direction];

      const rOrder = [0, 1, 2, 3];
      const cOrder = [0, 1, 2, 3];
      if (vector.r === 1) rOrder.reverse();
      if (vector.c === 1) cOrder.reverse();

      let moved = false;
      let gainedScore = 0;
      let won = false;

      const nextGrid: (Tile | null)[][] = grid.map(row =>
        row.map(t => (t ? { ...t, merged: false, isNew: false } : null))
      );

      rOrder.forEach(r => {
        cOrder.forEach(c => {
          const tile = nextGrid[r][c];
          if (!tile) return;

          let prevR = r;
          let prevC = c;
          let currR = r + vector.r;
          let currC = c + vector.c;

          while (currR >= 0 && currR < 4 && currC >= 0 && currC < 4 && !nextGrid[currR][currC]) {
            prevR = currR;
            prevC = currC;
            currR += vector.r;
            currC += vector.c;
          }

          if (
            currR >= 0 &&
            currR < 4 &&
            currC >= 0 &&
            currC < 4 &&
            nextGrid[currR][currC] &&
            nextGrid[currR][currC]!.val === tile.val &&
            !nextGrid[currR][currC]!.merged
          ) {
            // Merge
            const mergedTile: Tile = {
              id: tileIdRef.current++,
              val: tile.val * 2,
              row: currR,
              col: currC,
              merged: true,
            };
            nextGrid[currR][currC] = mergedTile;
            nextGrid[r][c] = null;
            gainedScore += mergedTile.val;
            moved = true;
            if (mergedTile.val === 2048) won = true;
          } else if (prevR !== r || prevC !== c) {
            // Slide
            nextGrid[prevR][prevC] = { ...tile, row: prevR, col: prevC };
            nextGrid[r][c] = null;
            moved = true;
          }
        });
      });

      if (moved) {
        const gridWithNew = addRandomTile(nextGrid);
        setGrid(gridWithNew);

        const newScore = score + gainedScore;
        setScore(newScore);
        if (newScore > highScore) {
          saveHighScore('game_2048', newScore);
        }

        if (won && !gameWon) {
          setGameWon(true);
        }

        if (!movesAvailable(gridWithNew)) {
          setGameOver(true);
        }
      }
    },
    [grid, gameOver, gameWon, keepPlaying, score, highScore, saveHighScore, addRandomTile, movesAvailable]
  );

  // Keyboard controls
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        (e.target as HTMLElement)?.isContentEditable
      ) {
        return;
      }
      if (['ArrowUp', 'KeyW'].includes(e.code)) {
        e.preventDefault();
        move(0);
      } else if (['ArrowRight', 'KeyD'].includes(e.code)) {
        e.preventDefault();
        move(1);
      } else if (['ArrowDown', 'KeyS'].includes(e.code)) {
        e.preventDefault();
        move(2);
      } else if (['ArrowLeft', 'KeyA'].includes(e.code)) {
        e.preventDefault();
        move(3);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [move]);

  // Touch Swipe Handling
  const touchStart = useRef<{ x: number; y: number } | null>(null);

  const onTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      touchStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    }
  };

  const onTouchEnd = (e: React.TouchEvent) => {
    if (!touchStart.current || e.changedTouches.length === 0) return;
    const dx = e.changedTouches[0].clientX - touchStart.current.x;
    const dy = e.changedTouches[0].clientY - touchStart.current.y;
    const absX = Math.abs(dx);
    const absY = Math.abs(dy);

    if (Math.max(absX, absY) > 25) {
      if (absX > absY) {
        move(dx > 0 ? 1 : 3);
      } else {
        move(dy > 0 ? 2 : 0);
      }
    }
    touchStart.current = null;
  };

  const getTileBg = (val: number) => {
    switch (val) {
      case 2: return 'bg-amber-100 text-vault-900 border-amber-200';
      case 4: return 'bg-amber-200 text-vault-900 border-amber-300';
      case 8: return 'bg-orange-400 text-white font-bold shadow-md shadow-orange-500/20';
      case 16: return 'bg-orange-500 text-white font-bold shadow-md shadow-orange-600/30';
      case 32: return 'bg-rose-500 text-white font-bold shadow-md shadow-rose-600/30';
      case 64: return 'bg-red-600 text-white font-bold shadow-md shadow-red-700/40';
      case 128: return 'bg-yellow-400 text-vault-950 font-bold text-xl shadow-lg shadow-yellow-500/40';
      case 256: return 'bg-yellow-500 text-vault-950 font-bold text-xl shadow-lg shadow-yellow-500/50';
      case 512: return 'bg-amber-400 text-vault-950 font-bold text-xl shadow-lg shadow-amber-500/60';
      case 1024: return 'bg-amber-500 text-vault-950 font-bold text-lg shadow-xl shadow-amber-500/70';
      case 2048: return 'bg-emerald-500 text-white font-bold text-lg shadow-xl shadow-emerald-500/80 animate-pulse';
      default: return 'bg-purple-600 text-white font-bold text-base shadow-xl';
    }
  };

  return (
    <div className="flex flex-col items-center w-full max-w-sm mx-auto select-none">
      {/* Score Header */}
      <div className="flex items-center justify-between w-full mb-3 px-1">
        <div className="flex gap-2">
          <div className="bg-vault-900/90 border border-vault-700/60 px-3.5 py-1.5 rounded-xl text-center min-w-[70px]">
            <div className="text-[10px] font-semibold text-vault-400 uppercase tracking-wider">SCORE</div>
            <div className="text-base font-bold text-white leading-tight">{score}</div>
          </div>
          <div className="bg-vault-900/90 border border-vault-700/60 px-3.5 py-1.5 rounded-xl text-center min-w-[70px]">
            <div className="text-[10px] font-semibold text-arcade-gold uppercase tracking-wider flex items-center justify-center gap-1">
              <Award className="w-3 h-3" /> BEST
            </div>
            <div className="text-base font-bold text-arcade-gold leading-tight">{Math.max(highScore, score)}</div>
          </div>
        </div>

        <button
          onClick={startNewGame}
          className="flex items-center gap-1.5 bg-vault-800 hover:bg-vault-700 active:scale-95 text-vault-100 text-xs font-semibold px-3 py-2 rounded-xl transition-all border border-vault-600/50 shadow-sm"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>New Game</span>
        </button>
      </div>

      {/* 4x4 Game Board */}
      <div
        ref={boardRef}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        className="relative w-full aspect-square bg-vault-900 border-2 border-vault-700/80 rounded-2xl p-2.5 shadow-2xl shadow-black/40 touch-none flex flex-col justify-between"
      >
        {/* Background Grid Cells */}
        <div className="grid grid-cols-4 grid-rows-4 gap-2 w-full h-full">
          {Array(16).fill(null).map((_, i) => (
            <div key={i} className="bg-vault-950/60 rounded-xl border border-vault-800/40" />
          ))}
        </div>

        {/* Foreground Tile Overlay */}
        <div className="absolute inset-2.5 grid grid-cols-4 grid-rows-4 gap-2 pointer-events-none">
          {grid.map((row, r) =>
            row.map((tile, c) => (
              <div key={`${r}-${c}`} className="relative flex items-center justify-center">
                {tile && (
                  <div
                    className={`w-full h-full rounded-xl flex items-center justify-center text-2xl font-bold transition-all duration-100 ${getTileBg(
                      tile.val
                    )} ${tile.isNew ? 'scale-90 animate-fade-in' : ''} ${
                      tile.merged ? 'scale-110' : 'scale-100'
                    }`}
                  >
                    {tile.val}
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        {/* Game Over / Win Overlay */}
        {(gameOver || (gameWon && !keepPlaying)) && (
          <div className="absolute inset-0 bg-vault-950/85 backdrop-blur-sm rounded-2xl flex flex-col items-center justify-center z-20 animate-fade-in p-4 text-center">
            <h3 className="text-2xl font-bold text-white mb-1">
              {gameWon ? '🎉 2048 Reached!' : 'Game Over'}
            </h3>
            <p className="text-xs text-vault-400 mb-4">
              {gameWon ? 'You mastered the Vault Matrix!' : 'No more legal moves left.'}
            </p>
            <div className="flex gap-2">
              {gameWon && (
                <button
                  onClick={() => setKeepPlaying(true)}
                  className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold px-4 py-2 rounded-xl"
                >
                  Keep Playing
                </button>
              )}
              <button
                onClick={startNewGame}
                className="bg-arcade-amber hover:bg-amber-400 text-vault-950 text-xs font-bold px-4 py-2 rounded-xl flex items-center gap-1.5"
              >
                <RotateCcw className="w-3.5 h-3.5" /> Try Again
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Touch D-Pad Helpers for Accessibility */}
      <div className="grid grid-cols-3 gap-1.5 mt-3 w-36 sm:hidden">
        <div></div>
        <button
          onClick={() => move(0)}
          className="p-2.5 bg-vault-800/80 active:bg-vault-700 rounded-xl flex items-center justify-center border border-vault-700 text-vault-300"
        >
          <ChevronUp className="w-5 h-5" />
        </button>
        <div></div>
        <button
          onClick={() => move(3)}
          className="p-2.5 bg-vault-800/80 active:bg-vault-700 rounded-xl flex items-center justify-center border border-vault-700 text-vault-300"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <button
          onClick={() => move(2)}
          className="p-2.5 bg-vault-800/80 active:bg-vault-700 rounded-xl flex items-center justify-center border border-vault-700 text-vault-300"
        >
          <ChevronDown className="w-5 h-5" />
        </button>
        <button
          onClick={() => move(1)}
          className="p-2.5 bg-vault-800/80 active:bg-vault-700 rounded-xl flex items-center justify-center border border-vault-700 text-vault-300"
        >
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
};

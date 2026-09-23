import React, { useState, useEffect, useCallback, useRef } from 'react';
import { RotateCcw, Award } from 'lucide-react';
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

  // Tile ramp from the design system: warm neutrals → gold → emerald (see games design canvas).
  const tileClass = (val: number) => (val <= 2048 ? `cell v${val}` : 'cell v2048');

  const best = Math.max(highScore, score);
  const showOverlay = gameOver || (gameWon && !keepPlaying);

  return (
    <div className="flex flex-col w-full max-w-md mx-auto select-none">
      <div className="flex gap-2.5 items-stretch">
        <div className="card flex-1 px-4 py-3 flex flex-col gap-0.5">
          <span className="t-over">Score</span>
          <span className="mono text-[26px] leading-8 font-bold" aria-live="polite">{score.toLocaleString('en-US')}</span>
        </div>
        <div className="card flex-1 px-4 py-3 flex flex-col gap-0.5 !bg-[#0F0D08] !border-[rgba(227,179,65,0.22)]">
          <span className="t-over !text-[#C9A24A] flex items-center gap-1.5">
            <Award className="w-3.5 h-3.5" aria-hidden />
            Best
          </span>
          <span className="mono cgold text-[26px] leading-8 font-bold">{best.toLocaleString('en-US')}</span>
        </div>
        <button type="button" onClick={startNewGame} className="ib ib-s self-center" aria-label="New game">
          <RotateCcw className="i" aria-hidden />
        </button>
      </div>

      <div
        ref={boardRef}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        role="grid"
        aria-label="2048 board, 4 by 4. Swipe or use the arrow keys to move tiles."
        className="relative mt-4 touch-none"
      >
        <div className="board">
          {grid.map((row, r) =>
            row.map((tile, c) => (
              <div
                key={`${r}-${c}`}
                role="gridcell"
                className={`${tile ? tileClass(tile.val) : 'cell'} transition-transform duration-100 ${
                  tile?.isNew ? 'scale-90 animate-fade-in' : ''
                } ${tile?.merged ? 'scale-105' : ''}`}
              >
                {tile ? tile.val : ''}
              </div>
            ))
          )}
        </div>

        {showOverlay && (
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="g2048-over"
            className="absolute inset-0 rounded-[22px] bg-[rgba(5,5,5,0.86)] flex flex-col items-center justify-center gap-3.5 p-6 text-center z-20 animate-fade-in"
          >
            {gameWon && (
              <div className="w-16 h-16 rounded-[20px] bg-[rgba(227,179,65,0.12)] text-gold flex items-center justify-center">
                <Award className="w-7 h-7" aria-hidden />
              </div>
            )}
            <h3 id="g2048-over" className="t-h1 m-0">{gameWon ? 'You made 2048!' : 'No moves left'}</h3>
            <p className="t-sm c2 m-0">
              Score <span className="mono text-vault-50">{score.toLocaleString('en-US')}</span> · Best{' '}
              <span className="mono cgold">{best.toLocaleString('en-US')}</span>
            </p>
            <div className="flex gap-2.5">
              {gameWon && (
                <button type="button" onClick={() => setKeepPlaying(true)} className="btn btn-s">
                  Keep going
                </button>
              )}
              <button type="button" onClick={startNewGame} className="btn btn-p">
                {gameWon ? 'New game' : 'Try again'}
              </button>
            </div>
          </div>
        )}
      </div>

      <p className="t-sm c3 text-center mt-4 mb-0">Swipe to slide tiles. Matching numbers merge.</p>
    </div>
  );
};

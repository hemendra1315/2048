import React, { useState, useEffect, useCallback } from 'react';
import { RotateCcw, Flag, Award, Sparkles, Smile, Frown, Award as Trophy } from 'lucide-react';
import { useGame } from '../../context/GameContext';

interface Cell {
  r: number;
  c: number;
  isMine: boolean;
  isOpen: boolean;
  isFlagged: boolean;
  neighborMines: number;
}

const ROWS = 8;
const COLS = 8;
const MINES = 10;

export const GameMinesweeper: React.FC = () => {
  const { getHighScore, saveHighScore } = useGame();
  const [board, setBoard] = useState<Cell[][]>([]);
  const [gameOver, setGameOver] = useState(false);
  const [gameWon, setGameWon] = useState(false);
  const [flagMode, setFlagMode] = useState(false);
  const [flagsRemaining, setFlagsRemaining] = useState(MINES);
  const [timer, setTimer] = useState(0);
  const [timerActive, setTimerActive] = useState(false);

  const highScore = getHighScore('minesweeper');

  const createEmptyBoard = (): Cell[][] => {
    return Array.from({ length: ROWS }, (_, r) =>
      Array.from({ length: COLS }, (_, c) => ({
        r,
        c,
        isMine: false,
        isOpen: false,
        isFlagged: false,
        neighborMines: 0,
      }))
    );
  };

  const populateMines = (initialBoard: Cell[][], startR: number, startC: number): Cell[][] => {
    const next = initialBoard.map(row => row.map(cell => ({ ...cell })));
    let placed = 0;

    while (placed < MINES) {
      const r = Math.floor(Math.random() * ROWS);
      const c = Math.floor(Math.random() * COLS);

      // Don't place mine on starting click or neighbors
      if (Math.abs(r - startR) <= 1 && Math.abs(c - startC) <= 1) continue;
      if (next[r][c].isMine) continue;

      next[r][c].isMine = true;
      placed++;
    }

    // Count neighbor mines
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (next[r][c].isMine) continue;
        let count = 0;
        for (let dr = -1; dr <= 1; dr++) {
          for (let dc = -1; dc <= 1; dc++) {
            const nr = r + dr;
            const nc = c + dc;
            if (nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS && next[nr][nc].isMine) {
              count++;
            }
          }
        }
        next[r][c].neighborMines = count;
      }
    }
    return next;
  };

  const restartGame = useCallback(() => {
    setBoard(createEmptyBoard());
    setGameOver(false);
    setGameWon(false);
    setFlagsRemaining(MINES);
    setTimer(0);
    setTimerActive(false);
  }, []);

  useEffect(() => {
    restartGame();
  }, [restartGame]);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (timerActive && !gameOver && !gameWon) {
      interval = setInterval(() => setTimer(t => t + 1), 1000);
    }
    return () => clearInterval(interval);
  }, [timerActive, gameOver, gameWon]);

  const revealCell = (r: number, c: number) => {
    if (gameOver || gameWon) return;

    let currentBoard = board;
    if (!timerActive) {
      setTimerActive(true);
      currentBoard = populateMines(board, r, c);
    }

    const cell = currentBoard[r][c];
    if (cell.isFlagged || cell.isOpen) return;

    if (flagMode) {
      toggleFlag(r, c);
      return;
    }

    if (cell.isMine) {
      // Game Over: reveal all mines
      const revealed = currentBoard.map(row =>
        row.map(c => ({
          ...c,
          isOpen: c.isMine ? true : c.isOpen,
        }))
      );
      setBoard(revealed);
      setGameOver(true);
      setTimerActive(false);
      return;
    }

    // Flood fill empty regions
    const next = currentBoard.map(row => row.map(cl => ({ ...cl })));
    const queue: [number, number][] = [[r, c]];
    next[r][c].isOpen = true;

    while (queue.length > 0) {
      const [currR, currC] = queue.shift()!;
      if (next[currR][currC].neighborMines === 0) {
        for (let dr = -1; dr <= 1; dr++) {
          for (let dc = -1; dc <= 1; dc++) {
            const nr = currR + dr;
            const nc = currC + dc;
            if (nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS) {
              const neighbor = next[nr][nc];
              if (!neighbor.isOpen && !neighbor.isFlagged && !neighbor.isMine) {
                neighbor.isOpen = true;
                if (neighbor.neighborMines === 0) {
                  queue.push([nr, nc]);
                }
              }
            }
          }
        }
      }
    }

    // Check Win Condition
    let unrevealedSafe = 0;
    for (let row = 0; row < ROWS; row++) {
      for (let col = 0; col < COLS; col++) {
        if (!next[row][col].isMine && !next[row][col].isOpen) {
          unrevealedSafe++;
        }
      }
    }

    if (unrevealedSafe === 0) {
      setGameWon(true);
      setTimerActive(false);
      const finalScore = Math.max(10, 1000 - timer * 5);
      if (finalScore > highScore) {
        saveHighScore('minesweeper', finalScore);
      }
    }

    setBoard(next);
  };

  const toggleFlag = (r: number, c: number) => {
    if (gameOver || gameWon) return;
    const cell = board[r][c];
    if (cell.isOpen) return;

    if (!cell.isFlagged && flagsRemaining <= 0) return;

    const next = board.map(row => row.map(cl => ({ ...cl })));
    const target = next[r][c];
    target.isFlagged = !target.isFlagged;
    setFlagsRemaining(f => (target.isFlagged ? f - 1 : f + 1));
    setBoard(next);
  };

  const getNumberColor = (num: number) => {
    switch (num) {
      case 1: return 'text-cyan-400 font-bold';
      case 2: return 'text-emerald-400 font-bold';
      case 3: return 'text-rose-400 font-bold';
      case 4: return 'text-purple-400 font-bold';
      case 5: return 'text-amber-400 font-bold';
      default: return 'text-white font-bold';
    }
  };

  return (
    <div className="flex flex-col items-center w-full max-w-sm mx-auto select-none animate-fade-in">
      {/* Header Dashboard */}
      <div className="flex items-center justify-between w-full mb-3 px-1">
        <div className="flex items-center gap-2">
          <div className="bg-vault-900 border border-vault-700 px-3 py-1.5 rounded-xl text-center min-w-[64px]">
            <span className="text-[10px] font-mono text-vault-400 block">MINES</span>
            <span className="text-sm font-mono font-bold text-rose-400">{flagsRemaining}</span>
          </div>

          <button
            onClick={restartGame}
            className="p-2 rounded-xl bg-vault-900 hover:bg-vault-800 border border-vault-700 text-arcade-gold active:scale-95 transition-all shadow-md"
            title="Restart Game"
          >
            {gameOver ? <Frown className="w-5 h-5 text-rose-400" /> : gameWon ? <Trophy className="w-5 h-5 text-arcade-gold" /> : <Smile className="w-5 h-5" />}
          </button>

          <div className="bg-vault-900 border border-vault-700 px-3 py-1.5 rounded-xl text-center min-w-[64px]">
            <span className="text-[10px] font-mono text-vault-400 block">TIME</span>
            <span className="text-sm font-mono font-bold text-white">{timer}s</span>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setFlagMode(!flagMode)}
            className={`p-2 rounded-xl border transition-all active:scale-95 flex items-center gap-1 text-xs font-bold ${
              flagMode
                ? 'bg-rose-950 border-rose-500 text-rose-300'
                : 'bg-vault-900 border-vault-700 text-vault-400 hover:text-white'
            }`}
            title="Toggle Flagging Mode"
          >
            <Flag className="w-4 h-4 text-rose-400" />
            <span className="hidden sm:inline">{flagMode ? 'Flag ON' : 'Dig ON'}</span>
          </button>

          <button
            onClick={restartGame}
            className="p-2 rounded-xl bg-vault-900 hover:bg-vault-800 border border-vault-700 text-vault-400 hover:text-white"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Grid Board */}
      <div className="w-full aspect-square bg-vault-900/90 border-2 border-vault-700/80 rounded-2xl p-2.5 shadow-2xl flex flex-col justify-between relative">
        <div className="grid grid-cols-8 gap-1 w-full h-full">
          {board.map((row, r) =>
            row.map((cell, c) => (
              <button
                key={`${r}-${c}`}
                onClick={() => revealCell(r, c)}
                onContextMenu={e => {
                  e.preventDefault();
                  toggleFlag(r, c);
                }}
                className={`flex items-center justify-center rounded-lg text-xs font-mono transition-all active:scale-95 ${
                  cell.isOpen
                    ? cell.isMine
                      ? 'bg-rose-600 text-white animate-pulse'
                      : 'bg-vault-950/80 border border-vault-800/80'
                    : 'bg-vault-800 hover:bg-vault-750 border border-vault-700 text-vault-400 shadow-sm'
                }`}
              >
                {cell.isOpen ? (
                  cell.isMine ? (
                    '💣'
                  ) : cell.neighborMines > 0 ? (
                    <span className={getNumberColor(cell.neighborMines)}>{cell.neighborMines}</span>
                  ) : (
                    ''
                  )
                ) : cell.isFlagged ? (
                  <Flag className="w-3.5 h-3.5 text-rose-400 fill-rose-400" />
                ) : null}
              </button>
            ))
          )}
        </div>

        {/* Win/Lose Overlay */}
        {(gameOver || gameWon) && (
          <div className="absolute inset-0 bg-black/85 backdrop-blur-sm rounded-2xl flex flex-col items-center justify-center p-6 text-center animate-fade-in z-20">
            {gameWon ? (
              <>
                <Sparkles className="w-12 h-12 text-arcade-gold mb-2 animate-bounce" />
                <h3 className="text-xl font-bold text-white">Grid Cleared!</h3>
                <p className="text-xs text-vault-400 mt-1 mb-4">Completed in {timer} seconds.</p>
              </>
            ) : (
              <>
                <Frown className="w-12 h-12 text-rose-400 mb-2" />
                <h3 className="text-xl font-bold text-white">Detonation Triggered</h3>
                <p className="text-xs text-vault-400 mt-1 mb-4">A mine was struck.</p>
              </>
            )}

            <button
              onClick={restartGame}
              className="px-5 py-2.5 bg-arcade-gold hover:bg-amber-400 text-vault-950 font-bold rounded-xl text-xs shadow-lg transition-all"
            >
              Play Again
            </button>
          </div>
        )}
      </div>

      {/* High Score Footer */}
      <div className="w-full flex items-center justify-between text-[11px] font-mono text-vault-500 mt-3 px-1">
        <div className="flex items-center gap-1.5">
          <Award className="w-3.5 h-3.5 text-arcade-gold" />
          <span>BEST RECORD: {highScore > 0 ? `${highScore} PTS` : 'NONE'}</span>
        </div>
        <span>TAP TO DIG • HOLD/FLAG MODE</span>
      </div>
    </div>
  );
};

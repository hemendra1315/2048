import React, { useState } from 'react';
import { RotateCcw, Award, Users, Bot } from 'lucide-react';
import { useGame } from '../../context/GameContext';

type Player = 'X' | 'O';
type Board = (Player | null)[];

export const GameTicTacToe: React.FC = () => {
  const { getHighScore, saveHighScore } = useGame();
  const [board, setBoard] = useState<Board>(Array(9).fill(null));
  const [isXNext, setIsXNext] = useState(true);
  const [vsAI, setVsAI] = useState(true);
  const [wins, setWins] = useState(0);

  const highScore = getHighScore('tic_tac_toe');

  const checkWinner = (squares: Board): { winner: Player | 'DRAW' | null; line: number[] | null } => {
    const lines = [
      [0, 1, 2], [3, 4, 5], [6, 7, 8], // rows
      [0, 3, 6], [1, 4, 7], [2, 5, 8], // cols
      [0, 4, 8], [2, 4, 6],             // diags
    ];

    for (const [a, b, c] of lines) {
      if (squares[a] && squares[a] === squares[b] && squares[a] === squares[c]) {
        return { winner: squares[a], line: [a, b, c] };
      }
    }

    if (squares.every(s => s !== null)) {
      return { winner: 'DRAW', line: null };
    }

    return { winner: null, line: null };
  };

  const minimax = (squares: Board, depth: number, isMaximizing: boolean): number => {
    const res = checkWinner(squares);
    if (res.winner === 'O') return 10 - depth;
    if (res.winner === 'X') return depth - 10;
    if (res.winner === 'DRAW') return 0;

    if (isMaximizing) {
      let maxEval = -Infinity;
      for (let i = 0; i < 9; i++) {
        if (!squares[i]) {
          squares[i] = 'O';
          const evalScore = minimax(squares, depth + 1, false);
          squares[i] = null;
          maxEval = Math.max(maxEval, evalScore);
        }
      }
      return maxEval;
    } else {
      let minEval = Infinity;
      for (let i = 0; i < 9; i++) {
        if (!squares[i]) {
          squares[i] = 'X';
          const evalScore = minimax(squares, depth + 1, true);
          squares[i] = null;
          minEval = Math.min(minEval, evalScore);
        }
      }
      return minEval;
    }
  };

  const getBestMove = (squares: Board): number => {
    let bestScore = -Infinity;
    let move = -1;

    for (let i = 0; i < 9; i++) {
      if (!squares[i]) {
        squares[i] = 'O';
        const score = minimax(squares, 0, false);
        squares[i] = null;
        if (score > bestScore) {
          bestScore = score;
          move = i;
        }
      }
    }
    return move;
  };

  const handleCellClick = (index: number) => {
    const { winner } = checkWinner(board);
    if (winner || board[index]) return;

    const newBoard = [...board];
    newBoard[index] = 'X';
    setBoard(newBoard);

    const winResult = checkWinner(newBoard);
    if (winResult.winner === 'X') {
      const newWins = wins + 1;
      setWins(newWins);
      if (newWins > highScore) {
        saveHighScore('tic_tac_toe', newWins);
      }
      return;
    }

    if (winResult.winner) return;

    if (vsAI) {
      setIsXNext(false);
      setTimeout(() => {
        const aiMove = getBestMove(newBoard);
        if (aiMove !== -1) {
          newBoard[aiMove] = 'O';
          setBoard([...newBoard]);
          setIsXNext(true);
        }
      }, 250);
    } else {
      setIsXNext(!isXNext);
    }
  };

  const resetBoard = () => {
    setBoard(Array(9).fill(null));
    setIsXNext(true);
  };

  const { winner, line } = checkWinner(board);

  return (
    <div className="flex flex-col items-center w-full max-w-sm mx-auto select-none">
      {/* Header */}
      <div className="flex items-center justify-between w-full mb-3 px-1">
        <div className="flex gap-2">
          <div className="bg-vault-900/90 border border-vault-700/60 px-3.5 py-1.5 rounded-xl text-center min-w-[70px]">
            <div className="text-[10px] font-semibold text-vault-400 uppercase tracking-wider">WINS</div>
            <div className="text-base font-bold text-white leading-tight">{wins}</div>
          </div>
          <div className="bg-vault-900/90 border border-vault-700/60 px-3.5 py-1.5 rounded-xl text-center min-w-[70px]">
            <div className="text-[10px] font-semibold text-cyan-400 uppercase tracking-wider flex items-center justify-center gap-1">
              <Award className="w-3 h-3" /> BEST
            </div>
            <div className="text-base font-bold text-cyan-400 leading-tight">{Math.max(highScore, wins)}</div>
          </div>
        </div>

        <div className="flex gap-1.5">
          <button
            onClick={() => {
              setVsAI(!vsAI);
              resetBoard();
            }}
            className="flex items-center gap-1 bg-vault-800 hover:bg-vault-700 text-xs font-semibold px-2.5 py-1.5 rounded-xl text-vault-200 border border-vault-700"
          >
            {vsAI ? <Bot className="w-3.5 h-3.5 text-cyan-400" /> : <Users className="w-3.5 h-3.5 text-amber-400" />}
            <span>{vsAI ? 'AI' : '2P'}</span>
          </button>
          <button
            onClick={resetBoard}
            className="p-2 bg-vault-800 hover:bg-vault-700 text-vault-200 rounded-xl border border-vault-700"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* 3x3 Grid */}
      <div className="relative w-full aspect-square bg-vault-900 border-2 border-cyan-500/30 rounded-2xl p-3 shadow-2xl shadow-black/50 grid grid-cols-3 grid-rows-3 gap-2.5">
        {board.map((cell, idx) => {
          const isWinningCell = line?.includes(idx);
          return (
            <button
              key={idx}
              onClick={() => handleCellClick(idx)}
              className={`rounded-xl text-4xl font-bold flex items-center justify-center transition-all ${
                isWinningCell
                  ? 'bg-cyan-500 text-vault-950 shadow-lg shadow-cyan-500/50 scale-95'
                  : 'bg-vault-950/70 text-vault-100 hover:bg-vault-800/80 active:scale-95 border border-vault-800'
              }`}
            >
              {cell === 'X' && <span className="text-cyan-400">X</span>}
              {cell === 'O' && <span className="text-rose-400">O</span>}
            </button>
          );
        })}

        {/* Win / Draw Overlay */}
        {winner && (
          <div className="absolute inset-0 bg-vault-950/85 backdrop-blur-sm rounded-2xl flex flex-col items-center justify-center z-20 animate-fade-in p-4 text-center">
            <h3 className="text-2xl font-bold text-white mb-1">
              {winner === 'DRAW' ? 'Stalemate (Draw)' : `${winner} Victorious!`}
            </h3>
            <p className="text-xs text-vault-400 mb-4">
              {winner === 'X' ? 'You outmaneuvered the matrix' : 'Game cycle concluded'}
            </p>
            <button
              onClick={resetBoard}
              className="bg-cyan-500 hover:bg-cyan-400 text-vault-950 text-xs font-bold px-4 py-2.5 rounded-xl flex items-center gap-1.5 shadow-lg shadow-cyan-500/30"
            >
              <RotateCcw className="w-3.5 h-3.5" /> Next Round
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

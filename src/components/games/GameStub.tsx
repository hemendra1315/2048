import React, { useState } from 'react';
import { CoverGameType } from '../../types';
import { useGame, COVER_GAMES } from '../../context/GameContext';
import { Award, Play, RotateCcw, Sparkles } from 'lucide-react';

interface GameStubProps {
  gameId: CoverGameType;
}

export const GameStub: React.FC<GameStubProps> = ({ gameId }) => {
  const { getHighScore, saveHighScore } = useGame();
  const [score, setScore] = useState(0);
  const meta = COVER_GAMES.find(g => g.id === gameId);
  const highScore = getHighScore(gameId);

  const simulatePlay = () => {
    const gained = Math.floor(Math.random() * 25) + 10;
    const newScore = score + gained;
    setScore(newScore);
    if (newScore > highScore) {
      saveHighScore(gameId, newScore);
    }
  };

  const reset = () => {
    setScore(0);
  };

  return (
    <div className="flex flex-col items-center w-full max-w-sm mx-auto select-none">
      {/* Header */}
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
          onClick={reset}
          className="p-2 bg-vault-800 hover:bg-vault-700 text-vault-200 rounded-xl border border-vault-700"
        >
          <RotateCcw className="w-4 h-4" />
        </button>
      </div>

      {/* Game Shell Box */}
      <div className="relative w-full aspect-square bg-vault-900 border-2 border-vault-700/60 rounded-2xl p-6 shadow-2xl shadow-black/50 flex flex-col items-center justify-center text-center overflow-hidden">
        <div className={`w-16 h-16 rounded-2xl bg-gradient-to-br ${meta?.color || 'from-vault-700 to-vault-900'} flex items-center justify-center shadow-lg mb-3`}>
          <Sparkles className="w-8 h-8 text-white" />
        </div>

        <h3 className="text-xl font-bold text-white mb-1">{meta?.name || 'Game'}</h3>
        <p className="text-xs text-vault-400 max-w-xs mb-5">{meta?.tagline || ''}</p>

        <button
          onClick={simulatePlay}
          className="flex items-center gap-2 bg-gradient-to-r from-arcade-gold to-amber-500 hover:brightness-110 active:scale-95 text-vault-950 font-bold px-5 py-2.5 rounded-xl shadow-lg shadow-amber-500/20 text-sm transition-all"
        >
          <Play className="w-4 h-4 fill-current" />
          <span>Tap to Play</span>
        </button>

        <div className="mt-4 text-[11px] text-vault-500 font-mono">
          Coming soon
        </div>
      </div>
    </div>
  );
};

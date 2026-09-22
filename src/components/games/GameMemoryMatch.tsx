import React, { useState, useEffect, useCallback } from 'react';
import { RotateCcw, Award, Trophy } from 'lucide-react';
import { useGame } from '../../context/GameContext';

interface Card {
  id: number;
  symbol: string;
  flipped: boolean;
  matched: boolean;
}

const SYMBOLS = ['⚡', '🛡️', '💎', '🔑', '🚀', '👾', '🔥', '🌟'];

export const GameMemoryMatch: React.FC = () => {
  const { getHighScore, saveHighScore } = useGame();
  const [cards, setCards] = useState<Card[]>([]);
  const [flippedIndices, setFlippedIndices] = useState<number[]>([]);
  const [moves, setMoves] = useState(0);
  const [isWon, setIsWon] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  const highScore = getHighScore('memory_match');

  const initGame = useCallback(() => {
    const deck = [...SYMBOLS, ...SYMBOLS]
      .sort(() => Math.random() - 0.5)
      .map((symbol, idx) => ({
        id: idx,
        symbol,
        flipped: false,
        matched: false,
      }));
    setCards(deck);
    setFlippedIndices([]);
    setMoves(0);
    setIsWon(false);
    setIsProcessing(false);
  }, []);

  useEffect(() => {
    initGame();
  }, [initGame]);

  const handleCardClick = (index: number) => {
    if (isProcessing || cards[index].flipped || cards[index].matched || flippedIndices.includes(index)) {
      return;
    }

    const nextCards = cards.map((c, idx) => (idx === index ? { ...c, flipped: true } : c));
    setCards(nextCards);
    const nextFlipped = [...flippedIndices, index];
    setFlippedIndices(nextFlipped);

    if (nextFlipped.length === 2) {
      setMoves(m => m + 1);
      setIsProcessing(true);

      const [firstIdx, secondIdx] = nextFlipped;
      if (nextCards[firstIdx].symbol === nextCards[secondIdx].symbol) {
        // Matched
        setTimeout(() => {
          setCards(prev =>
            prev.map((c, i) => (i === firstIdx || i === secondIdx ? { ...c, matched: true } : c))
          );
          setFlippedIndices([]);
          setIsProcessing(false);

          // Check win
          const totalMatched = nextCards.filter(c => c.matched).length + 2;
          if (totalMatched === nextCards.length) {
            setIsWon(true);
            const finalScore = Math.max(10, 500 - (moves + 1) * 15);
            if (finalScore > highScore) {
              saveHighScore('memory_match', finalScore);
            }
          }
        }, 500);
      } else {
        // Not matched: flip back
        setTimeout(() => {
          setCards(prev =>
            prev.map((c, i) => (i === firstIdx || i === secondIdx ? { ...c, flipped: false } : c))
          );
          setFlippedIndices([]);
          setIsProcessing(false);
        }, 900);
      }
    }
  };

  return (
    <div className="flex flex-col items-center w-full max-w-sm mx-auto select-none animate-fade-in">
      {/* Header Dashboard */}
      <div className="flex items-center justify-between w-full mb-3 px-1">
        <div className="flex items-center gap-2">
          <div className="bg-vault-900 border border-vault-700 px-3.5 py-1.5 rounded-xl text-center min-w-[70px]">
            <span className="text-[10px] font-mono text-vault-400 block">MOVES</span>
            <span className="text-sm font-mono font-bold text-white">{moves}</span>
          </div>

          <div className="bg-vault-900 border border-vault-700 px-3.5 py-1.5 rounded-xl text-center min-w-[70px]">
            <span className="text-[10px] font-mono text-arcade-gold block">BEST</span>
            <span className="text-sm font-mono font-bold text-arcade-gold">{highScore > 0 ? highScore : '—'}</span>
          </div>
        </div>

        <button
          onClick={initGame}
          className="p-2 rounded-xl bg-vault-900 hover:bg-vault-800 border border-vault-700 text-vault-400 hover:text-white active:scale-95 transition-all shadow-md"
          title="Restart Game"
        >
          <RotateCcw className="w-4 h-4" />
        </button>
      </div>

      {/* 4x4 Grid Board */}
      <div className="w-full aspect-square bg-vault-900/90 border-2 border-vault-700/80 rounded-2xl p-3 shadow-2xl relative flex flex-col justify-between">
        <div className="grid grid-cols-4 gap-2 w-full h-full">
          {cards.map((card, idx) => {
            const isFlipped = card.flipped || card.matched;
            return (
              <button
                key={card.id}
                onClick={() => handleCardClick(idx)}
                className={`flex items-center justify-center rounded-xl text-2xl font-bold transition-all transform duration-300 ${
                  isFlipped
                    ? card.matched
                      ? 'bg-emerald-950/80 border-2 border-emerald-500 text-white shadow-emerald-500/20 shadow-md'
                      : 'bg-vault-800 border-2 border-arcade-gold text-white rotate-0'
                    : 'bg-vault-800 hover:bg-vault-750 border border-vault-700 active:scale-95'
                }`}
              >
                {isFlipped ? card.symbol : <span className="text-vault-600 text-sm font-mono">?</span>}
              </button>
            );
          })}
        </div>

        {/* Win Overlay */}
        {isWon && (
          <div className="absolute inset-0 bg-black/85 backdrop-blur-sm rounded-2xl flex flex-col items-center justify-center p-6 text-center animate-fade-in z-20">
            <Trophy className="w-12 h-12 text-arcade-gold mb-2 animate-bounce" />
            <h3 className="text-xl font-bold text-white">Memory Mastered!</h3>
            <p className="text-xs text-vault-400 mt-1 mb-4">All pairs matched in {moves} moves.</p>

            <button
              onClick={initGame}
              className="px-5 py-2.5 bg-arcade-gold hover:bg-amber-400 text-vault-950 font-bold rounded-xl text-xs shadow-lg transition-all"
            >
              Play Again
            </button>
          </div>
        )}
      </div>

      {/* Footer Info */}
      <div className="w-full flex items-center justify-between text-[11px] font-mono text-vault-500 mt-3 px-1">
        <div className="flex items-center gap-1.5">
          <Award className="w-3.5 h-3.5 text-arcade-gold" />
          <span>PAIRS: 8</span>
        </div>
        <span>TAP CARDS TO MATCH IDENTICAL NODES</span>
      </div>
    </div>
  );
};

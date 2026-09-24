import React from 'react';
import { X, Check, Gamepad2, Award } from 'lucide-react';
import { useGame, COVER_GAMES } from '../../context/GameContext';
import { CoverGameType } from '../../types';

interface GameSelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const GameSelectorModal: React.FC<GameSelectorModalProps> = ({ isOpen, onClose }) => {
  const { currentGame, setCurrentGame, getHighScore } = useGame();

  if (!isOpen) return null;

  const games = COVER_GAMES.filter(game => game.implemented);

  const handleSelect = (gameId: CoverGameType) => {
    setCurrentGame(gameId);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in">
      <div className="bg-vault-900 border border-vault-700/80 rounded-2xl w-full max-w-md max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-vault-800">
          <h3 className="text-base font-bold text-white">Games</h3>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-vault-400 hover:text-white hover:bg-vault-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Game Grid */}
        <div className="flex-1 overflow-y-auto p-4">
          <div className="grid grid-cols-2 gap-3">
            {games.map(game => {
              const isSelected = currentGame === game.id;
              const highScore = getHighScore(game.id);
              return (
                <button
                  key={game.id}
                  onClick={() => handleSelect(game.id)}
                  className={`relative flex flex-col items-center text-center p-3.5 rounded-2xl border transition-all ${
                    isSelected
                      ? 'bg-vault-800 border-arcade-gold/80 shadow-md shadow-arcade-gold/10'
                      : 'bg-vault-950/60 border-vault-800 hover:bg-vault-800/60 hover:border-vault-700'
                  }`}
                >
                  {isSelected && (
                    <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-arcade-gold text-vault-950 flex items-center justify-center shrink-0">
                      <Check className="w-3.5 h-3.5 stroke-[3]" />
                    </div>
                  )}

                  <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${game.color} flex items-center justify-center text-white shadow-sm mb-2`}>
                    <Gamepad2 className="w-6 h-6" />
                  </div>

                  <span className="text-sm font-bold text-white">{game.name}</span>

                  <div className="flex items-center gap-1 text-[11px] text-vault-400 mt-1">
                    <Award className="w-3 h-3 text-arcade-gold" />
                    <span>{highScore > 0 ? highScore : 'No score yet'}</span>
                  </div>

                  {isSelected && (
                    <span className="mt-1.5 text-[10px] font-semibold text-arcade-gold">Continue</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

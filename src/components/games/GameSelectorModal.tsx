import React from 'react';
import { X, Check, Gamepad2 } from 'lucide-react';
import { useGame, COVER_GAMES } from '../../context/GameContext';
import { CoverGameType } from '../../types';

interface GameSelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const GameSelectorModal: React.FC<GameSelectorModalProps> = ({ isOpen, onClose }) => {
  const { currentGame, setCurrentGame } = useGame();

  if (!isOpen) return null;

  const handleSelect = (gameId: CoverGameType) => {
    setCurrentGame(gameId);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in">
      <div className="bg-vault-900 border border-vault-700/80 rounded-2xl w-full max-w-md max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-vault-800">
          <div className="flex items-center gap-2">
            <Gamepad2 className="w-5 h-5 text-arcade-gold" />
            <h3 className="text-base font-bold text-white">Select Cover Game</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-vault-400 hover:text-white hover:bg-vault-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Game List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
          {COVER_GAMES.map(game => {
            const isSelected = currentGame === game.id;
            return (
              <button
                key={game.id}
                onClick={() => handleSelect(game.id)}
                className={`w-full flex items-center justify-between p-3.5 rounded-xl border text-left transition-all ${
                  isSelected
                    ? 'bg-vault-800 border-arcade-gold/80 shadow-md shadow-arcade-gold/10'
                    : 'bg-vault-950/60 border-vault-800 hover:bg-vault-800/60 hover:border-vault-700'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${game.color} flex items-center justify-center text-white font-bold shrink-0 shadow-sm`}>
                    <Gamepad2 className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-white">{game.name}</span>
                      {game.implemented && (
                        <span className="px-1.5 py-0.5 text-[9px] font-bold bg-emerald-950 text-emerald-300 border border-emerald-700/50 rounded-md">
                          PLAYABLE
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-vault-400 leading-tight mt-0.5">{game.tagline}</p>
                  </div>
                </div>

                {isSelected && (
                  <div className="w-6 h-6 rounded-full bg-arcade-gold text-vault-950 flex items-center justify-center shrink-0">
                    <Check className="w-4 h-4 stroke-[3]" />
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};

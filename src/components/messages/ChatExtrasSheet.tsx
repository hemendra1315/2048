import React, { useState } from 'react';
import { Check, Gamepad2, Smile, Trophy, X } from 'lucide-react';
import { STICKERS, CHAT_THEMES, ChatThemeId } from '../../lib/chatExtras';
import { COVER_GAMES, useGame } from '../../context/GameContext';

interface ChatExtrasSheetProps {
  canPlayGames: boolean;
  onClose: () => void;
  onSticker: (id: string) => void;
  onStartGame: () => void;
  onShareScore: (gameId: string, score: number) => void;
}

/** Stickers, and games you can play or brag about in this chat. */
export const ChatExtrasSheet: React.FC<ChatExtrasSheetProps> = ({ canPlayGames, onClose, onSticker, onStartGame, onShareScore }) => {
  const [tab, setTab] = useState<'stickers' | 'games'>('stickers');
  const { getHighScore } = useGame();
  const scored = COVER_GAMES.filter(g => g.implemented && g.id !== 'tic_tac_toe' && getHighScore(g.id) > 0);

  const tabClass = (active: boolean) =>
    `flex-1 min-h-[44px] rounded-xl text-sm font-bold flex items-center justify-center gap-2 ${active ? 'bg-vault-800 text-white' : 'text-vault-400'}`;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Stickers and games"
      className="fixed inset-0 z-50 bg-black/70 flex items-end sm:items-center justify-center anim-fade"
      onClick={onClose}
      onKeyDown={e => { if (e.key === 'Escape') onClose(); }}
    >
      <div className="w-full sm:max-w-md bg-vault-900 border border-vault-800 rounded-t-2xl sm:rounded-2xl p-2 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-2xl max-h-[75vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-1 p-1">
          <button type="button" className={tabClass(tab === 'stickers')} onClick={() => setTab('stickers')}>
            <Smile className="w-4 h-4" aria-hidden /> Stickers
          </button>
          <button type="button" className={tabClass(tab === 'games')} onClick={() => setTab('games')}>
            <Gamepad2 className="w-4 h-4" aria-hidden /> Games
          </button>
          <button type="button" onClick={onClose} className="ib ib-s rounded-full" aria-label="Close">
            <X className="i" />
          </button>
        </div>

        <div className="overflow-y-auto min-h-0 p-2">
          {tab === 'stickers' ? (
            <div className="grid grid-cols-4 gap-2">
              {STICKERS.map(s => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => onSticker(s.id)}
                  className="aspect-square rounded-2xl bg-vault-950 border border-vault-800 hover:border-emerald flex items-center justify-center active:scale-95 transition-transform"
                  aria-label={`Send sticker: ${s.label}`}
                  title={s.label}
                >
                  {s.kind === 'emoji' ? (
                    <span className="text-4xl">{s.art}</span>
                  ) : (
                    <span className="text-sm font-black text-emerald tracking-wide">{s.art}</span>
                  )}
                </button>
              ))}
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {canPlayGames && (
                <button
                  type="button"
                  onClick={onStartGame}
                  className="flex items-center gap-3 p-3 rounded-xl bg-vault-950 border border-vault-800 hover:border-emerald text-left min-h-[56px]"
                >
                  <Gamepad2 className="w-6 h-6 text-emerald" aria-hidden />
                  <span>
                    <span className="block text-sm font-bold text-white">Play Tic-Tac-Toe</span>
                    <span className="block text-xs text-vault-400">Challenge them right here in the chat. You go first.</span>
                  </span>
                </button>
              )}
              <p className="text-xs text-vault-400 mt-2 mb-0 px-1">Share your best score</p>
              {scored.length === 0 ? (
                <p className="text-xs text-vault-500 px-1 m-0">Play a game on the home screen to get a score you can share.</p>
              ) : (
                scored.map(g => (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => onShareScore(g.id, getHighScore(g.id))}
                    className="flex items-center justify-between gap-3 p-3 rounded-xl bg-vault-950 border border-vault-800 hover:border-emerald text-left min-h-[52px]"
                  >
                    <span className="flex items-center gap-3">
                      <Trophy className="w-5 h-5 text-amber-400" aria-hidden />
                      <span className="text-sm text-white">{g.name}</span>
                    </span>
                    <span className="text-sm font-bold text-emerald font-mono">{getHighScore(g.id)}</span>
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

interface ThemeSheetProps {
  current: ChatThemeId;
  onPick: (id: ChatThemeId) => void;
  onClose: () => void;
}

/** Colour theme for this chat. Only you see your choice. */
export const ChatThemeSheet: React.FC<ThemeSheetProps> = ({ current, onPick, onClose }) => (
  <div
    role="dialog"
    aria-modal="true"
    aria-label="Chat theme"
    className="fixed inset-0 z-50 bg-black/70 flex items-end sm:items-center justify-center anim-fade"
    onClick={onClose}
    onKeyDown={e => { if (e.key === 'Escape') onClose(); }}
  >
    <div className="w-full sm:max-w-sm bg-vault-900 border border-vault-800 rounded-t-2xl sm:rounded-2xl p-3 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-2xl" onClick={e => e.stopPropagation()}>
      <h3 className="t-body font-bold text-white m-0 px-1">Chat theme</h3>
      <p className="text-xs text-vault-400 mt-1 mb-3 px-1">Only you see the theme you pick for this chat.</p>
      <div className="grid grid-cols-4 gap-3">
        {CHAT_THEMES.map(t => (
          <button
            key={t.id}
            type="button"
            role="radio"
            aria-checked={current === t.id}
            onClick={() => onPick(t.id)}
            className="flex flex-col items-center gap-1.5"
          >
            <span className={`relative w-14 h-14 rounded-2xl ${t.wallpaper} border ${current === t.id ? 'border-white' : 'border-vault-750'} flex items-end justify-end p-1.5`}>
              <span className={`w-7 h-4 rounded-full ${t.swatch}`} />
              {current === t.id && <Check className="absolute top-1 left-1 w-4 h-4 text-white" aria-hidden />}
            </span>
            <span className="text-[11px] text-vault-300">{t.label}</span>
          </button>
        ))}
      </div>
    </div>
  </div>
);

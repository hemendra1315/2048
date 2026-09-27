import React, { useState } from 'react';
import { Check, Gamepad2, Smile, Trophy, X, ImagePlus, Trash2, Palette } from 'lucide-react';
import { STICKERS, CHAT_THEMES, ChatThemeId } from '../../lib/chatExtras';
import { COVER_GAMES, useGame } from '../../context/GameContext';
import { compressWallpaperFile } from '../../lib/chatWallpaper';
import { expectExternalActivity } from '../../lib/externalActivity';
import { lightImpact, selectionChange, errorWarning } from '../../lib/haptics';

interface ChatExtrasSheetProps {
  canPlayGames?: boolean;
  onClose: () => void;
  onSticker: (id: string) => void;
  onStartGame?: () => void;
  onShareScore: (gameId: string, score: number) => void;
}

/** Stickers, and game scores you can share in this chat. */
export const ChatExtrasSheet: React.FC<ChatExtrasSheetProps> = ({ onClose, onSticker, onShareScore }) => {
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
              <p className="text-xs text-vault-400 mt-1 mb-0 px-1 font-semibold uppercase tracking-wider">Share your best score</p>
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
  customWallpaper?: string | null;
  onPick: (id: ChatThemeId) => void;
  onSetCustomWallpaper?: (dataUrl: string) => void;
  onRemoveCustomWallpaper?: () => void;
  onClose: () => void;
}

/** Colour theme & custom wallpaper for this chat. Only you see your choice. */
export const ChatThemeSheet: React.FC<ThemeSheetProps> = ({
  current,
  customWallpaper,
  onPick,
  onSetCustomWallpaper,
  onRemoveCustomWallpaper,
  onClose,
}) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const wallpaperInputRef = React.useRef<HTMLInputElement>(null);

  const handleWallpaperFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !onSetCustomWallpaper) return;
    setIsProcessing(true);
    try {
      const compressed = await compressWallpaperFile(file);
      onSetCustomWallpaper(compressed);
      lightImpact();
    } catch (err) {
      console.error('Failed to set wallpaper:', err);
      errorWarning();
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Chat theme and wallpaper"
      className="fixed inset-0 z-50 bg-black/70 flex items-end sm:items-center justify-center anim-fade"
      onClick={onClose}
      onKeyDown={e => { if (e.key === 'Escape') onClose(); }}
    >
      <div className="w-full sm:max-w-md bg-vault-900 border border-vault-800 rounded-t-2xl sm:rounded-2xl p-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-2xl max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="w-9 h-1 rounded-full bg-vault-700 mx-auto mb-3 sm:hidden" aria-hidden />

        <div className="flex items-center justify-between pb-2 border-b border-vault-800">
          <div>
            <h3 className="t-body font-bold text-white m-0">Chat Wallpaper & Theme</h3>
            <p className="text-xs text-vault-400 mt-0.5 m-0">Personalize your chat background and bubble colors.</p>
          </div>
          <button type="button" onClick={onClose} className="ib ib-s rounded-full" aria-label="Close">
            <X className="i" />
          </button>
        </div>

        {/* 1. Custom Image Wallpaper Section */}
        <div className="mt-4">
          <input
            type="file"
            ref={wallpaperInputRef}
            onChange={handleWallpaperFile}
            accept="image/*"
            className="hidden"
            aria-label="Upload custom wallpaper"
          />

          <div className="text-xs font-bold text-vault-300 mb-2 uppercase tracking-wider flex items-center gap-1.5">
            <ImagePlus className="w-3.5 h-3.5 text-emerald" />
            <span>Custom Background Photo</span>
          </div>

          {customWallpaper ? (
            <div className="relative rounded-2xl overflow-hidden border border-emerald/50 bg-vault-950 p-3 flex items-center justify-between gap-3 shadow-lg">
              <div
                className="w-16 h-16 rounded-xl bg-cover bg-center border border-white/20 shrink-0 shadow-inner"
                style={{ backgroundImage: `url(${customWallpaper})` }}
              />
              <div className="min-w-0 flex-1">
                <span className="text-sm font-bold text-white block truncate">Custom Photo Active</span>
                <span className="text-xs text-emerald block">Applied to chat background</span>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    expectExternalActivity();
                    wallpaperInputRef.current?.click();
                  }}
                  disabled={isProcessing}
                  className="btn btn-s btn-sm text-xs py-1.5 px-3 min-h-[36px]"
                >
                  Change
                </button>
                {onRemoveCustomWallpaper && (
                  <button
                    type="button"
                    onClick={() => {
                      selectionChange();
                      onRemoveCustomWallpaper();
                    }}
                    className="ib ib-s rounded-xl text-rose-400 hover:text-rose-300 hover:bg-rose-950/40"
                    aria-label="Remove custom wallpaper"
                    title="Remove custom wallpaper"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => {
                expectExternalActivity();
                wallpaperInputRef.current?.click();
              }}
              disabled={isProcessing}
              className="w-full flex items-center justify-center gap-3 p-3.5 rounded-2xl bg-vault-950 border border-dashed border-vault-700 hover:border-emerald active:scale-98 transition-all text-left group"
            >
              <div className="w-10 h-10 rounded-xl bg-vault-900 group-hover:bg-emerald/10 border border-vault-750 group-hover:border-emerald/40 flex items-center justify-center text-vault-300 group-hover:text-emerald transition-colors">
                <ImagePlus className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <span className="text-sm font-bold text-white block group-hover:text-emerald transition-colors">
                  {isProcessing ? 'Processing image…' : 'Choose Wallpaper from Gallery'}
                </span>
                <span className="text-xs text-vault-400 block truncate">
                  Set any photo or aesthetic image as chat background
                </span>
              </div>
            </button>
          )}
        </div>

        {/* 2. Color & Gradient Themes */}
        <div className="mt-5">
          <div className="text-xs font-bold text-vault-300 mb-2.5 uppercase tracking-wider flex items-center gap-1.5">
            <Palette className="w-3.5 h-3.5 text-purple-400" />
            <span>Color & Bubble Style</span>
          </div>

          <div className="grid grid-cols-4 gap-3">
            {CHAT_THEMES.map(t => (
              <button
                key={t.id}
                type="button"
                role="radio"
                aria-checked={current === t.id}
                onClick={() => {
                  selectionChange();
                  onPick(t.id);
                }}
                className="flex flex-col items-center gap-1.5 group"
              >
                <span className={`relative w-14 h-14 rounded-2xl ${t.wallpaper} border ${current === t.id ? 'border-white ring-2 ring-purple-500/50' : 'border-vault-750 group-hover:border-vault-600'} flex items-end justify-end p-1.5 shadow-md transition-all active:scale-95`}>
                  <span className={`w-7 h-4 rounded-full ${t.swatch} shadow`} />
                  {current === t.id && <Check className="absolute top-1 left-1 w-4 h-4 text-white" aria-hidden />}
                </span>
                <span className={`text-[11px] font-medium ${current === t.id ? 'text-white' : 'text-vault-300'}`}>{t.label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};


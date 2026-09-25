/**
 * Chat extras: themes, stickers, score cards and voice-note waveforms.
 * Message formats (stored in messages.content):
 *   [STICKER:<id>]                  a sticker from STICKERS
 *   [SCORE:<gameId>:<score>]        "I scored N in <game>" card
 *   [GAME:tictactoe:<chat_games.id>] a Tic-Tac-Toe game (written only by start_chat_game)
 *   [VOICE_NOTE:<m:ss>|w=<levels>]<url>   voice note; w = 32 levels, one base-36 digit each
 * Full Tailwind class strings live here so the build keeps them.
 */

export type ChatThemeId = 'default' | 'midnight' | 'ocean' | 'sunset' | 'forest' | 'rose' | 'mono';

export interface ChatTheme {
  id: ChatThemeId;
  label: string;
  /** Background of the message list. */
  wallpaper: string;
  /** Your own bubbles. */
  mine: string;
  /** Small colour sample for the picker. */
  swatch: string;
}

export const CHAT_THEMES: ChatTheme[] = [
  { id: 'default', label: 'Emerald', wallpaper: 'bg-vault-950', mine: 'bg-[#10B981] text-[#04120C]', swatch: 'bg-[#10B981]' },
  { id: 'midnight', label: 'Midnight', wallpaper: 'bg-gradient-to-b from-[#0B1026] to-[#050505]', mine: 'bg-[#6366F1] text-white', swatch: 'bg-[#6366F1]' },
  { id: 'ocean', label: 'Ocean', wallpaper: 'bg-gradient-to-b from-[#03202B] to-[#050505]', mine: 'bg-[#0EA5E9] text-[#03131C]', swatch: 'bg-[#0EA5E9]' },
  { id: 'sunset', label: 'Sunset', wallpaper: 'bg-gradient-to-b from-[#2A1208] to-[#050505]', mine: 'bg-[#F97316] text-[#1F0B02]', swatch: 'bg-[#F97316]' },
  { id: 'forest', label: 'Forest', wallpaper: 'bg-gradient-to-b from-[#0A1F12] to-[#050505]', mine: 'bg-[#22C55E] text-[#04120C]', swatch: 'bg-[#22C55E]' },
  { id: 'rose', label: 'Rose', wallpaper: 'bg-gradient-to-b from-[#2A0A17] to-[#050505]', mine: 'bg-[#F43F5E] text-white', swatch: 'bg-[#F43F5E]' },
  { id: 'mono', label: 'Mono', wallpaper: 'bg-[#0C0C0C]', mine: 'bg-[#E4E6E9] text-[#0C0D0F]', swatch: 'bg-[#E4E6E9]' },
];

export const themeById = (id: string | null | undefined): ChatTheme =>
  CHAT_THEMES.find(t => t.id === id) ?? CHAT_THEMES[0];

export interface Sticker {
  id: string;
  /** Big emoji, or short text for word stickers. */
  art: string;
  label: string;
  kind: 'emoji' | 'word';
}

export const STICKERS: Sticker[] = [
  { id: 'love', art: '😍', label: 'Love it', kind: 'emoji' },
  { id: 'lol', art: '🤣', label: 'LOL', kind: 'emoji' },
  { id: 'hug', art: '🤗', label: 'Hug', kind: 'emoji' },
  { id: 'wink', art: '😉', label: 'Wink', kind: 'emoji' },
  { id: 'cool', art: '😎', label: 'Cool', kind: 'emoji' },
  { id: 'wow', art: '🤯', label: 'Mind blown', kind: 'emoji' },
  { id: 'cry', art: '😭', label: 'Crying', kind: 'emoji' },
  { id: 'angry', art: '😤', label: 'Annoyed', kind: 'emoji' },
  { id: 'sleep', art: '😴', label: 'Sleepy', kind: 'emoji' },
  { id: 'party', art: '🥳', label: 'Party', kind: 'emoji' },
  { id: 'think', art: '🤔', label: 'Hmm', kind: 'emoji' },
  { id: 'shh', art: '🤫', label: 'Secret', kind: 'emoji' },
  { id: 'heart', art: '💖', label: 'Heart', kind: 'emoji' },
  { id: 'fire', art: '🔥', label: 'Fire', kind: 'emoji' },
  { id: 'hundred', art: '💯', label: '100', kind: 'emoji' },
  { id: 'clap', art: '👏', label: 'Clap', kind: 'emoji' },
  { id: 'ghost', art: '👻', label: 'Ghost', kind: 'emoji' },
  { id: 'game', art: '🎮', label: 'Game on', kind: 'emoji' },
  { id: 'trophy', art: '🏆', label: 'Winner', kind: 'emoji' },
  { id: 'rocket', art: '🚀', label: 'Let’s go', kind: 'emoji' },
  { id: 'gg', art: 'GG', label: 'Good game', kind: 'word' },
  { id: 'brb', art: 'BRB', label: 'Be right back', kind: 'word' },
  { id: 'omw', art: 'OMW', label: 'On my way', kind: 'word' },
  { id: 'gn', art: 'GN 🌙', label: 'Good night', kind: 'word' },
];

export const stickerById = (id: string): Sticker | undefined => STICKERS.find(s => s.id === id);

export const parseSticker = (content: string): Sticker | undefined => {
  const m = content.match(/^\[STICKER:([a-z0-9_-]+)\]$/);
  return m ? stickerById(m[1]) : undefined;
};

export const parseScore = (content: string): { gameId: string; score: number } | undefined => {
  const m = content.match(/^\[SCORE:([a-z0-9_]+):(\d{1,9})\]$/);
  return m ? { gameId: m[1], score: Number(m[2]) } : undefined;
};

export const parseGame = (content: string): { type: 'tictactoe'; id: string } | undefined => {
  const m = content.match(/^\[GAME:tictactoe:([0-9a-f-]{36})\]$/);
  return m ? { type: 'tictactoe', id: m[1] } : undefined;
};

export interface VoiceNote {
  duration: string;
  levels: number[] | null;
  url: string;
}

export const parseVoiceNote = (content: string): VoiceNote | undefined => {
  const m = content.match(/^\[VOICE_NOTE:([^|\]]*)(?:\|w=([0-9a-z]+))?\](.*)$/);
  if (!m) return undefined;
  const levels = m[2] ? [...m[2]].map(c => parseInt(c, 36) / 35) : null;
  return { duration: m[1] || '0:00', levels, url: m[3] };
};

export const WAVEFORM_BARS = 32;

/** Loudness of a recording in WAVEFORM_BARS buckets, as base-36 digits ("" if it can't be decoded). */
export async function computeWaveform(blob: Blob): Promise<string> {
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AudioCtx();
    try {
      const audio = await ctx.decodeAudioData(await blob.arrayBuffer());
      const data = audio.getChannelData(0);
      const size = Math.max(1, Math.floor(data.length / WAVEFORM_BARS));
      const peaks: number[] = [];
      for (let b = 0; b < WAVEFORM_BARS; b++) {
        let sum = 0;
        const start = b * size;
        const end = Math.min(data.length, start + size);
        for (let i = start; i < end; i++) sum += data[i] * data[i];
        peaks.push(Math.sqrt(sum / Math.max(1, end - start)));
      }
      const max = Math.max(...peaks, 1e-6);
      return peaks.map(p => Math.round((p / max) * 35).toString(36)).join('');
    } finally {
      void ctx.close();
    }
  } catch {
    return '';
  }
}

/** Short description for chat-list previews and reply quotes. */
export function extraPreview(content: string): string | undefined {
  if (parseSticker(content)) return 'Sticker';
  const score = parseScore(content);
  if (score) return `🏆 Score: ${score.score}`;
  if (content.startsWith('[GAME:')) return '🎮 Tic-Tac-Toe';
  return undefined;
}

/** System notices ("[SYSTEM:disappearing:86400]") are written by the server, never typed by a user. */
export const isSystemMessage = (content: string): boolean => content.startsWith('[SYSTEM:');

export function timerLabel(seconds: number): string {
  return seconds >= 604800 ? '7 days' : '24 hours';
}

/** "[SYSTEM:disappearing:86400]" → "turned on disappearing messages (24 hours)". */
export function systemMessageText(content: string): string {
  const m = content.match(/^\[SYSTEM:disappearing:(\w+)\]$/);
  if (m) {
    return m[1] === 'off'
      ? 'turned off disappearing messages'
      : `turned on disappearing messages (${timerLabel(Number(m[1]))})`;
  }
  return 'updated the chat';
}

/**
 * Reads like a chat bubble, never a raw content string: "📷 Photo", "🎤 Voice message",
 * "Sticker", "someone turned on disappearing messages (24 hours)" and so on. Used anywhere a
 * message needs to be summarised in one line — chat-list previews, reply quotes, and admin views.
 */
export function readableMessagePreview(content: string): string {
  if (content === '[DELETED]') return 'Deleted message';
  if (isSystemMessage(content)) return systemMessageText(content).replace(/^./, c => c.toUpperCase());
  const extra = extraPreview(content);
  if (extra) return extra;
  if (content.startsWith('[IMAGE]')) return '📷 Photo';
  if (content.startsWith('[VOICE_NOTE')) return '🎤 Voice message';
  return content;
}

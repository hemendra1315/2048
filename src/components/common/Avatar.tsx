import React, { useEffect, useState } from 'react';

const HUES = ['#C9B6F2', '#F2C6A0', '#9ED8C8', '#A9C7F5', '#F0B3C0', '#E6DB9A'];

function hueFor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return HUES[h % HUES.length];
}

// Old accounts stored generated avatars from api.dicebear.com. Loading them sent the user's ID to a
// third party, so they're treated as "no photo" (migration 20260924000015 also clears them).
const isExternalGeneratedAvatar = (src: string) => src.startsWith('https://api.dicebear.com/');

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

interface AvatarProps {
  name: string;
  seed?: string;
  src?: string | null;
  size?: 32 | 40 | 48 | 56 | 72 | 96;
  online?: boolean;
  className?: string;
}

const sizeClasses: Record<number, string> = {
  32: 'w-8 h-8 text-xs',
  40: 'w-10 h-10 text-sm',
  48: 'w-12 h-12 text-base',
  56: 'w-14 h-14 text-lg',
  72: 'w-[72px] h-[72px] text-2xl',
  96: 'w-24 h-24 text-3xl',
};

/** Round avatar: the user's photo when set, otherwise initials on a pastel fill. Decorative by default. */
export const Avatar: React.FC<AvatarProps> = ({ name, seed, src, size = 48, online = false, className = '' }) => {
  const [imgError, setImgError] = useState(false);
  const photo = src && !isExternalGeneratedAvatar(src) ? src : null;
  // A new photo (for example right after changing it) gets a fresh load attempt.
  useEffect(() => setImgError(false), [src]);
  const dot = size >= 56 ? 14 : size >= 40 ? 12 : 10;
  const bg = hueFor(seed || name);
  const sizeCls = sizeClasses[size] || 'w-12 h-12 text-base';

  return (
    <span
      aria-hidden="true"
      className={`relative inline-flex shrink-0 items-center justify-center rounded-full select-none ${sizeCls} ${className}`}
      style={{
        backgroundColor: bg,
        minWidth: `${size}px`,
        minHeight: `${size}px`,
        maxWidth: `${size}px`,
        maxHeight: `${size}px`,
      }}
    >
      <span className="w-full h-full rounded-full overflow-hidden flex items-center justify-center">
        {photo && !imgError ? (
          <img
            src={photo}
            alt=""
            onError={() => setImgError(true)}
            className="w-full h-full object-cover"
          />
        ) : (
          <span className="font-bold select-none text-[#0A0A0A] leading-none">{initials(name)}</span>
        )}
      </span>
      {online && (
        <span
          className="absolute right-0 bottom-0 rounded-full bg-[#10B981] border-[#050505]"
          style={{ width: dot, height: dot, borderWidth: dot >= 14 ? 3 : 2 }}
        />
      )}
    </span>
  );
};

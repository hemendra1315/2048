import React from 'react';

const HUES = ['#C9B6F2', '#F2C6A0', '#9ED8C8', '#A9C7F5', '#F0B3C0', '#E6DB9A'];

function hueFor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return HUES[h % HUES.length];
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

interface AvatarProps {
  name: string;
  seed?: string;
  src?: string | null;
  size?: 32 | 40 | 48 | 56 | 96;
  online?: boolean;
  className?: string;
}

/** Round avatar: the user's photo when set, otherwise initials on a pastel fill. Decorative by default. */
export const Avatar: React.FC<AvatarProps> = ({ name, seed, src, size = 48, online = false, className = '' }) => {
  const dot = size >= 56 ? 14 : size >= 40 ? 12 : 10;
  return (
    <span
      aria-hidden="true"
      className={`av av-${size} ${className}`}
      style={src ? undefined : { background: hueFor(seed || name) }}
    >
      {src ? (
        <img src={src} alt="" className="w-full h-full rounded-full object-cover" />
      ) : (
        initials(name)
      )}
      {online && <span className="on" style={{ width: dot, height: dot, borderWidth: dot >= 14 ? 3 : 2 }} />}
    </span>
  );
};

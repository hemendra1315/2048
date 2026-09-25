import type { SyntheticEvent } from 'react';
import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatTimestamp(isoString: string): string {
  if (!isoString) return '';
  const date = new Date(isoString);
  const now = new Date();
  
  const isToday = date.toDateString() === now.toDateString();
  if (isToday) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  const isThisYear = date.getFullYear() === now.getFullYear();
  if (isThisYear) {
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  }

  return date.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
}

export function formatDetailedDate(isoString: string): string {
  if (!isoString) return '';
  const date = new Date(isoString);
  return date.toLocaleString([], {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
}

// Fallback avatar for a user with no uploaded photo, keyed by a stable seed (their UID).
export function getAvatarUrl(seed: string): string {
  return `https://api.dicebear.com/7.x/notionists/svg?seed=${encodeURIComponent(seed)}`;
}

// Converts a data: URL (e.g. a canvas.toDataURL() capture) into a Blob for storage upload.
export async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const res = await fetch(dataUrl);
  return res.blob();
}

// A subtle placeholder shown in place of a broken/failed-to-load photo thumbnail.
export const BROKEN_IMAGE_PLACEHOLDER =
  'data:image/svg+xml,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 24 24">` +
      `<rect width="24" height="24" fill="#171717"/>` +
      `<path d="M4 16l4.5-6 3 4 2.5-3L20 16" stroke="#3f3f46" stroke-width="1.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>` +
      `<circle cx="8" cy="8" r="1.6" fill="#3f3f46"/>` +
      `</svg>`
  );

// Swaps a broken <img> to the placeholder once, instead of leaving the browser's broken-image icon.
export function handleImageError(e: SyntheticEvent<HTMLImageElement>): void {
  const img = e.currentTarget;
  img.onerror = null;
  img.src = BROKEN_IMAGE_PLACEHOLDER;
}

// SHA-256 hash with salt (used for high-entropy recovery keys and the offline mock backend)
export async function hashSecret(secret: string): Promise<string> {
  const msgUint8 = new TextEncoder().encode(secret + '_vault_salt_2026');
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// Passwords are never hashed in the browser: they are sent over HTTPS and hashed with bcrypt on the server.

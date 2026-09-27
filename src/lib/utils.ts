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

/** "Today", "Yesterday", or a full date - the day-group heading for an activity/event list. */
export function formatDayHeading(isoString: string): string {
  if (!isoString) return '';
  const date = new Date(isoString);
  const now = new Date();
  if (date.toDateString() === now.toDateString()) return 'Today';
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return date.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric', year: date.getFullYear() === now.getFullYear() ? undefined : 'numeric' });
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

// Generate unique, human-readable UID (e.g. CIPHER-4921)
export function generateUniqueUID(): string {
  const prefixes = ['CIPHER', 'VAULT', 'NEXUS', 'SHADOW', 'STEALTH', 'PRISM', 'AEGIS', 'PHANTOM'];
  const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];
  const num = Math.floor(1000 + Math.random() * 9000);
  return `${prefix}-${num}`;
}

// Generate cryptographically secure recovery code (e.g. RC-7F9A-4B2E-89D1)
export function generateRecoveryCode(): string {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes).map(b => b.toString(16).toUpperCase().padStart(2, '0')).join('');
  return `RC-${hex.slice(0, 4)}-${hex.slice(4, 8)}-${hex.slice(8, 12)}`;
}

const MOCK_SALT_KEY = 'vault_mock_hash_salt';

/**
 * A random salt generated once per browser/install and persisted in localStorage, instead
 * of a fixed value shared by every install of the app. Only used by the offline mock
 * backend (see below) -- that backend's whole state already lives in this same browser's
 * localStorage in the clear, so there's no "leaked database" scenario a salt defends
 * against here; this just avoids every install computing identical hashes for identical
 * secrets, which a fixed hardcoded salt would otherwise allow.
 */
function mockSalt(): string {
  try {
    let salt = localStorage.getItem(MOCK_SALT_KEY);
    if (!salt) {
      const bytes = new Uint8Array(16);
      crypto.getRandomValues(bytes);
      salt = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
      localStorage.setItem(MOCK_SALT_KEY, salt);
    }
    return salt;
  } catch {
    // localStorage unavailable (e.g. private browsing edge case) -- fall back to a fixed
    // salt so hashing still works within this single page session.
    return '_vault_salt_2026';
  }
}

// SHA-256 hash with salt (used for high-entropy recovery keys and the offline mock backend)
export async function hashSecret(secret: string): Promise<string> {
  const msgUint8 = new TextEncoder().encode(secret + mockSalt());
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// Passwords are never hashed in the browser: they are sent over HTTPS and hashed with bcrypt on the server.

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

// SHA-256 hash with salt (used for high-entropy recovery keys and the offline mock backend)
export async function hashSecret(secret: string): Promise<string> {
  const msgUint8 = new TextEncoder().encode(secret + '_vault_salt_2026');
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// Passwords are never hashed in the browser: they are sent over HTTPS and hashed with bcrypt on the server.

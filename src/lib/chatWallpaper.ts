/**
 * Chat Wallpaper Manager
 * Allows users to set any custom photo as their chat background per conversation.
 * Handles client-side compression to ensure fast loading and offline persistence in localStorage.
 */

const WALLPAPER_KEY_PREFIX = 'vault_chat_wallpaper_';

export function getCustomWallpaper(conversationId: string): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return localStorage.getItem(`${WALLPAPER_KEY_PREFIX}${conversationId}`);
  } catch {
    return null;
  }
}

export function setCustomWallpaper(conversationId: string, dataUrl: string): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(`${WALLPAPER_KEY_PREFIX}${conversationId}`, dataUrl);
  } catch (err) {
    console.warn('[wallpaper] Failed to save custom wallpaper:', err);
  }
}

export function removeCustomWallpaper(conversationId: string): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(`${WALLPAPER_KEY_PREFIX}${conversationId}`);
  } catch {
    // Ignore storage errors
  }
}

/**
 * Compresses an image file into a fast-loading JPEG DataURL (max 1600px dimension, ~0.82 quality)
 * to keep offline localStorage usage lightweight and performance smooth.
 */
export async function compressWallpaperFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => {
      const img = new Image();
      img.onload = () => {
        const MAX_DIM = 1600;
        let width = img.width;
        let height = img.height;

        if (width > MAX_DIM || height > MAX_DIM) {
          if (width > height) {
            height = Math.round((height * MAX_DIM) / width);
            width = MAX_DIM;
          } else {
            width = Math.round((width * MAX_DIM) / height);
            height = MAX_DIM;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(e.target?.result as string);
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);
        const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.82);
        resolve(compressedDataUrl);
      };
      img.onerror = () => reject(new Error('Failed to load image for compression'));
      img.src = e.target?.result as string;
    };
    reader.onerror = () => reject(new Error('Failed to read image file'));
    reader.readAsDataURL(file);
  });
}

/**
 * Chat Wallpaper Manager
 * Allows users to set any custom photo as their chat background per conversation.
 * Handles client-side compression, cloud upload to Supabase Storage, and cross-device sync.
 */
import { supabase, isSupabaseConfigured } from './supabase';
import { uploadChatMedia } from './storageHelper';

const WALLPAPER_KEY_PREFIX = 'vault_chat_wallpaper_';

export function getCustomWallpaper(conversationId: string): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return localStorage.getItem(`${WALLPAPER_KEY_PREFIX}${conversationId}`);
  } catch {
    return null;
  }
}

export function setCustomWallpaperLocal(conversationId: string, urlOrData: string): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(`${WALLPAPER_KEY_PREFIX}${conversationId}`, urlOrData);
  } catch (err) {
    console.warn('[wallpaper] Failed to save custom wallpaper locally:', err);
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
 * Uploads custom wallpaper to cloud and syncs across all devices for this user.
 */
export async function syncCustomWallpaper(
  _userId: string,
  conversationId: string,
  dataUrlOrFile: string | File
): Promise<string> {
  let finalUrl = typeof dataUrlOrFile === 'string' ? dataUrlOrFile : '';

  if (isSupabaseConfigured()) {
    try {
      finalUrl = await uploadChatMedia(dataUrlOrFile, `wallpapers_${conversationId}`, 'jpg');
      await supabase.rpc('set_conversation_wallpaper', {
        p_conversation_id: conversationId,
        p_wallpaper_url: finalUrl,
      });
    } catch (err) {
      console.warn('[wallpaper] Remote sync error, using local fallback:', err);
    }
  }

  setCustomWallpaperLocal(conversationId, finalUrl);
  return finalUrl;
}

/**
 * Removes custom wallpaper and syncs deletion across devices.
 */
export async function removeAndSyncCustomWallpaper(
  _userId: string,
  conversationId: string
): Promise<void> {
  removeCustomWallpaper(conversationId);

  if (isSupabaseConfigured()) {
    try {
      await supabase.rpc('set_conversation_wallpaper', {
        p_conversation_id: conversationId,
        p_wallpaper_url: null,
      });
    } catch (err) {
      console.warn('[wallpaper] Remote remove error:', err);
    }
  }
}

/**
 * Migrates any legacy base64 wallpapers trapped in localStorage to Cloud URLs.
 */
export async function migrateLocalWallpapersToCloud(_userId?: string): Promise<number> {
  if (typeof window === 'undefined' || !isSupabaseConfigured()) return 0;
  let migratedCount = 0;

  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(WALLPAPER_KEY_PREFIX)) {
        const conversationId = key.replace(WALLPAPER_KEY_PREFIX, '');
        const val = localStorage.getItem(key);
        if (val && val.startsWith('data:image')) {
          try {
            const url = await uploadChatMedia(val, `wallpapers_${conversationId}`, 'jpg');
            await supabase.rpc('set_conversation_wallpaper', {
              p_conversation_id: conversationId,
              p_wallpaper_url: url,
            });
            localStorage.setItem(key, url);
            migratedCount++;
          } catch (err) {
            console.warn('[wallpaper] migration failed for conv:', conversationId, err);
          }
        }
      }
    }
  } catch (err) {
    console.warn('[wallpaper] global migration failed:', err);
  }

  return migratedCount;
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
        const compressed = canvas.toDataURL('image/jpeg', 0.82);
        resolve(compressed);
      };
      img.onerror = () => reject(new Error('Failed to load image for compression'));
      img.src = e.target?.result as string;
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

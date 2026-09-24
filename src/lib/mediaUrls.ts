import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase, isSupabaseConfigured } from './supabase';
import type { GalleryItem } from '../types';

/**
 * Gallery files live in the private `gallery` bucket. A private object has no public URL:
 * `getPublicUrl()` returns a link that the storage API rejects, which is why photos rendered
 * as black tiles. Every view must render a short-lived signed URL created for the object path.
 */
export const GALLERY_BUCKET = 'gallery';

const SIGNED_URL_TTL_SECONDS = 60 * 60;
/** Refresh a cached URL this long before it expires so an open screen never shows a dead link. */
const REFRESH_MARGIN_MS = 5 * 60 * 1000;

interface CachedUrl {
  url: string;
  expiresAt: number;
}

const signedUrlCache = new Map<string, CachedUrl>();

function cacheKey(bucket: string, path: string): string {
  return `${bucket}/${path}`;
}

function readCache(bucket: string, path: string): string | null {
  const hit = signedUrlCache.get(cacheKey(bucket, path));
  if (!hit) return null;
  if (hit.expiresAt - REFRESH_MARGIN_MS <= Date.now()) {
    signedUrlCache.delete(cacheKey(bucket, path));
    return null;
  }
  return hit.url;
}

/**
 * Returns the URL an <img> should load for a gallery row.
 * - Data URLs and links outside our storage are used as they are.
 * - Objects in the private bucket are signed (see `resolveGalleryUrls`).
 */
export function needsSigning(item: Pick<GalleryItem, 'image_url' | 'storage_path'>): boolean {
  if (!isSupabaseConfigured()) return false;
  if (!item.storage_path) return false;
  const url = item.image_url || '';
  if (url.startsWith('data:') || url.startsWith('blob:')) return false;
  if (url === '') return true;
  // Rows written by the app store the (unusable) public URL of the private bucket.
  return url.includes(`/storage/v1/object/public/${GALLERY_BUCKET}/`) || url.includes(`/storage/v1/object/sign/${GALLERY_BUCKET}/`);
}

/**
 * Creates signed URLs for many storage paths in one request, reusing cached URLs.
 * Returns a map of path -> signed URL. Paths the server could not sign are absent from the map.
 */
export async function signStoragePaths(bucket: string, paths: string[]): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  const missing: string[] = [];
  for (const path of new Set(paths)) {
    const cached = readCache(bucket, path);
    if (cached) result.set(path, cached);
    else missing.push(path);
  }
  if (missing.length === 0) return result;

  const { data, error } = await supabase.storage.from(bucket).createSignedUrls(missing, SIGNED_URL_TTL_SECONDS);
  if (error) throw error;

  const expiresAt = Date.now() + SIGNED_URL_TTL_SECONDS * 1000;
  for (const entry of data ?? []) {
    if (entry.path && entry.signedUrl && !entry.error) {
      signedUrlCache.set(cacheKey(bucket, entry.path), { url: entry.signedUrl, expiresAt });
      result.set(entry.path, entry.signedUrl);
    }
  }
  return result;
}

export type MediaUrlState =
  | { status: 'loading' }
  | { status: 'ready'; url: string }
  | { status: 'error' };

/**
 * Resolves displayable URLs for a list of gallery rows.
 * `retry(path)` discards the cached URL for one object (for example after the image failed to
 * load because the link expired) and signs it again; `retry()` does the same for every failure.
 */
export function useGalleryUrls(items: GalleryItem[]): {
  urls: Record<string, MediaUrlState>;
  retry: (storagePath?: string) => void;
} {
  const [signed, setSigned] = useState<Record<string, string>>({});
  const [failed, setFailed] = useState<Record<string, true>>({});
  const [attempt, setAttempt] = useState(0);

  // A stable key so the effect only re-runs when the set of objects to sign changes.
  const pathsKey = useMemo(
    () => items.filter(needsSigning).map(i => i.storage_path).sort().join('|'),
    [items],
  );

  useEffect(() => {
    const paths = pathsKey ? pathsKey.split('|') : [];
    if (paths.length === 0) return;
    let cancelled = false;

    signStoragePaths(GALLERY_BUCKET, paths)
      .then(map => {
        if (cancelled) return;
        const nextSigned: Record<string, string> = {};
        const nextFailed: Record<string, true> = {};
        for (const path of paths) {
          const url = map.get(path);
          if (url) nextSigned[path] = url;
          else nextFailed[path] = true;
        }
        setSigned(prev => ({ ...prev, ...nextSigned }));
        setFailed(prev => {
          const merged: Record<string, true> = { ...prev, ...nextFailed };
          for (const path of Object.keys(nextSigned)) delete merged[path];
          return merged;
        });
      })
      .catch(err => {
        if (cancelled) return;
        console.error('[media] could not sign gallery URLs', err);
        const nextFailed: Record<string, true> = {};
        for (const path of paths) nextFailed[path] = true;
        setFailed(prev => ({ ...prev, ...nextFailed }));
      });

    return () => {
      cancelled = true;
    };
  }, [pathsKey, attempt]);

  const urls = useMemo(() => {
    const out: Record<string, MediaUrlState> = {};
    for (const item of items) {
      if (!needsSigning(item)) {
        out[item.id] = item.image_url ? { status: 'ready', url: item.image_url } : { status: 'error' };
      } else if (signed[item.storage_path]) {
        out[item.id] = { status: 'ready', url: signed[item.storage_path] };
      } else if (failed[item.storage_path]) {
        out[item.id] = { status: 'error' };
      } else {
        out[item.id] = { status: 'loading' };
      }
    }
    return out;
  }, [items, signed, failed]);

  const retry = useCallback((storagePath?: string) => {
    setFailed(prev => {
      const targets = storagePath ? [storagePath] : Object.keys(prev);
      for (const path of targets) signedUrlCache.delete(cacheKey(GALLERY_BUCKET, path));
      if (!storagePath) return {};
      const next = { ...prev };
      delete next[storagePath];
      return next;
    });
    if (storagePath) {
      signedUrlCache.delete(cacheKey(GALLERY_BUCKET, storagePath));
      setSigned(prev => {
        const next = { ...prev };
        delete next[storagePath];
        return next;
      });
    }
    setAttempt(a => a + 1);
  }, []);

  return { urls, retry };
}

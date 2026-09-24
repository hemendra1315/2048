import React, { useEffect, useState } from 'react';
import { ImageOff, RotateCcw } from 'lucide-react';
import type { MediaUrlState } from '../../lib/mediaUrls';

interface MediaImageProps {
  state: MediaUrlState;
  alt: string;
  /** Classes for the <img>. The wrapper always fills its parent. */
  imgClassName?: string;
  /** Called when the user taps "Retry" after the URL or the image failed. */
  onRetry?: () => void;
  /** Compact error layout for grid tiles. */
  compact?: boolean;
  loading?: 'lazy' | 'eager';
}

/**
 * Image with explicit loading and error states. A failed image is never hidden silently
 * (which used to leave an empty black tile): the user sees what happened and can retry.
 */
export const MediaImage: React.FC<MediaImageProps> = ({
  state,
  alt,
  imgClassName = 'w-full h-full object-cover',
  onRetry,
  compact = false,
  loading = 'lazy',
}) => {
  const url = state.status === 'ready' ? state.url : null;
  const [loaded, setLoaded] = useState(false);
  const [broken, setBroken] = useState(false);

  // A new URL (for example after a retry) gets a fresh attempt.
  useEffect(() => {
    setLoaded(false);
    setBroken(false);
  }, [url]);

  const showError = state.status === 'error' || broken;
  const showSkeleton = !showError && (state.status === 'loading' || !loaded);

  return (
    <span className="relative block w-full h-full">
      {url && !broken && (
        <img
          src={url}
          alt={alt}
          loading={loading}
          decoding="async"
          draggable={false}
          onLoad={() => setLoaded(true)}
          onError={() => setBroken(true)}
          className={`${imgClassName} transition-opacity duration-200 ${loaded ? 'opacity-100' : 'opacity-0'}`}
        />
      )}

      {showSkeleton && <span className="sk absolute inset-0 !rounded-none" role="status" aria-label="Loading image" />}

      {showError && (
        <span
          className={`absolute inset-0 flex flex-col items-center justify-center text-center bg-vault-900 text-vault-400 ${
            compact ? 'gap-1 p-1' : 'gap-2 p-4'
          }`}
          role="alert"
        >
          <ImageOff className={compact ? 'w-5 h-5' : 'w-8 h-8'} aria-hidden />
          {!compact && <span className="t-sm c2">This photo couldn't be loaded.</span>}
          {onRetry && (
            <span
              role="button"
              tabIndex={0}
              onClick={e => {
                e.stopPropagation();
                onRetry();
              }}
              onKeyDown={e => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  e.stopPropagation();
                  onRetry();
                }
              }}
              className={`inline-flex items-center gap-1 rounded-full border border-vault-700 bg-vault-850 text-vault-100 font-semibold cursor-pointer ${
                compact ? 'px-2 py-1 text-[11px]' : 'px-3 py-2 text-sm'
              }`}
            >
              <RotateCcw className="w-3.5 h-3.5" aria-hidden />
              Retry
            </span>
          )}
        </span>
      )}
    </span>
  );
};

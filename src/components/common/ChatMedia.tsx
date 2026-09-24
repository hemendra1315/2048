import React, { useRef } from 'react';
import { useChatMediaUrl } from '../../lib/mediaUrls';

interface ChatImageProps extends Omit<React.ImgHTMLAttributes<HTMLImageElement>, 'src'> {
  /** The URL stored in the message ([IMAGE]<url>). */
  url: string;
  fallback?: React.ReactNode;
}

/** A chat photo loaded through a short-lived signed link. Re-signs once if the link has expired. */
export const ChatImage: React.FC<ChatImageProps> = ({ url, fallback, onError, ...rest }) => {
  const { src, failed, retry } = useChatMediaUrl(url);
  const retried = useRef(false);
  if (failed) return <>{fallback ?? null}</>;
  if (!src) return <span className="block w-full h-full bg-black/20 animate-pulse" aria-label="Loading photo" />;
  return (
    <img
      {...rest}
      src={src}
      onError={e => {
        if (!retried.current) {
          retried.current = true;
          retry();
        } else {
          onError?.(e);
        }
      }}
    />
  );
};

/** A voice note with the browser's audio controls, loaded through a signed link. */
export const ChatAudio: React.FC<{ url: string; className?: string }> = ({ url, className }) => {
  const { src, failed } = useChatMediaUrl(url);
  if (failed) return <span className="text-xs text-vault-500">Voice note unavailable</span>;
  return <audio controls preload="none" src={src} className={className} />;
};

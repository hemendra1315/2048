const BASE_TITLE = document.title;
const FAVICON_HREF = '/gamepad.svg';

let canvas: HTMLCanvasElement | null = null;

/** Reflects the unread count in the tab title, favicon and (where supported) the OS app badge. Pass 0 to clear it. */
export function updateUnreadBadge(count: number): void {
  document.title = count > 0 ? `(${count > 99 ? '99+' : count}) ${BASE_TITLE}` : BASE_TITLE;
  updateAppBadge(count);
  updateFavicon(count);
}

function updateAppBadge(count: number): void {
  try {
    const nav = navigator as Navigator & {
      setAppBadge?: (n?: number) => Promise<void>;
      clearAppBadge?: () => Promise<void>;
    };
    if (count > 0) {
      nav.setAppBadge?.(count)?.catch(() => {});
    } else {
      nav.clearAppBadge?.()?.catch(() => {});
    }
  } catch {
    // Badging API unavailable in this environment.
  }
}

function updateFavicon(count: number): void {
  const link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
  if (!link) return;

  if (count === 0) {
    link.href = FAVICON_HREF;
    return;
  }

  const img = new Image();
  img.onload = () => {
    try {
      if (!canvas) canvas = document.createElement('canvas');
      canvas.width = 64;
      canvas.height = 64;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.clearRect(0, 0, 64, 64);
      ctx.drawImage(img, 0, 0, 64, 64);
      ctx.beginPath();
      ctx.arc(50, 14, 13, 0, Math.PI * 2);
      ctx.fillStyle = '#10B981';
      ctx.fill();
      ctx.strokeStyle = '#0A0A0A';
      ctx.lineWidth = 2;
      ctx.stroke();
      link.href = canvas.toDataURL('image/png');
    } catch {
      // Canvas unavailable; leave the plain favicon in place.
    }
  };
  img.src = FAVICON_HREF;
}

import React, { useEffect, useState, useRef } from 'react';
import { registerPlugin, Capacitor } from '@capacitor/core';

export interface ScreenProtectionPluginInterface {
  enable(): Promise<{ enabled: boolean }>;
  disable(): Promise<{ enabled: boolean }>;
  isEnabled(): Promise<{ enabled: boolean }>;
}

const NativeScreenProtection = registerPlugin<ScreenProtectionPluginInterface>('ScreenProtection');

let activeProtectionHoldCount = 0;

/**
 * Request OS-level screen protection (FLAG_SECURE on Android).
 * Uses reference counting so multiple simultaneous ephemeral viewers maintain protection until all close.
 */
export async function enableScreenProtection(): Promise<void> {
  activeProtectionHoldCount++;
  if (Capacitor.isNativePlatform()) {
    try {
      await NativeScreenProtection.enable();
    } catch (e) {
      console.warn('[ScreenProtection] Failed to enable native FLAG_SECURE:', e);
    }
  }
}

/**
 * Release OS-level screen protection.
 */
export async function disableScreenProtection(): Promise<void> {
  activeProtectionHoldCount = Math.max(0, activeProtectionHoldCount - 1);
  if (activeProtectionHoldCount === 0 && Capacitor.isNativePlatform()) {
    try {
      await NativeScreenProtection.disable();
    } catch (e) {
      console.warn('[ScreenProtection] Failed to disable native FLAG_SECURE:', e);
    }
  }
}

export interface UseScreenProtectionOptions {
  /** Optional callback fired when a screenshot hotkey or print screen attempt is intercepted */
  onScreenshotAttempt?: () => void;
  /** Whether to obscure content immediately when the browser/app window loses focus */
  obscureOnBlur?: boolean;
}

/**
 * Hook to enforce strict screenshot, screen recording, and app switcher privacy for sensitive views
 * (e.g. View Once photos, Allow Replay / View Twice photos, voice notes, and private lightbox views).
 */
export function useScreenProtection(
  active: boolean,
  options: UseScreenProtectionOptions = {}
) {
  const { onScreenshotAttempt, obscureOnBlur = true } = options;
  const [isShielded, setIsShielded] = useState(false);
  const shieldTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!active) return;

    void enableScreenProtection();

    const triggerShield = () => {
      setIsShielded(true);
      if (shieldTimeoutRef.current) clearTimeout(shieldTimeoutRef.current);
      shieldTimeoutRef.current = setTimeout(() => {
        setIsShielded(false);
      }, 2500);
      onScreenshotAttempt?.();
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      // PrintScreen key
      if (e.key === 'PrintScreen' || e.code === 'PrintScreen') {
        e.preventDefault();
        triggerShield();
        return;
      }

      // Windows Snipping Tool (Win + Shift + S) or MacOS Screenshot (Cmd + Shift + 3 / 4 / 5)
      const isShift = e.shiftKey;
      const isMetaOrAlt = e.metaKey || e.altKey || e.ctrlKey;
      if (isShift && isMetaOrAlt && (['S', 's', '3', '4', '5'].includes(e.key) || ['KeyS', 'Digit3', 'Digit4', 'Digit5'].includes(e.code))) {
        triggerShield();
      }
    };

    const handleVisibilityChange = () => {
      if (document.hidden && obscureOnBlur) {
        setIsShielded(true);
      } else {
        // Small delay when refocusing to prevent race condition capture
        setTimeout(() => setIsShielded(false), 200);
      }
    };

    const handleWindowBlur = () => {
      if (obscureOnBlur) {
        setIsShielded(true);
      }
    };

    const handleWindowFocus = () => {
      setTimeout(() => setIsShielded(false), 200);
    };

    window.addEventListener('keydown', handleKeyDown, true);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('blur', handleWindowBlur);
    window.addEventListener('focus', handleWindowFocus);
    window.addEventListener('pagehide', handleWindowBlur);

    return () => {
      void disableScreenProtection();
      window.removeEventListener('keydown', handleKeyDown, true);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('blur', handleWindowBlur);
      window.removeEventListener('focus', handleWindowFocus);
      window.removeEventListener('pagehide', handleWindowBlur);
      if (shieldTimeoutRef.current) clearTimeout(shieldTimeoutRef.current);
    };
  }, [active, obscureOnBlur, onScreenshotAttempt]);

  return { isShielded, isProtected: active };
}

/**
 * Protective Shield Overlay displayed whenever a capture attempt or window defocus occurs.
 */
export const ScreenShieldOverlay: React.FC<{
  show: boolean;
  message?: string;
}> = ({ show, message = 'Screenshot and screen capture are blocked for privacy' }) => {
  if (!show) return null;

  return React.createElement(
    'div',
    {
      className:
        'fixed inset-0 z-[99999] bg-black/95 backdrop-blur-2xl flex flex-col items-center justify-center p-6 text-center select-none pointer-events-auto',
      onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
      onTouchStart: (e: React.TouchEvent) => e.stopPropagation(),
    },
    React.createElement(
      'div',
      {
        className:
          'w-16 h-16 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center mb-4 text-emerald-400',
      },
      React.createElement(
        'svg',
        {
          xmlns: 'http://www.w3.org/2000/svg',
          className: 'w-8 h-8',
          fill: 'none',
          viewBox: '0 0 24 24',
          stroke: 'currentColor',
          strokeWidth: 2,
        },
        React.createElement('path', {
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
          d: 'M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z',
        })
      )
    ),
    React.createElement('h3', { className: 'text-lg font-bold text-white mb-2' }, 'Protected Content'),
    React.createElement('p', { className: 'text-xs text-vault-300 max-w-xs' }, message)
  );
};


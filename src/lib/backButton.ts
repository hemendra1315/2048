/**
 * Android back button.
 *
 * Without a handler, Android's back button closes the app from any screen. Screens register what
 * "back" means for them while it applies (close a sheet, leave a chat, return to the library), and
 * the most recently registered handler runs. With nothing registered the app goes to the background
 * instead of closing; leaving the app locks it (see VaultContext).
 */
import { useEffect, useRef } from 'react';
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';

interface Entry {
  run: () => void;
}

const stack: Entry[] = [];
let listening = false;

function ensureListener(): void {
  if (listening || !Capacitor.isNativePlatform()) return;
  listening = true;
  void App.addListener('backButton', () => {
    const top = stack[stack.length - 1];
    if (top) top.run();
    else void App.minimizeApp();
  });
}

/**
 * While `active` is true, the back button calls `handler` (newest registration wins).
 * Typical use: `useBackHandler(isSheetOpen, () => setSheetOpen(false))`.
 */
export function useBackHandler(active: boolean, handler: () => void): void {
  const handlerRef = useRef(handler);
  useEffect(() => {
    handlerRef.current = handler;
  });

  useEffect(() => {
    if (!active) return;
    ensureListener();
    const entry: Entry = { run: () => handlerRef.current() };
    stack.push(entry);
    return () => {
      const i = stack.indexOf(entry);
      if (i >= 0) stack.splice(i, 1);
    };
  }, [active]);
}

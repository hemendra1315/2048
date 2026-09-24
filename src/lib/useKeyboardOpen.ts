import { useEffect, useState } from 'react';

const KEYBOARD_MIN_HEIGHT = 150;

const isTextField = (el: Element | null): boolean =>
  el instanceof HTMLTextAreaElement ||
  (el instanceof HTMLInputElement && !['checkbox', 'radio', 'button', 'submit', 'range', 'file'].includes(el.type)) ||
  (el instanceof HTMLElement && el.isContentEditable);

/**
 * True while the on-screen keyboard is open: a text field has focus and the visible area has
 * shrunk by more than a keyboard's height. (The app is resized, not panned, when the keyboard opens.)
 */
export function useKeyboardOpen(): boolean {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    let fullHeight = vv.height;
    let width = vv.width;

    const update = () => {
      if (vv.width !== width) {
        // Rotated: start measuring again for the new orientation.
        width = vv.width;
        fullHeight = vv.height;
      }
      fullHeight = Math.max(fullHeight, vv.height);
      setOpen(fullHeight - vv.height > KEYBOARD_MIN_HEIGHT && isTextField(document.activeElement));
    };

    vv.addEventListener('resize', update);
    window.addEventListener('focusin', update);
    window.addEventListener('focusout', update);
    return () => {
      vv.removeEventListener('resize', update);
      window.removeEventListener('focusin', update);
      window.removeEventListener('focusout', update);
    };
  }, []);

  return open;
}

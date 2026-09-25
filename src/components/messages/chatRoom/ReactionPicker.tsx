import React from 'react';
import { createPortal } from 'react-dom';

const REACTION_EMOJIS = ['❤️', '😂', '👍', '😮', '😢', '🙏'];

interface ReactionPickerProps {
  onPick: (emoji: string) => void;
  /** Fixed viewport coordinates of the trigger button, from getBoundingClientRect(). */
  anchorRect: { top: number; bottom: number; left: number; right: number };
}

// Rendered into document.body via a portal so it can never be clipped by an ancestor's
// overflow: hidden/auto (the message thread scrolls, and any in-flow popover gets cut off there).
export const ReactionPicker: React.FC<ReactionPickerProps> = ({ onPick, anchorRect }) => {
  const opensDown = anchorRect.top < 100;
  const centerX = (anchorRect.left + anchorRect.right) / 2;

  const style: React.CSSProperties = {
    position: 'fixed',
    left: Math.max(8, Math.min(centerX, window.innerWidth - 8)),
    transform: 'translateX(-50%)',
    ...(opensDown ? { top: anchorRect.bottom + 6 } : { bottom: window.innerHeight - anchorRect.top + 6 }),
  };

  return createPortal(
    <div
      style={style}
      className="fixed z-50 bg-[#171717] border border-[#262626] rounded-full px-1.5 py-1 flex items-center gap-0.5 shadow-2xl animate-fade-in"
    >
      {REACTION_EMOJIS.map(emoji => (
        <button
          key={emoji}
          type="button"
          onClick={() => onPick(emoji)}
          className="text-lg p-1 hover:scale-125 transition-transform rounded-full hover:bg-[#222222]"
        >
          {emoji}
        </button>
      ))}
    </div>,
    document.body
  );
};

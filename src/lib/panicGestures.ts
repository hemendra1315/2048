/**
 * Panic gestures (shake / flip) have been deprecated and disabled
 * in favor of the draggable FloatingPanicCircle.
 */
export interface PanicGestureOptions {
  onPanic: () => void;
  enabled?: boolean;
}

export function registerPanicGestures(_options: PanicGestureOptions): () => void {
  // Disabled in favor of floating interactive draggable return circle
  return () => {};
}

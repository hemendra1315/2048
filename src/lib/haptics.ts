import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
import { Capacitor } from '@capacitor/core';

const isNative = Capacitor.isNativePlatform();

/**
 * Light impact feedback (e.g., tap, toggle, swipe-to-reply threshold, subtle tick).
 */
export async function lightImpact(): Promise<void> {
  try {
    if (isNative) {
      await Haptics.impact({ style: ImpactStyle.Light });
    } else if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate(10);
    }
  } catch {
    // Ignore haptic errors
  }
}

/**
 * Medium impact feedback (e.g., button press, gesture trigger, delete action).
 */
export async function mediumImpact(): Promise<void> {
  try {
    if (isNative) {
      await Haptics.impact({ style: ImpactStyle.Medium });
    } else if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate(20);
    }
  } catch {
    // Ignore haptic errors
  }
}

/**
 * Heavy impact feedback (e.g., drag snap, critical threshold).
 */
export async function heavyImpact(): Promise<void> {
  try {
    if (isNative) {
      await Haptics.impact({ style: ImpactStyle.Heavy });
    } else if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate(35);
    }
  } catch {
    // Ignore haptic errors
  }
}

/**
 * Selection change feedback (e.g., scrubbing audio waveform, picker scroll, filter chip tap).
 */
export async function selectionChange(): Promise<void> {
  try {
    if (isNative) {
      await Haptics.selectionChanged();
    } else if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate(8);
    }
  } catch {
    // Ignore haptic errors
  }
}

/**
 * Success notification feedback (e.g., message sent, photo uploaded, reaction saved).
 */
export async function notificationSuccess(): Promise<void> {
  try {
    if (isNative) {
      await Haptics.notification({ type: NotificationType.Success });
    } else if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate([15, 50, 20]);
    }
  } catch {
    // Ignore haptic errors
  }
}

/**
 * Error / Warning notification feedback (e.g., upload failed, delete confirmation, invalid input).
 */
export async function errorWarning(): Promise<void> {
  try {
    if (isNative) {
      await Haptics.notification({ type: NotificationType.Error });
    } else if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate([30, 60, 30]);
    }
  } catch {
    // Ignore haptic errors
  }
}

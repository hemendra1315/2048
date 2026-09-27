import { heavyImpact } from './haptics';

export interface PanicGestureOptions {
  onPanic: () => void;
  enabled?: boolean;
  shakeThreshold?: number; // Acceleration delta threshold (m/s^2)
  shakeReversals?: number; // Number of directional reversals to trigger
  shakeTimeWindowMs?: number; // Max time window for shake reversals (ms)
}

/**
 * Registers accelerometer (shake) and orientation (flip face-down) listeners
 * to trigger instant panic lock when the user shakes their phone or puts it face down.
 */
export function registerPanicGestures(options: PanicGestureOptions): () => void {
  const {
    onPanic,
    enabled = true,
    shakeThreshold = 18,
    shakeReversals = 3,
    shakeTimeWindowMs = 650,
  } = options;

  if (!enabled || typeof window === 'undefined') {
    return () => {};
  }

  let lastX = 0;
  let lastY = 0;
  let lastZ = 0;
  let lastDirection = 0;
  let reversals = 0;
  let firstReversalTime = 0;
  let isTriggered = false;

  const triggerPanic = () => {
    if (isTriggered) return;
    isTriggered = true;
    void heavyImpact();
    onPanic();
    setTimeout(() => {
      isTriggered = false;
    }, 2000);
  };

  const handleDeviceMotion = (e: DeviceMotionEvent) => {
    const acc = e.accelerationIncludingGravity || e.acceleration;
    if (!acc || acc.x == null || acc.y == null || acc.z == null) return;

    const x = acc.x;
    const y = acc.y;
    const z = acc.z;

    // 1. Shake Detection
    const deltaX = x - lastX;
    const deltaY = y - lastY;
    const deltaZ = z - lastZ;
    const currentDirection = Math.sign(deltaX + deltaY);

    const speed = Math.sqrt(deltaX * deltaX + deltaY * deltaY + deltaZ * deltaZ);
    const now = Date.now();

    if (speed > shakeThreshold) {
      if (currentDirection !== 0 && currentDirection !== lastDirection) {
        if (reversals === 0) {
          firstReversalTime = now;
          reversals = 1;
        } else if (now - firstReversalTime <= shakeTimeWindowMs) {
          reversals++;
          if (reversals >= shakeReversals) {
            triggerPanic();
            reversals = 0;
            return;
          }
        } else {
          firstReversalTime = now;
          reversals = 1;
        }
        lastDirection = currentDirection;
      }
    }

    // Reset reversals if time window expired
    if (reversals > 0 && now - firstReversalTime > shakeTimeWindowMs) {
      reversals = 0;
    }

    lastX = x;
    lastY = y;
    lastZ = z;

    // 2. Flip Face-Down Detection via Gravity Z component
    // When screen is facing flat on a table (face down), gravity Z is strongly negative (-7 to -10 m/s^2)
    if (z < -7.0 && Math.abs(x) < 5.0 && Math.abs(y) < 5.0) {
      triggerPanic();
    }
  };

  const handleDeviceOrientation = (e: DeviceOrientationEvent) => {
    // Pitch (beta): [-180, 180]. When device is flipped face down, |beta| > 150
    // Roll (gamma): [-90, 90]. When horizontal, gamma is near 0
    if (e.beta != null && e.gamma != null) {
      const isFlippedFaceDown = Math.abs(e.beta) > 150 && Math.abs(e.gamma) < 40;
      if (isFlippedFaceDown) {
        triggerPanic();
      }
    }
  };

  try {
    window.addEventListener('devicemotion', handleDeviceMotion, { passive: true });
    window.addEventListener('deviceorientation', handleDeviceOrientation, { passive: true });
  } catch (err) {
    console.warn('Panic gestures not supported on this environment:', err);
  }

  return () => {
    try {
      window.removeEventListener('devicemotion', handleDeviceMotion);
      window.removeEventListener('deviceorientation', handleDeviceOrientation);
    } catch {
      // Ignore
    }
  };
}

/**
 * Leaving the app locks it. Opening the camera or a photo picker also leaves the app (another app
 * takes over the screen), so callers announce it first with expectExternalActivity(). If the app goes
 * to the background within a few seconds of that, it stays unlocked and the idle timer waits until
 * the user is back.
 */
const EXPECT_WINDOW_MS = 5000;

let expectedUntil = 0;
let away = false;

/** Call right before opening the camera, a photo picker or a file chooser. */
export function expectExternalActivity(): void {
  expectedUntil = Date.now() + EXPECT_WINDOW_MS;
}

/** Call when the app goes to the background. True if it left for the camera or a picker. */
export function leavingForExternalActivity(): boolean {
  away = Date.now() <= expectedUntil;
  expectedUntil = 0;
  return away;
}

/** Call when the app is back in the foreground. */
export function returnedToApp(): void {
  away = false;
}

/** True while the camera or a picker has the screen. */
export function isAwayForExternalActivity(): boolean {
  return away;
}

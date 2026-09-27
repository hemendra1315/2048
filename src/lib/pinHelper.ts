/**
 * Helper to ensure user PINs (e.g. 4 digits like "1234") meet server-side
 * minimum length requirements (>= 8 characters) deterministically.
 */
export function pinToSecret(pin: string): string {
  if (!pin) return '';
  const clean = pin.trim();
  if (clean.length < 8) {
    return `GAMES_PIN_${clean}_SECURE`;
  }
  return clean;
}

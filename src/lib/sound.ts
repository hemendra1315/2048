let audioCtx: AudioContext | null = null;

export function playTone(freq = 440, durationMs = 90, type: OscillatorType = 'sine'): void {
  try {
    if (!audioCtx) {
      const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      audioCtx = new Ctor();
    }
    if (audioCtx.state === 'suspended') {
      void audioCtx.resume();
    }
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.08, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + durationMs / 1000);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + durationMs / 1000);
  } catch {
    // Web Audio unavailable in this environment; fail silently.
  }
}

export function vibrateDevice(pattern: number | number[] = 15): void {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    // Vibration API unavailable in this environment; fail silently.
  }
}

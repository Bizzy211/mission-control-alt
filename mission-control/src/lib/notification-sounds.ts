/**
 * Notification sounds using Web Audio API.
 * Generates distinct synthesized tones — no external audio files needed.
 */

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!audioCtx) {
    try {
      audioCtx = new AudioContext();
    } catch {
      return null;
    }
  }
  // Resume if suspended (browser autoplay policy)
  if (audioCtx.state === "suspended") {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

function playTone(
  frequencies: number[],
  durations: number[],
  volume: number,
  type: OscillatorType = "sine"
) {
  const ctx = getAudioContext();
  if (!ctx) return;

  const gainNode = ctx.createGain();
  gainNode.connect(ctx.destination);
  gainNode.gain.setValueAtTime(volume * 0.3, ctx.currentTime);

  let offset = 0;
  for (let i = 0; i < frequencies.length; i++) {
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(frequencies[i], ctx.currentTime + offset);
    osc.connect(gainNode);
    osc.start(ctx.currentTime + offset);

    const noteEnd = ctx.currentTime + offset + durations[i];
    // Fade out at the end of each note
    gainNode.gain.setValueAtTime(volume * 0.3, noteEnd - 0.05);
    gainNode.gain.linearRampToValueAtTime(0, noteEnd);

    osc.stop(noteEnd + 0.01);
    offset += durations[i];
  }

  // Re-set gain for next note
  for (let i = 1; i < frequencies.length; i++) {
    let t = 0;
    for (let j = 0; j < i; j++) t += durations[j];
    gainNode.gain.setValueAtTime(volume * 0.3, ctx.currentTime + t);
  }
}

/**
 * Task completed — cheerful ascending two-note chime.
 */
export function playTaskComplete(volume = 0.7) {
  playTone([523.25, 659.25, 783.99], [0.12, 0.12, 0.2], volume, "sine");
}

/**
 * New inbox message — soft double-ping.
 */
export function playNewMessage(volume = 0.7) {
  playTone([880, 1046.5], [0.08, 0.12], volume, "sine");
}

/**
 * Decision needed — attention-grabbing descending tone.
 */
export function playDecisionNeeded(volume = 0.7) {
  playTone([987.77, 783.99, 659.25], [0.1, 0.1, 0.15], volume, "triangle");
}

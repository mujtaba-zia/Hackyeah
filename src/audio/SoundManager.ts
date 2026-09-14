export type SoundCue = 'success' | 'failure' | 'alarm' | 'ufo' | 'wind' | 'celebrate' | 'pop';

interface CueShape {
  /** Frequency ramp in hertz. */
  from: number;
  to: number;
  durationMs: number;
  type: OscillatorType;
  gain: number;
  /** Optional second voice for chords and two tone alarms. */
  detune?: number;
}

const CUES: Record<SoundCue, CueShape> = {
  success: { from: 520, to: 780, durationMs: 260, type: 'sine', gain: 0.16 },
  failure: { from: 320, to: 120, durationMs: 420, type: 'sawtooth', gain: 0.14 },
  alarm: { from: 660, to: 440, durationMs: 700, type: 'square', gain: 0.1, detune: 12 },
  ufo: { from: 240, to: 900, durationMs: 1400, type: 'sine', gain: 0.09, detune: 7 },
  wind: { from: 180, to: 90, durationMs: 1600, type: 'triangle', gain: 0.07 },
  celebrate: { from: 440, to: 880, durationMs: 500, type: 'triangle', gain: 0.14, detune: 4 },
  pop: { from: 700, to: 300, durationMs: 120, type: 'sine', gain: 0.1 },
};

/**
 * Tiny synthesised audio, so the prototype ships no binary assets.
 *
 * Starts muted because browsers block autoplay, creates its context lazily on
 * the first interaction, and degrades to silence rather than throwing when the
 * Web Audio API is unavailable.
 */
class SoundManager {
  private context: AudioContext | null = null;
  private muted = true;
  private volume = 0.6;

  get isMuted(): boolean {
    return this.muted;
  }

  get level(): number {
    return this.volume;
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (!muted) this.resume();
  }

  setVolume(volume: number): void {
    this.volume = Math.min(1, Math.max(0, volume));
  }

  resume(): void {
    const context = this.ensureContext();
    if (context && context.state === 'suspended') {
      context.resume().catch(() => {
        // Audio simply stays silent if the browser refuses to resume.
      });
    }
  }

  play(cue: SoundCue): void {
    if (this.muted) return;
    const context = this.ensureContext();
    // A suspended or closed context throws on node creation, and this runs from
    // an event bus handler, so failures must never escape into the simulation.
    if (!context || context.state !== 'running') return;

    try {
      this.emit(context, cue);
    } catch {
      // Ignore: a missed sound effect is never worth breaking the city for.
    }
  }

  private emit(context: AudioContext, cue: SoundCue): void {
    const shape = CUES[cue];
    const now = context.currentTime;
    const seconds = shape.durationMs / 1000;
    const gain = context.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, shape.gain * this.volume), now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + seconds);
    gain.connect(context.destination);

    const voices = shape.detune === undefined ? [0] : [0, shape.detune];
    let remaining = voices.length;
    for (const detune of voices) {
      const oscillator = context.createOscillator();
      oscillator.type = shape.type;
      oscillator.detune.value = detune * 100;
      oscillator.frequency.setValueAtTime(shape.from, now);
      oscillator.frequency.linearRampToValueAtTime(shape.to, now + seconds);
      oscillator.connect(gain);
      // Tear the little graph down rather than leaving it to audio GC.
      oscillator.onended = () => {
        oscillator.disconnect();
        remaining -= 1;
        if (remaining === 0) gain.disconnect();
      };
      oscillator.start(now);
      oscillator.stop(now + seconds + 0.02);
    }
  }

  private ensureContext(): AudioContext | null {
    if (this.context) return this.context;
    // Safari only exposes the prefixed constructor.
    const prefixed = 'webkitAudioContext' in window ? window.webkitAudioContext : undefined;
    const Ctor = window.AudioContext ?? prefixed;
    if (!Ctor) return null;
    try {
      this.context = new Ctor();
    } catch {
      this.context = null;
    }
    return this.context;
  }
}

export const sound = new SoundManager();

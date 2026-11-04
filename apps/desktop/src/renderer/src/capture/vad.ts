/**
 * Energy-based voice activity detector (VAD) with adaptive noise floor.
 *
 * Slices continuous audio into speech segments: starts when volume exceeds the
 * background noise floor for a few consecutive frames and ends after a short
 * silence. Each segment becomes a transcription request, so clean slicing
 * directly impacts cost and quality (no paid silence, no words cut in half).
 */

export const FRAME_MS = 20;

export interface VadOptions {
  /** How much above the noise floor counts as speech (dB). */
  marginDb: number;
  /** Below this is never considered speech, even in a very quiet room (dBFS). */
  minDb: number;
  /** Consecutive speech frames required to trigger start (avoids clicks and knocks). */
  framesToStart: number;
  /** Pre-onset audio included at the start (avoids clipping the first syllable). */
  preRollMs: number;
  /** Silence duration that closes the speech segment. */
  endSilenceMs: number;
  /** Long speech: after this duration, cut on the first short pause. */
  cutAfterMs: number;
  shortPauseMs: number;
  /** Forced cut even without a pause. */
  maxMs: number;
  /** Segments with less actual speech than this are discarded. */
  minSpeechMs: number;
}

export const DEFAULT_VAD_OPTIONS: VadOptions = {
  marginDb: 10,
  minDb: -52,
  framesToStart: 3,
  preRollMs: 300,
  endSilenceMs: 700,
  cutAfterMs: 12_000,
  shortPauseMs: 250,
  maxMs: 25_000,
  minSpeechMs: 350,
};

export interface SpeechSegment {
  startMs: number;
  endMs: number;
  samples: Float32Array;
}

export class SpeechDetector {
  private floor = -60;
  private speaking = false;
  private consecutiveSpeech = 0;
  private consecutiveSilence = 0;
  private speechFrames = 0;
  private startMs = 0;
  private preRoll: Float32Array[] = [];
  private current: Float32Array[] = [];
  private _level = 0;

  constructor(private readonly opts: VadOptions = DEFAULT_VAD_OPTIONS) {}

  /** Whether a speech segment is currently in progress. */
  get inSpeech(): boolean {
    return this.speaking;
  }

  /** Smoothed current volume from 0 to 1 for the level meter. */
  get level(): number {
    return this._level;
  }

  /** `tMs` is the timestamp at the start of the frame. Returns a segment when speech ends. */
  process(frame: Float32Array, tMs: number): SpeechSegment | null {
    const db = decibels(frame);
    this.updateLevel(db);
    const isSpeech = db > Math.max(this.floor + this.opts.marginDb, this.opts.minDb);
    // Noise floor: drops quickly (quieter new background), rises slowly (~1 dB/s) so it doesn't "learn" the voice.
    if (!isSpeech || !this.speaking) this.floor = db < this.floor ? this.floor * 0.9 + db * 0.1 : this.floor + 0.02;
    this.floor = Math.min(-30, Math.max(-90, this.floor));

    if (!this.speaking) {
      this.consecutiveSpeech = isSpeech ? this.consecutiveSpeech + 1 : 0;
      this.preRoll.push(frame);
      const maxPre = Math.ceil(this.opts.preRollMs / FRAME_MS) + this.opts.framesToStart;
      if (this.preRoll.length > maxPre) this.preRoll.shift();
      if (this.consecutiveSpeech >= this.opts.framesToStart) {
        this.speaking = true;
        this.current = this.preRoll;
        this.preRoll = [];
        this.startMs = Math.max(0, tMs - (this.current.length - 1) * FRAME_MS);
        this.speechFrames = this.consecutiveSpeech;
        this.consecutiveSilence = 0;
      }
      return null;
    }

    this.current.push(frame);
    if (isSpeech) {
      this.speechFrames++;
      this.consecutiveSilence = 0;
    } else {
      this.consecutiveSilence++;
    }
    const duration = this.current.length * FRAME_MS;
    const silence = this.consecutiveSilence * FRAME_MS;
    if (
      silence >= this.opts.endSilenceMs ||
      (duration >= this.opts.cutAfterMs && silence >= this.opts.shortPauseMs) ||
      duration >= this.opts.maxMs
    ) {
      return this.close(tMs + FRAME_MS);
    }
    return null;
  }

  /** Flushes any ongoing segment (on pause or session end). */
  flush(tMs: number): SpeechSegment | null {
    return this.speaking ? this.close(tMs) : null;
  }

  /** Discards current state without emitting a segment. */
  reset(): void {
    this.speaking = false;
    this.current = [];
    this.preRoll = [];
    this.consecutiveSpeech = 0;
    this.consecutiveSilence = 0;
  }

  private close(endMs: number): SpeechSegment | null {
    // Trim trailing silence, leaving a 200 ms tail.
    const trimFrames = Math.max(0, this.consecutiveSilence - Math.round(200 / FRAME_MS));
    const frames = trimFrames ? this.current.slice(0, this.current.length - trimFrames) : this.current;
    const speechDuration = this.speechFrames * FRAME_MS;
    const startMs = this.startMs;
    this.reset();
    if (speechDuration < this.opts.minSpeechMs || !frames.length) return null;
    const samples = new Float32Array(frames.reduce((n, f) => n + f.length, 0));
    let offset = 0;
    for (const f of frames) {
      samples.set(f, offset);
      offset += f.length;
    }
    return { startMs, endMs: endMs - trimFrames * FRAME_MS, samples };
  }

  private updateLevel(db: number): void {
    const target = Math.min(1, Math.max(0, (db + 60) / 50));
    this._level = target > this._level ? target : this._level * 0.85 + target * 0.15;
  }
}

export function decibels(frame: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < frame.length; i++) sum += frame[i]! * frame[i]!;
  return 10 * Math.log10(sum / frame.length + 1e-12);
}

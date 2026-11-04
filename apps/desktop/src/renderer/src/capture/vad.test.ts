import { describe, expect, it } from 'vitest';
import { SpeechDetector, FRAME_MS } from './vad';

const makeFrame = (amp: number) => {
  const frame = new Float32Array(320);
  for (let i = 0; i < frame.length; i++) frame[i] = amp * Math.sin(i / 3) + (Math.random() - 0.5) * 0.0005;
  return frame;
};

function runSequence(sequence: Array<[amp: number, ms: number]>) {
  const detector = new SpeechDetector();
  const segments = [];
  let t = 0;
  for (const [amp, ms] of sequence) {
    for (let i = 0; i < ms / FRAME_MS; i++, t += FRAME_MS) {
      const seg = detector.process(makeFrame(amp), t);
      if (seg) segments.push(seg);
    }
  }
  const rest = detector.flush(t);
  if (rest) segments.push(rest);
  return segments;
}

describe('SpeechDetector', () => {
  it('slices speech between silences, with pre-roll and without trailing silence', () => {
    const [seg, ...others] = runSequence([[0, 2000], [0.2, 1500], [0, 1500]]);
    expect(others).toHaveLength(0);
    expect(seg!.startMs).toBeGreaterThanOrEqual(1650);
    expect(seg!.startMs).toBeLessThanOrEqual(2000);
    expect(seg!.endMs).toBeGreaterThan(3400);
    expect(seg!.endMs).toBeLessThan(3800);
    expect(seg!.samples.length).toBe(((seg!.endMs - seg!.startMs) / 1000) * 16000);
  });

  it('ignores short clicks', () => {
    expect(runSequence([[0, 1000], [0.3, 100], [0, 1500]])).toHaveLength(0);
  });

  it('splits two utterances with a long pause and merges those with a short pause', () => {
    expect(runSequence([[0, 1000], [0.2, 800], [0, 300], [0.2, 800], [0, 1000]])).toHaveLength(1);
    expect(runSequence([[0, 1000], [0.2, 800], [0, 1200], [0.2, 800], [0, 1000]])).toHaveLength(2);
  });

  it('does not let a segment exceed the maximum duration', () => {
    const segments = runSequence([[0, 500], [0.2, 40_000], [0, 1000]]);
    expect(segments.length).toBeGreaterThanOrEqual(2);
    for (const seg of segments) expect(seg.endMs - seg.startMs).toBeLessThanOrEqual(25_400);
  });
});

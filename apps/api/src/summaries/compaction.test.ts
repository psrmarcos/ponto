import { describe, expect, it } from 'vitest';
import { TRAILING_RAW_CHARS, pickBatch, RAW_CHARS_LIMIT } from './compaction.service';

const makeUtterances = (n: number, size: number) =>
  Array.from({ length: n }, (_, i) => ({ text: 'x'.repeat(size), startMs: i * 1000 }));

describe('pickBatch', () => {
  it('does not compact while within limit', () => {
    expect(pickBatch(makeUtterances(10, 100))).toEqual([]);
  });
  it('compacts the beginning and leaves the recent tail raw', () => {
    const list = makeUtterances(100, 200);
    const batch = pickBatch(list);
    expect(batch.length).toBeGreaterThan(0);
    const rest = list.slice(batch.length).reduce((n, u) => n + u.text.length + 16, 0);
    expect(rest).toBeGreaterThanOrEqual(TRAILING_RAW_CHARS);
    expect(rest).toBeLessThan(RAW_CHARS_LIMIT);
  });
});

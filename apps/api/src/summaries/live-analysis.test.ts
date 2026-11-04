import { describe, expect, it } from 'vitest';
import { parseInsights, parseTone, computeVoiceMetrics } from './live-analysis.service';

describe('parseInsights', () => {
  it('reads JSON inside code fences', () => {
    expect(parseInsights('```json\n[{"tipo":"dica","texto":"Pergunte o prazo."}]\n```')).toEqual([
      { type: 'tip', text: 'Pergunte o prazo.' },
    ]);
  });
  it('discards unknown types and garbage', () => {
    expect(parseInsights('[{"tipo":"x","texto":"aaaa"}]')).toEqual([]);
    expect(parseInsights('nada a dizer')).toEqual([]);
    expect(parseInsights('[]')).toEqual([]);
  });
});

describe('computeVoiceMetrics', () => {
  it('measures your share and speaking pace', () => {
    const m = computeVoiceMetrics([
      { channel: 'microphone', text: Array(100).fill('a').join(' '), startMs: 0, endMs: 30_000 },
      { channel: 'system', text: 'oi', startMs: 30_000, endMs: 40_000 },
    ]);
    expect(m.yourShare).toBeCloseTo(0.75);
    expect(m.yourPace).toBeCloseTo(200);
    expect(m.yourLongestTurn).toBe(30);
  });
});

describe('tone alongside insights', () => {
  const raw =
    '{"tom":{"clima":"tenso","outros":"hesitante com o preço","voce":"defensivo"},"insights":[{"tipo":"risco","texto":"Ele duvidou do prazo."}]}';
  it('parses the combined object', () => {
    expect(parseInsights(raw)).toEqual([{ type: 'risk', text: 'Ele duvidou do prazo.' }]);
    expect(parseTone(raw)).toEqual({ mood: 'tense', others: 'hesitante com o preço', you: 'defensivo' });
  });
  it('ignores malformed or missing tone', () => {
    expect(parseTone('[{"tipo":"dica","texto":"Pergunte o prazo."}]')).toBeNull();
    expect(parseTone('{"tom":{"clima":"feliz"}}')).toBeNull();
  });
});

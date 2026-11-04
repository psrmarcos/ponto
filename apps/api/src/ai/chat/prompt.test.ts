import { describe, expect, it } from 'vitest';
import { buildMessages, HISTORY_TURNS } from './prompt';

const base = {
  agent: { prompt: 'PROMPT DO AGENTE' },
  settings: { userName: '', userContext: '' },
  history: [],
  request: { text: 'oi', shortcut: null, images: [] as string[] },
};

describe('buildMessages', () => {
  it('places the static prompt first and the user question last', () => {
    const m = buildMessages(base);
    expect(m[0]?.role).toBe('system');
    expect(JSON.stringify(m[0])).toContain('PROMPT DO AGENTE');
    expect(m.at(-1)).toEqual({ role: 'user', content: 'oi' });
  });

  it('limits history turns and truncates long old answers', () => {
    const history = Array.from({ length: 20 }, (_, i) => ({
      question: `p${i}`,
      pureQuestion: `p${i}`,
      answer: 'x'.repeat(5000),
      transcriptChars: 0,
    }));
    const m = buildMessages({ ...base, history });
    // system + 2 per turn + current question
    expect(m.length).toBe(1 + HISTORY_TURNS * 2 + 1);
    expect(m[1]?.content).toBe(`p${20 - HISTORY_TURNS}`);
    expect((m[2]?.content as string).length).toBeLessThan(1300);
  });

  it('uses shortcut text and places images before text', () => {
    const m = buildMessages({ ...base, request: { text: '', shortcut: 'followUp', images: ['data:image/png;base64,AA'] } });
    const last = m.at(-1)?.content as Array<{ type: string; text?: string }>;
    expect(last[0]?.type).toBe('image');
    expect(last[1]?.text).toMatch(/follow-up/);
  });

  it('marks the end of the stable prefix for caching', () => {
    const m = buildMessages({ ...base, settings: { userName: 'Marcos', userContext: 'dev' } });
    const parts = m[0]?.content as Array<{ cache?: boolean }>;
    expect(parts.map((p) => !!p.cache)).toEqual([false, true]);
  });
});

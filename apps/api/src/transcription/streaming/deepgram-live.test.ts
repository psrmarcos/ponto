import { afterEach, describe, expect, it } from 'vitest';
import { DeepgramLive, type ReadyUtterance } from './deepgram-live';

const openInstances: DeepgramLive[] = [];
afterEach(() => openInstances.splice(0).forEach((d) => d.close()));

function create() {
  const utterances: ReadyUtterance[] = [];
  const partials: string[] = [];
  const dg = new DeepgramLive('fake-key', { language: 'pt-BR', sttModel: 'nova-3' }, 'system', {
    utterance: (u) => utterances.push(u),
    partial: (t) => partials.push(t),
    error: () => undefined,
  });
  openInstances.push(dg);
  const receive = (r: object) => (dg as unknown as { onReceive: (r: object) => void }).onReceive(r);
  return { dg, utterances, partials, receive };
}

describe('DeepgramLive', () => {
  it('joins final segments and maps utterance to session time, skipping silence', () => {
    const { dg, utterances, partials, receive } = create();
    dg.audio(Buffer.alloc(32_000), 10_000);
    dg.audio(Buffer.alloc(32_000), 60_000);
    receive({ type: 'Results', start: 1.1, duration: 0.3, is_final: false, channel: { alternatives: [{ transcript: 'qual é' }] } });
    receive({ type: 'Results', start: 1.1, duration: 0.5, is_final: true, channel: { alternatives: [{ transcript: 'Qual é o' }] } });
    receive({ type: 'Results', start: 1.6, duration: 0.3, is_final: true, speech_final: true, channel: { alternatives: [{ transcript: 'prazo?' }] } });
    expect(partials).toEqual(['qual é', 'Qual é o']);
    expect(utterances).toEqual([{ text: 'Qual é o prazo?', startMs: 60_100, endMs: 60_900 }]);
  });

  it('UtteranceEnd closes the utterance even without speech_final', () => {
    const { dg, utterances, receive } = create();
    dg.audio(Buffer.alloc(32_000), 0);
    receive({ type: 'Results', start: 0, duration: 0.8, is_final: true, channel: { alternatives: [{ transcript: 'oi' }] } });
    expect(dg.hasOpenUtterance()).toBe(true);
    receive({ type: 'UtteranceEnd' });
    expect(utterances.map((u) => u.text)).toEqual(['oi']);
    expect(dg.hasOpenUtterance()).toBe(false);
  });

  it('closes utterance on a question and during continuous speech without silence', () => {
    const { dg, utterances, receive } = create();
    dg.audio(Buffer.alloc(32_000 * 30), 0);
    receive({ type: 'Results', start: 0, duration: 2, is_final: true, channel: { alternatives: [{ transcript: 'Qual é o prazo?' }] } });
    expect(utterances.map((u) => u.text)).toEqual(['Qual é o prazo?']);
    for (let i = 0; i < 8; i++) {
      receive({ type: 'Results', start: 2 + i * 2, duration: 2, is_final: true, channel: { alternatives: [{ transcript: `trecho ${i} sem fim` }] } });
    }
    expect(utterances.length).toBe(2);
    expect(utterances[1]!.endMs - utterances[1]!.startMs).toBeGreaterThanOrEqual(14_000);
  });
});

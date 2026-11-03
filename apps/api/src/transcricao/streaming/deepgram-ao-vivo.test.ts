import { afterEach, describe, expect, it } from 'vitest';
import { DeepgramAoVivo, type FalaPronta } from './deepgram-ao-vivo';

const abertos: DeepgramAoVivo[] = [];
afterEach(() => abertos.splice(0).forEach((d) => d.encerrar()));

function criar() {
  const falas: FalaPronta[] = [];
  const parciais: string[] = [];
  const dg = new DeepgramAoVivo('chave-falsa', { idioma: 'pt-BR', modeloStt: 'nova-3' }, 'sistema', {
    fala: (f) => falas.push(f),
    parcial: (t) => parciais.push(t),
    erro: () => undefined,
  });
  abertos.push(dg);
  // Não fala com o Deepgram de verdade: só a lógica de juntar e mapear o tempo.
  const receber = (r: object) => (dg as unknown as { aoReceber: (r: object) => void }).aoReceber(r);
  return { dg, falas, parciais, receber };
}

describe('DeepgramAoVivo', () => {
  it('junta os pedaços finais e põe a fala no horário da sessão, pulando o silêncio', () => {
    const { dg, falas, parciais, receber } = criar();
    // 1 s de áudio que começou aos 10 s da sessão e mais 1 s que começou aos 60 s.
    dg.audio(Buffer.alloc(32_000), 10_000);
    dg.audio(Buffer.alloc(32_000), 60_000);
    receber({ type: 'Results', start: 1.1, duration: 0.3, is_final: false, channel: { alternatives: [{ transcript: 'qual é' }] } });
    receber({ type: 'Results', start: 1.1, duration: 0.5, is_final: true, channel: { alternatives: [{ transcript: 'Qual é o' }] } });
    receber({ type: 'Results', start: 1.6, duration: 0.3, is_final: true, speech_final: true, channel: { alternatives: [{ transcript: 'prazo?' }] } });
    expect(parciais).toEqual(['qual é', 'Qual é o']);
    expect(falas).toEqual([{ texto: 'Qual é o prazo?', inicioMs: 60_100, fimMs: 60_900 }]);
  });

  it('UtteranceEnd fecha a fala mesmo sem speech_final', () => {
    const { dg, falas, receber } = criar();
    dg.audio(Buffer.alloc(32_000), 0);
    receber({ type: 'Results', start: 0, duration: 0.8, is_final: true, channel: { alternatives: [{ transcript: 'oi' }] } });
    expect(dg.temFalaAberta()).toBe(true);
    receber({ type: 'UtteranceEnd' });
    expect(falas.map((f) => f.texto)).toEqual(['oi']);
    expect(dg.temFalaAberta()).toBe(false);
  });

  it('fecha a fala numa pergunta e em fala corrida sem silêncio', () => {
    const { dg, falas, receber } = criar();
    dg.audio(Buffer.alloc(32_000 * 30), 0);
    receber({ type: 'Results', start: 0, duration: 2, is_final: true, channel: { alternatives: [{ transcript: 'Qual é o prazo?' }] } });
    expect(falas.map((f) => f.texto)).toEqual(['Qual é o prazo?']);
    for (let i = 0; i < 8; i++) {
      receber({ type: 'Results', start: 2 + i * 2, duration: 2, is_final: true, channel: { alternatives: [{ transcript: `trecho ${i} sem fim` }] } });
    }
    expect(falas.length).toBe(2);
    expect(falas[1]!.fimMs - falas[1]!.inicioMs).toBeGreaterThanOrEqual(14_000);
  });
});

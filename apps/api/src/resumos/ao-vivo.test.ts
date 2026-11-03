import { describe, expect, it } from 'vitest';
import { lerInsights, metricasVoz } from './ao-vivo.service';

describe('lerInsights', () => {
  it('lê JSON dentro de cerca de código', () => {
    expect(lerInsights('```json\n[{"tipo":"dica","texto":"Pergunte o prazo."}]\n```')).toEqual([{ tipo: 'dica', texto: 'Pergunte o prazo.' }]);
  });
  it('descarta tipo desconhecido e lixo', () => {
    expect(lerInsights('[{"tipo":"x","texto":"aaaa"}]')).toEqual([]);
    expect(lerInsights('nada a dizer')).toEqual([]);
    expect(lerInsights('[]')).toEqual([]);
  });
});

describe('metricasVoz', () => {
  it('mede sua parte e ritmo', () => {
    const m = metricasVoz([
      { canal: 'microfone', texto: Array(100).fill('a').join(' '), inicioMs: 0, fimMs: 30_000 },
      { canal: 'sistema', texto: 'oi', inicioMs: 30_000, fimMs: 40_000 },
    ]);
    expect(m.suaParte).toBeCloseTo(0.75);
    expect(m.seuRitmo).toBeCloseTo(200);
    expect(m.suaMaiorFala).toBe(30);
  });
});

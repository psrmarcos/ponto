import { describe, expect, it } from 'vitest';
import { lerInsights, lerTom, metricasVoz } from './ao-vivo.service';

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

describe('tom junto dos insights', () => {
  const bruto = '{"tom":{"clima":"tenso","outros":"hesitante com o preço","voce":"defensivo"},"insights":[{"tipo":"risco","texto":"Ele duvidou do prazo."}]}';
  it('lê o objeto novo', () => {
    expect(lerInsights(bruto)).toEqual([{ tipo: 'risco', texto: 'Ele duvidou do prazo.' }]);
    expect(lerTom(bruto)).toEqual({ clima: 'tenso', outros: 'hesitante com o preço', voce: 'defensivo' });
  });
  it('ignora tom estranho ou ausente', () => {
    expect(lerTom('[{"tipo":"dica","texto":"Pergunte o prazo."}]')).toBeNull();
    expect(lerTom('{"tom":{"clima":"feliz"}}')).toBeNull();
  });
});

import { describe, expect, it } from 'vitest';
import { DetectorFala, MS_QUADRO } from './vad';

const quadro = (amp: number) => {
  const q = new Float32Array(320);
  for (let i = 0; i < q.length; i++) q[i] = amp * Math.sin(i / 3) + (Math.random() - 0.5) * 0.0005;
  return q;
};

function rodar(sequencia: Array<[amp: number, ms: number]>) {
  const d = new DetectorFala();
  const trechos = [];
  let t = 0;
  for (const [amp, ms] of sequencia) {
    for (let i = 0; i < ms / MS_QUADRO; i++, t += MS_QUADRO) {
      const r = d.processar(quadro(amp), t);
      if (r) trechos.push(r);
    }
  }
  const resto = d.descarregar(t);
  if (resto) trechos.push(resto);
  return trechos;
}

describe('DetectorFala', () => {
  it('corta uma fala entre silêncios, com pre-roll e sem o silêncio do fim', () => {
    const [t, ...outros] = rodar([[0, 2000], [0.2, 1500], [0, 1500]]);
    expect(outros).toHaveLength(0);
    expect(t!.inicioMs).toBeGreaterThanOrEqual(1650);
    expect(t!.inicioMs).toBeLessThanOrEqual(2000);
    expect(t!.fimMs).toBeGreaterThan(3400);
    expect(t!.fimMs).toBeLessThan(3800);
    expect(t!.amostras.length).toBe(((t!.fimMs - t!.inicioMs) / 1000) * 16000);
  });

  it('ignora estalos curtos', () => {
    expect(rodar([[0, 1000], [0.3, 100], [0, 1500]])).toHaveLength(0);
  });

  it('separa duas falas com pausa longa e junta as com pausa curta', () => {
    expect(rodar([[0, 1000], [0.2, 800], [0, 300], [0.2, 800], [0, 1000]])).toHaveLength(1);
    expect(rodar([[0, 1000], [0.2, 800], [0, 1200], [0.2, 800], [0, 1000]])).toHaveLength(2);
  });

  it('não deixa um trecho passar do máximo', () => {
    const trechos = rodar([[0, 500], [0.2, 40_000], [0, 1000]]);
    expect(trechos.length).toBeGreaterThanOrEqual(2);
    for (const t of trechos) expect(t.fimMs - t.inicioMs).toBeLessThanOrEqual(25_400);
  });
});

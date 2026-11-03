import { describe, expect, it } from 'vitest';
import { CHARS_CRUS_NO_FIM, escolherLote, LIMITE_CHARS_BRUTOS } from './compactacao.service';

const falas = (n: number, tam: number) => Array.from({ length: n }, (_, i) => ({ texto: 'x'.repeat(tam), inicioMs: i * 1000 }));

describe('escolherLote', () => {
  it('não resume enquanto cabe', () => {
    expect(escolherLote(falas(10, 100))).toEqual([]);
  });
  it('resume o começo e deixa o fim cru', () => {
    const lista = falas(100, 200);
    const lote = escolherLote(lista);
    expect(lote.length).toBeGreaterThan(0);
    const resto = lista.slice(lote.length).reduce((n, f) => n + f.texto.length + 16, 0);
    expect(resto).toBeGreaterThanOrEqual(CHARS_CRUS_NO_FIM);
    expect(resto).toBeLessThan(LIMITE_CHARS_BRUTOS);
  });
});

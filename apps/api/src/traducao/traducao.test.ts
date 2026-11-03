import { describe, expect, it } from 'vitest';
import { lerAprendizado } from './traducao.service';

describe('lerAprendizado', () => {
  it('lê o JSON mesmo com texto em volta', () => {
    expect(lerAprendizado('```json\n{"traducao": "I want to go", "correcao": null}\n```')).toEqual({ texto: 'I want to go', correcao: null });
  });
  it('sem JSON, usa o texto como tradução', () => {
    expect(lerAprendizado('Olá')).toEqual({ texto: 'Olá', correcao: null });
  });
});

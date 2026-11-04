import { describe, expect, it } from 'vitest';
import { parseLearningResult } from './translation.service';

describe('parseLearningResult', () => {
  it('parses JSON even with surrounding text', () => {
    expect(parseLearningResult('```json\n{"traducao": "I want to go", "correcao": null}\n```')).toEqual({
      text: 'I want to go',
      correction: null,
    });
  });
  it('falls back to raw text as translation when no JSON is present', () => {
    expect(parseLearningResult('Olá')).toEqual({ text: 'Olá', correction: null });
  });
});

import { describe, expect, it } from 'vitest';
import { ehAlucinacao } from './alucinacoes';

describe('ehAlucinacao', () => {
  it('descarta as frases típicas do Whisper', () => {
    expect(ehAlucinacao(' Legendas pela comunidade Amara.org', 3)).toBe(true);
    expect(ehAlucinacao('Obrigado por assistir!', 2)).toBe(true);
    expect(ehAlucinacao('   ', 2)).toBe(true);
    expect(ehAlucinacao('[Música]', 4)).toBe(true);
  });
  it('só desconfia de "obrigado" quando o trecho é curtinho', () => {
    expect(ehAlucinacao('Obrigado.', 0.8)).toBe(true);
    expect(ehAlucinacao('Obrigado.', 2.5)).toBe(false);
  });
  it('mantém falas reais', () => {
    expect(ehAlucinacao('Obrigado por explicar, agora entendi o useEffect.', 3)).toBe(false);
    expect(ehAlucinacao('Você pode me explicar closures?', 2)).toBe(false);
  });
});

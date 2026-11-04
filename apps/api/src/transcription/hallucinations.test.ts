import { describe, expect, it } from 'vitest';
import { isHallucination } from './hallucinations';

describe('isHallucination', () => {
  it('discards typical Whisper subtitle hallucinations', () => {
    expect(isHallucination(' Legendas pela comunidade Amara.org', 3)).toBe(true);
    expect(isHallucination('Obrigado por assistir!', 2)).toBe(true);
    expect(isHallucination('   ', 2)).toBe(true);
    expect(isHallucination('[Música]', 4)).toBe(true);
  });
  it('only distrusts "obrigado" when the clip is very short', () => {
    expect(isHallucination('Obrigado.', 0.8)).toBe(true);
    expect(isHallucination('Obrigado.', 2.5)).toBe(false);
  });
  it('preserves real utterances', () => {
    expect(isHallucination('Obrigado por explicar, agora entendi o useEffect.', 3)).toBe(false);
    expect(isHallucination('Você pode me explicar closures?', 2)).toBe(false);
  });
});

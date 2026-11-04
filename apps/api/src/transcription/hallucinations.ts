/**
 * Whisper "hallucinates" phrases when given noise or near-silence, almost always
 * the same ones (coming from video subtitles used in training). We discard the
 * entire utterance when it consists solely of one of these phrases.
 */
const PHRASES = [
  'legendas pela comunidade amara org',
  'legendado pela comunidade amara org',
  'obrigado por assistir',
  'obrigada por assistir',
  'obrigado por assistirem',
  'inscreva se no canal',
  'se inscreva no canal',
  'thank you for watching',
  'thanks for watching',
  'subtitles by the amara org community',
  'please subscribe',
  'gracias por ver',
  'subtitulos realizados por la comunidad de amara org',
  'tchau tchau',
  'musica',
  'music',
  'aplausos',
  'risos',
];
/** Too short to trust when the audio clip itself is also very short. */
const SHORT_WORDS = ['obrigado', 'obrigada', 'tchau', 'thank you', 'you', 'e ai', 'ok'];

export function normalize(t: string): string {
  return t
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function isHallucination(text: string, durationSec: number): boolean {
  const n = normalize(text);
  if (!n) return true;
  if (PHRASES.some((p) => n === p || n.replace(/ /g, '') === p.replace(/ /g, ''))) return true;
  if (durationSec < 1.5 && SHORT_WORDS.includes(n)) return true;
  return false;
}

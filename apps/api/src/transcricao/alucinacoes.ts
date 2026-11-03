/**
 * O Whisper "inventa" frases quando recebe ruído ou quase silêncio, quase sempre
 * as mesmas (vêm de legendas de vídeo usadas no treino). Descartamos a fala
 * inteira quando ela é só uma dessas frases.
 */
const FRASES = [
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
/** Curtas demais para confiar quando o trecho também é curto. */
const CURTAS = ['obrigado', 'obrigada', 'tchau', 'thank you', 'you', 'e ai', 'ok'];

export function normalizar(t: string): string {
  return t
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function ehAlucinacao(texto: string, duracaoS: number): boolean {
  const n = normalizar(texto);
  if (!n) return true;
  if (FRASES.some((f) => n === f || n.replace(/ /g, '') === f.replace(/ /g, ''))) return true;
  if (duracaoS < 1.5 && CURTAS.includes(n)) return true;
  return false;
}

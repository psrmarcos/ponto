import { desktopCapturer, screen } from 'electron';

/** Lado maior do print. Mais que isso só gasta tokens: o texto de slides e código segue legível. */
const LADO_MAXIMO = 1600;
/** Acima disso a imagem pesa no upload e no custo; baixa a qualidade. */
const MAX_BYTES = 350 * 1024;

/**
 * Print da tela onde está o cursor (quem tem dois monitores normalmente olha
 * para aquele em que está mexendo). As janelas do Ponto não aparecem quando a
 * invisibilidade está ligada, porque o próprio Windows/macOS as tira da captura.
 */
export async function capturarTela(): Promise<string> {
  const tela = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const { width, height } = tela.size;
  const escala = Math.min(1, LADO_MAXIMO / Math.max(width, height)) * tela.scaleFactor;
  const tamanho = {
    width: Math.round(Math.min(width * escala, LADO_MAXIMO)),
    height: Math.round(Math.min(height * escala, LADO_MAXIMO)),
  };
  const fontes = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: tamanho });
  const fonte = fontes.find((f) => f.display_id === String(tela.id)) ?? fontes[0];
  if (!fonte || fonte.thumbnail.isEmpty()) throw new Error('Não consegui capturar a tela.');
  for (const qualidade of [72, 55, 40]) {
    const jpeg = fonte.thumbnail.toJPEG(qualidade);
    if (jpeg.byteLength <= MAX_BYTES || qualidade === 40) return `data:image/jpeg;base64,${jpeg.toString('base64')}`;
  }
  throw new Error('inalcançável');
}

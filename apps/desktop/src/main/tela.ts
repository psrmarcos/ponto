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
export async function capturarTela(opcoes: { ladoMaximo?: number; maxBytes?: number } = {}): Promise<string> {
  const lado = opcoes.ladoMaximo ?? LADO_MAXIMO;
  const fonte = await fonteDaTela(lado);
  const limite = opcoes.maxBytes ?? MAX_BYTES;
  for (const qualidade of [72, 55, 40]) {
    const jpeg = fonte.thumbnail.toJPEG(qualidade);
    if (jpeg.byteLength <= limite || qualidade === 40) return `data:image/jpeg;base64,${jpeg.toString('base64')}`;
  }
  throw new Error('inalcançável');
}

async function fonteDaTela(lado: number) {
  const tela = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const { width, height } = tela.size;
  const escala = Math.min(1, lado / Math.max(width, height)) * tela.scaleFactor;
  const tamanho = {
    width: Math.round(Math.min(width * escala, lado)),
    height: Math.round(Math.min(height * escala, lado)),
  };
  const fontes = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: tamanho });
  const fonte = fontes.find((f) => f.display_id === String(tela.id)) ?? fontes[0];
  if (!fonte || fonte.thumbnail.isEmpty()) throw new Error('Não consegui capturar a tela.');
  return fonte;
}

/** Miniatura em tons de cinza (64x36) para comparar se a tela mudou, sem mandar nada para a IA. */
export async function assinaturaDaTela(): Promise<Uint8Array> {
  const fonte = await fonteDaTela(64);
  const img = fonte.thumbnail.resize({ width: 64, height: 36, quality: 'good' });
  const bgra = img.toBitmap();
  const cinza = new Uint8Array(64 * 36);
  for (let i = 0; i < cinza.length; i++) cinza[i] = (bgra[i * 4]! + bgra[i * 4 + 1]! + bgra[i * 4 + 2]!) / 3;
  return cinza;
}

/** Quanto mudou (0 a 1): parte dos pixels que mudaram bastante. Cursor e relógio mexem pouco. */
export function diferenca(a: Uint8Array, b: Uint8Array): number {
  let mudou = 0;
  for (let i = 0; i < a.length; i++) if (Math.abs(a[i]! - b[i]!) > 24) mudou++;
  return mudou / a.length;
}

const INTERVALO_AUTO_MS = 2500;
const MUDANCA_MINIMA = 0.08;
const MIN_ENTRE_LEITURAS_MS = 20_000;

/**
 * Leitura automática: olha a tela a cada 2,5 s (miniatura local, de graça) e,
 * quando ela muda bastante e para de mudar (slide novo, outro arquivo de código),
 * lê de verdade. No máximo uma leitura a cada 20 s, para não gastar à toa.
 */
export class LeituraAutomatica {
  private timer: NodeJS.Timeout | null = null;
  private base: Uint8Array | null = null;
  private anterior: Uint8Array | null = null;
  private pendente = false;
  private ultimaLeitura = 0;

  /**
   * `podeOlhar`: com a invisibilidade desligada as janelas do Ponto entram no print,
   * e a própria resposta chegando no chat contaria como "a tela mudou" (laço sem fim).
   */
  constructor(
    private readonly ler: () => Promise<void>,
    private readonly podeOlhar: () => boolean,
  ) {}

  get ligada(): boolean {
    return this.timer !== null;
  }

  definir(ligada: boolean): void {
    if (ligada === this.ligada) return;
    if (!ligada) {
      clearInterval(this.timer!);
      this.timer = null;
      this.base = this.anterior = null;
      this.pendente = false;
      return;
    }
    this.timer = setInterval(() => void this.olhar(), INTERVALO_AUTO_MS);
    void this.olhar();
  }

  private async olhar(): Promise<void> {
    if (!this.podeOlhar()) {
      this.base = this.anterior = null;
      return;
    }
    let atual: Uint8Array;
    try {
      atual = await assinaturaDaTela();
    } catch {
      return;
    }
    const anterior = this.anterior;
    this.anterior = atual;
    if (!this.base) {
      this.base = atual;
      return;
    }
    if (diferenca(this.base, atual) >= MUDANCA_MINIMA) this.pendente = true;
    // Só lê quando a tela parou de mudar (rolagem ou animação terminou).
    const parada = anterior !== null && diferenca(anterior, atual) < 0.02;
    if (!this.pendente || !parada || Date.now() - this.ultimaLeitura < MIN_ENTRE_LEITURAS_MS) return;
    this.pendente = false;
    this.base = atual;
    this.ultimaLeitura = Date.now();
    await this.ler().catch(() => undefined);
  }
}

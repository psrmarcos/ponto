/**
 * Detector de fala por energia, com piso de ruído adaptativo.
 *
 * Corta o áudio contínuo em falas: começa quando o volume passa do ruído de
 * fundo por alguns quadros e termina depois de um silêncio curto. Cada fala vira
 * um pedido de transcrição, então cortar bem é o que mais pesa no custo e na
 * qualidade (sem silêncio pago, sem palavra cortada no meio).
 */

export const MS_QUADRO = 20;

export interface OpcoesVad {
  /** Quanto acima do ruído de fundo conta como fala (dB). */
  margemDb: number;
  /** Abaixo disso nunca é fala, mesmo num ambiente muito silencioso (dBFS). */
  minimoDb: number;
  /** Quadros seguidos de fala para começar (evita cliques e batidas). */
  quadrosParaComecar: number;
  /** Áudio de antes do início que entra junto (não corta a primeira sílaba). */
  preRollMs: number;
  /** Silêncio que encerra a fala. */
  silencioFimMs: number;
  /** Fala longa: depois disso, corta na primeira pausa curta. */
  cortarAposMs: number;
  pausaCurtaMs: number;
  /** Corte forçado, mesmo sem pausa. */
  maximoMs: number;
  /** Falas com menos fala que isso são descartadas. */
  minimoFalaMs: number;
}

export const VAD_PADRAO: OpcoesVad = {
  margemDb: 10,
  minimoDb: -52,
  quadrosParaComecar: 3,
  preRollMs: 300,
  silencioFimMs: 700,
  cortarAposMs: 12_000,
  pausaCurtaMs: 250,
  maximoMs: 25_000,
  minimoFalaMs: 350,
};

export interface TrechoFala {
  inicioMs: number;
  fimMs: number;
  amostras: Float32Array;
}

export class DetectorFala {
  private piso = -60;
  private falando = false;
  private seguidosFala = 0;
  private seguidosSilencio = 0;
  private quadrosFala = 0;
  private inicioMs = 0;
  private preRoll: Float32Array[] = [];
  private atual: Float32Array[] = [];
  private _nivel = 0;

  constructor(private readonly o: OpcoesVad = VAD_PADRAO) {}

  /** Volume atual de 0 a 1, suavizado, para o medidor. */
  get nivel(): number {
    return this._nivel;
  }

  /** `tMs` é o instante do início do quadro. Devolve um trecho quando uma fala termina. */
  processar(quadro: Float32Array, tMs: number): TrechoFala | null {
    const db = decibeis(quadro);
    this.atualizarNivel(db);
    const ehFala = db > Math.max(this.piso + this.o.margemDb, this.o.minimoDb);
    // Piso: desce rápido (ruído novo menor), sobe devagar (~1 dB/s) para não "aprender" a voz.
    if (!ehFala || !this.falando) this.piso = db < this.piso ? this.piso * 0.9 + db * 0.1 : this.piso + 0.02;
    this.piso = Math.min(-30, Math.max(-90, this.piso));

    if (!this.falando) {
      this.seguidosFala = ehFala ? this.seguidosFala + 1 : 0;
      this.preRoll.push(quadro);
      const maxPre = Math.ceil(this.o.preRollMs / MS_QUADRO) + this.o.quadrosParaComecar;
      if (this.preRoll.length > maxPre) this.preRoll.shift();
      if (this.seguidosFala >= this.o.quadrosParaComecar) {
        this.falando = true;
        this.atual = this.preRoll;
        this.preRoll = [];
        this.inicioMs = Math.max(0, tMs - (this.atual.length - 1) * MS_QUADRO);
        this.quadrosFala = this.seguidosFala;
        this.seguidosSilencio = 0;
      }
      return null;
    }

    this.atual.push(quadro);
    if (ehFala) {
      this.quadrosFala++;
      this.seguidosSilencio = 0;
    } else {
      this.seguidosSilencio++;
    }
    const duracao = this.atual.length * MS_QUADRO;
    const silencio = this.seguidosSilencio * MS_QUADRO;
    if (
      silencio >= this.o.silencioFimMs ||
      (duracao >= this.o.cortarAposMs && silencio >= this.o.pausaCurtaMs) ||
      duracao >= this.o.maximoMs
    ) {
      return this.fechar(tMs + MS_QUADRO);
    }
    return null;
  }

  /** Fecha o que estiver em andamento (pausa ou fim da sessão). */
  descarregar(tMs: number): TrechoFala | null {
    return this.falando ? this.fechar(tMs) : null;
  }

  /** Esquece o que estava ouvindo sem gerar trecho. */
  reiniciar(): void {
    this.falando = false;
    this.atual = [];
    this.preRoll = [];
    this.seguidosFala = 0;
    this.seguidosSilencio = 0;
  }

  private fechar(fimMs: number): TrechoFala | null {
    // Tira o silêncio do fim, deixando uma folga de 200 ms.
    const sobra = Math.max(0, this.seguidosSilencio - Math.round(200 / MS_QUADRO));
    const quadros = sobra ? this.atual.slice(0, this.atual.length - sobra) : this.atual;
    const fala = this.quadrosFala * MS_QUADRO;
    const inicioMs = this.inicioMs;
    this.reiniciar();
    if (fala < this.o.minimoFalaMs || !quadros.length) return null;
    const amostras = new Float32Array(quadros.reduce((n, q) => n + q.length, 0));
    let o = 0;
    for (const q of quadros) {
      amostras.set(q, o);
      o += q.length;
    }
    return { inicioMs, fimMs: fimMs - sobra * MS_QUADRO, amostras };
  }

  private atualizarNivel(db: number): void {
    const alvo = Math.min(1, Math.max(0, (db + 60) / 50));
    this._nivel = alvo > this._nivel ? alvo : this._nivel * 0.85 + alvo * 0.15;
  }
}

export function decibeis(q: Float32Array): number {
  let s = 0;
  for (let i = 0; i < q.length; i++) s += q[i]! * q[i]!;
  return 10 * Math.log10(s / q.length + 1e-12);
}

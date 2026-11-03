import type { CanalAudio } from '@ponto/shared';

/** Áudio de antes do detector perceber a fala (não corta a primeira sílaba). */
const QUADROS_PRE_ROLL = 15;
/**
 * Depois que a fala acaba, segue mandando um pouco de silêncio: é ele que faz o
 * Deepgram fechar a frase (endpointing de 400 ms).
 */
const QUADROS_RESPIRO = 45;
/** Junta 5 quadros (100 ms) por mensagem. */
const QUADROS_POR_MENSAGEM = 5;

/**
 * Streaming de um canal para a API (que repassa ao Deepgram). Só manda áudio
 * quando há fala, para não pagar silêncio. Se a API recusar ou a conexão cair,
 * `falhou` fica true e a captura volta a mandar as falas em lote.
 */
export class StreamCanal {
  private ws: WebSocket;
  private aberto = false;
  falhou = false;
  private preRoll: Array<{ q: Float32Array; t: number }> = [];
  private respiro = 0;
  private ativo = false;
  private lote: Float32Array[] = [];
  private fila: ArrayBuffer[] = [];
  private loteT = 0;

  constructor(urlWs: string, token: string, sessaoId: string, canal: CanalAudio) {
    const base = urlWs.replace(/\/ws$/, '/audio');
    const q = new URLSearchParams({ token, sessaoId, canal });
    this.ws = new WebSocket(`${base}?${q}`);
    this.ws.binaryType = 'arraybuffer';
    this.ws.onopen = () => {
      this.aberto = true;
      for (const b of this.fila) this.ws.send(b);
      this.fila = [];
    };
    this.ws.onclose = () => {
      this.aberto = false;
      this.falhou = true;
    };
  }

  processar(quadro: Float32Array, tMs: number, emFala: boolean, podeComecar: boolean): void {
    if (this.falhou) return;
    if (emFala && (this.ativo || podeComecar)) {
      if (!this.ativo) {
        this.ativo = true;
        for (const p of this.preRoll) this.adicionar(p.q, p.t);
        this.preRoll = [];
      }
      this.respiro = QUADROS_RESPIRO;
    } else if (this.ativo && this.respiro > 0) {
      this.respiro--;
      if (this.respiro === 0) {
        this.ativo = false;
        this.despachar();
      }
    } else {
      this.preRoll.push({ q: quadro, t: tMs });
      if (this.preRoll.length > QUADROS_PRE_ROLL) this.preRoll.shift();
      return;
    }
    this.adicionar(quadro, tMs);
  }

  fechar(): void {
    this.despachar();
    this.falhou = true;
    this.ws.close(1000);
  }

  private adicionar(q: Float32Array, t: number): void {
    if (!this.lote.length) this.loteT = t;
    this.lote.push(q);
    if (this.lote.length >= QUADROS_POR_MENSAGEM) this.despachar();
  }

  private despachar(): void {
    if (!this.lote.length) return;
    const amostras = this.lote.reduce((n, q) => n + q.length, 0);
    const buf = new ArrayBuffer(8 + amostras * 2);
    const v = new DataView(buf);
    v.setFloat64(0, this.loteT, true);
    let o = 8;
    for (const q of this.lote) {
      for (let i = 0; i < q.length; i++) {
        const s = Math.max(-1, Math.min(1, q[i]!));
        v.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true);
        o += 2;
      }
    }
    this.lote = [];
    if (this.aberto) this.ws.send(buf);
    else if (this.fila.length < 100) this.fila.push(buf);
  }
}

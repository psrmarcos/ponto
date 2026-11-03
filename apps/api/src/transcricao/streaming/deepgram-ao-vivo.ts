import { WebSocket } from 'ws';
import type { CanalAudio, Configuracoes } from '@ponto/shared';

/** Preço de tabela do Nova-3 em streaming, por minuto de áudio enviado (multilíngue custa mais). */
export const USD_POR_MINUTO_STREAMING = 0.0077;
export const USD_POR_MINUTO_STREAMING_MULTI = 0.0092;
/** Bytes por segundo de PCM 16 kHz, 16 bits, mono. */
const BYTES_POR_SEGUNDO = 32_000;
/** O Deepgram fecha a conexão depois de ~10 s sem áudio; o KeepAlive segura. */
const KEEPALIVE_MS = 4000;

interface RespostaDeepgram {
  type?: string;
  start?: number;
  duration?: number;
  is_final?: boolean;
  speech_final?: boolean;
  from_finalize?: boolean;
  channel?: { alternatives?: Array<{ transcript?: string }> };
}

export interface FalaPronta {
  texto: string;
  inicioMs: number;
  fimMs: number;
}

export interface OuvintesAoVivo {
  parcial: (texto: string, inicioMs: number) => void;
  fala: (f: FalaPronta) => void;
  erro: (mensagem: string) => void;
}

/**
 * Uma conexão de streaming com o Deepgram para um canal (microfone ou sistema).
 *
 * A captura só manda áudio quando há fala (mais um respiro antes e depois),
 * então o relógio do stream do Deepgram pula os silêncios. Cada pedaço chega com
 * o seu tempo na sessão, e aqui guardamos o mapa "segundo do stream → ms da
 * sessão" para as falas terem o horário certo.
 */
export class DeepgramAoVivo {
  private ws: WebSocket;
  private aberto = false;
  private fila: Buffer[] = [];
  /** Início de cada pedaço: ms no stream e ms na sessão. */
  private mapa: Array<{ streamMs: number; sessaoMs: number }> = [];
  private streamMs = 0;
  private cobradoMs = 0;
  private ultimoEnvio = Date.now();
  private keepalive: NodeJS.Timeout;
  /** Pedaços finais da fala em andamento (o Deepgram fecha a fala em vários is_final). */
  private finais: string[] = [];
  private inicioS: number | null = null;
  private fimS = 0;
  private encerrando = false;
  readonly multi: boolean;

  constructor(
    chave: string,
    config: Pick<Configuracoes, 'idioma' | 'modeloStt'>,
    readonly canal: CanalAudio,
    private readonly ouvintes: OuvintesAoVivo,
  ) {
    this.multi = config.idioma === 'auto';
    const q = new URLSearchParams({
      model: config.modeloStt || 'nova-3',
      encoding: 'linear16',
      sample_rate: '16000',
      channels: '1',
      interim_results: 'true',
      smart_format: 'true',
      punctuate: 'true',
      // Fecha a fala depois de 400 ms de silêncio; o UtteranceEnd cobre quando o endpointing não dispara.
      endpointing: '400',
      utterance_end_ms: '1200',
      vad_events: 'true',
      // "multi" é o modo de várias línguas do Nova-3 (troca de idioma no meio da fala).
      language: this.multi ? 'multi' : config.idioma,
    });
    this.ws = new WebSocket(`wss://api.deepgram.com/v1/listen?${q}`, { headers: { Authorization: `Token ${chave}` } });
    this.ws.on('open', () => {
      this.aberto = true;
      for (const b of this.fila) this.ws.send(b);
      this.fila = [];
    });
    this.ws.on('message', (dados, binario) => {
      if (binario) return;
      try {
        this.aoReceber(JSON.parse(dados.toString()) as RespostaDeepgram);
      } catch {
        /* mensagem que não é JSON: ignora */
      }
    });
    this.ws.on('unexpected-response', (_req, res) => {
      const s = res.statusCode ?? 0;
      this.ouvintes.erro(
        s === 401 || s === 403
          ? 'A chave do Deepgram foi recusada. Confira em Perfil.'
          : s === 402
            ? 'Sem crédito no Deepgram para transcrever.'
            : `O Deepgram recusou o streaming (${s}).`,
      );
    });
    this.ws.on('error', () => undefined); // o close logo em seguida trata
    this.ws.on('close', (codigo) => {
      clearInterval(this.keepalive);
      this.fecharFala();
      this.aberto = false;
      if (!this.encerrando && codigo !== 1000) this.ouvintes.erro('A conexão de streaming com o Deepgram caiu.');
    });
    this.keepalive = setInterval(() => {
      if (this.aberto && Date.now() - this.ultimoEnvio > KEEPALIVE_MS) this.enviarJson({ type: 'KeepAlive' });
    }, KEEPALIVE_MS);
  }

  get ativo(): boolean {
    return this.ws.readyState <= WebSocket.OPEN && !this.encerrando;
  }

  /** Áudio ainda não cobrado (em ms); zera o contador. */
  cobrar(): number {
    const ms = this.streamMs - this.cobradoMs;
    this.cobradoMs = this.streamMs;
    return ms;
  }

  /** Um pedaço de PCM 16 bits mono 16 kHz que começa em `sessaoMs`. */
  audio(pcm: Buffer, sessaoMs: number): void {
    if (this.encerrando || !pcm.length) return;
    this.mapa.push({ streamMs: this.streamMs, sessaoMs });
    // Mapa só cresce durante a sessão; os mais antigos já não servem depois de fechar as falas.
    if (this.mapa.length > 4000) this.mapa.splice(0, 2000);
    this.streamMs += (pcm.length / BYTES_POR_SEGUNDO) * 1000;
    this.ultimoEnvio = Date.now();
    if (this.aberto) this.ws.send(pcm);
    else this.fila.push(pcm);
  }

  /** Pede ao Deepgram para fechar já o que ouviu (o chat precisa da pergunta inteira). */
  finalizar(): void {
    if (this.aberto && (this.finais.length || this.inicioS !== null)) this.enviarJson({ type: 'Finalize' });
  }

  temFalaAberta(): boolean {
    return this.finais.length > 0;
  }

  encerrar(): void {
    if (this.encerrando) return;
    this.encerrando = true;
    if (this.aberto) this.enviarJson({ type: 'CloseStream' });
    // O Deepgram manda o que faltava e fecha; se não fechar, fecha à força.
    setTimeout(() => this.ws.terminate(), 3000).unref();
  }

  private enviarJson(o: object): void {
    try {
      this.ws.send(JSON.stringify(o));
    } catch {
      /* conexão fechando */
    }
  }

  private aoReceber(r: RespostaDeepgram): void {
    if (r.type === 'UtteranceEnd') return this.fecharFala();
    if (r.type !== 'Results') return;
    const texto = (r.channel?.alternatives?.[0]?.transcript ?? '').trim();
    const start = r.start ?? 0;
    if (texto && this.inicioS === null) this.inicioS = start;
    if (r.is_final) {
      if (texto) {
        this.finais.push(texto);
        this.fimS = start + (r.duration ?? 0);
      }
      if (r.speech_final || r.from_finalize) return this.fecharFala();
      if (this.finais.length) this.ouvintes.parcial(this.finais.join(' '), this.paraSessao(this.inicioS ?? start));
      return;
    }
    if (!texto && !this.finais.length) return;
    this.ouvintes.parcial([...this.finais, texto].filter(Boolean).join(' '), this.paraSessao(this.inicioS ?? start));
  }

  private fecharFala(): void {
    const texto = this.finais.join(' ').trim();
    const inicio = this.inicioS;
    this.finais = [];
    this.inicioS = null;
    if (!texto || inicio === null) {
      if (inicio !== null) this.ouvintes.parcial('', this.paraSessao(inicio));
      return;
    }
    const inicioMs = this.paraSessao(inicio);
    const fimMs = Math.max(inicioMs, this.paraSessao(this.fimS));
    this.ouvintes.fala({ texto, inicioMs, fimMs });
  }

  /** Segundo do stream → ms da sessão, pelo pedaço que contém aquele instante. */
  private paraSessao(s: number): number {
    const ms = s * 1000;
    let lo = 0;
    let hi = this.mapa.length - 1;
    if (hi < 0) return Math.round(ms);
    while (lo < hi) {
      const meio = (lo + hi + 1) >> 1;
      if (this.mapa[meio]!.streamMs <= ms) lo = meio;
      else hi = meio - 1;
    }
    const p = this.mapa[lo]!;
    return Math.round(p.sessaoMs + Math.max(0, ms - p.streamMs));
  }
}

import { WebSocket } from 'ws';
import type { AudioChannel, Settings } from '@ponto/shared';

export const USD_PER_MINUTE_STREAMING = 0.0077;
export const USD_PER_MINUTE_STREAMING_MULTI = 0.0092;
const BYTES_PER_SECOND = 32_000;
const KEEPALIVE_MS = 3000;
const CHECK_KEEPALIVE_MS = 1000;
const CLOSE_SENTENCE_AFTER_SEC = 5;
const FORCE_CLOSE_AFTER_SEC = 14;

interface DeepgramResponse {
  type?: string;
  start?: number;
  duration?: number;
  is_final?: boolean;
  speech_final?: boolean;
  from_finalize?: boolean;
  channel?: { alternatives?: Array<{ transcript?: string }> };
}

export interface ReadyUtterance {
  text: string;
  startMs: number;
  endMs: number;
}

export interface LiveListeners {
  partial: (text: string, startMs: number) => void;
  utterance: (u: ReadyUtterance) => void;
  error: (message: string) => void;
}

export class DeepgramLive {
  private ws: WebSocket;
  private open = false;
  private queue: Buffer[] = [];
  private timeMap: Array<{ streamMs: number; sessionMs: number }> = [];
  private streamMs = 0;
  private billedMs = 0;
  private lastSentAt = Date.now();
  private keepalive: NodeJS.Timeout;
  private finals: string[] = [];
  private startSec: number | null = null;
  private endSec = 0;
  private closing = false;
  readonly multi: boolean;

  constructor(
    key: string,
    cfg: Pick<Settings, 'language' | 'sttModel'>,
    readonly channel: AudioChannel,
    private readonly listeners: LiveListeners,
  ) {
    this.multi = cfg.language === 'auto';
    const q = new URLSearchParams({
      model: cfg.sttModel || 'nova-3',
      encoding: 'linear16',
      sample_rate: '16000',
      channels: '1',
      interim_results: 'true',
      smart_format: 'true',
      punctuate: 'true',
      endpointing: '400',
      utterance_end_ms: '1200',
      vad_events: 'true',
      language: this.multi ? 'multi' : cfg.language,
    });
    this.ws = new WebSocket(`wss://api.deepgram.com/v1/listen?${q}`, { headers: { Authorization: `Token ${key}` } });
    this.ws.on('open', () => {
      this.open = true;
      for (const b of this.queue) this.ws.send(b);
      this.queue = [];
    });
    this.ws.on('message', (data, binary) => {
      if (binary) return;
      try {
        this.onReceive(JSON.parse(data.toString()) as DeepgramResponse);
      } catch {
      }
    });
    this.ws.on('unexpected-response', (_req, res) => {
      const s = res.statusCode ?? 0;
      this.fail(
        s === 401 || s === 403
          ? 'A chave do Deepgram foi recusada. Confira em Perfil.'
          : s === 402
            ? 'Sem crédito no Deepgram para transcrever.'
            : `O Deepgram recusou o streaming (${s}).`,
      );
    });
    this.ws.on('error', () => undefined);
    this.ws.on('close', (code) => {
      clearInterval(this.keepalive);
      this.closeUtterance();
      this.open = false;
      this.fail(`A conexão de streaming com o Deepgram caiu (${code}).`);
    });
    this.keepalive = setInterval(() => {
      if (this.open && Date.now() - this.lastSentAt > KEEPALIVE_MS) this.sendJson({ type: 'KeepAlive' });
    }, CHECK_KEEPALIVE_MS);
  }

  private notifiedError = false;
  private fail(message: string): void {
    if (this.notifiedError || this.closing) return;
    this.notifiedError = true;
    this.listeners.error(message);
  }

  get active(): boolean {
    return this.ws.readyState <= WebSocket.OPEN && !this.closing;
  }

  bill(): number {
    const ms = this.streamMs - this.billedMs;
    this.billedMs = this.streamMs;
    return ms;
  }

  audio(pcm: Buffer, sessionMs: number): void {
    if (this.closing || !pcm.length) return;
    this.timeMap.push({ streamMs: this.streamMs, sessionMs });
    if (this.timeMap.length > 4000) this.timeMap.splice(0, 2000);
    this.streamMs += (pcm.length / BYTES_PER_SECOND) * 1000;
    this.lastSentAt = Date.now();
    if (this.open) this.ws.send(pcm);
    else this.queue.push(pcm);
  }

  finalize(): void {
    if (this.open && (this.finals.length || this.startSec !== null)) this.sendJson({ type: 'Finalize' });
  }

  hasOpenUtterance(): boolean {
    return this.finals.length > 0;
  }

  close(): void {
    if (this.closing) return;
    this.closing = true;
    if (this.open) this.sendJson({ type: 'CloseStream' });
    setTimeout(() => this.ws.terminate(), 3000).unref();
  }

  private sendJson(o: object): void {
    try {
      this.ws.send(JSON.stringify(o));
    } catch {
    }
  }

  private onReceive(r: DeepgramResponse): void {
    if (r.type === 'UtteranceEnd') return this.closeUtterance();
    if (r.type !== 'Results') return;
    const text = (r.channel?.alternatives?.[0]?.transcript ?? '').trim();
    const start = r.start ?? 0;
    if (text && this.startSec === null) this.startSec = start;
    if (r.is_final) {
      if (text) {
        this.finals.push(text);
        this.endSec = start + (r.duration ?? 0);
      }
      if (r.speech_final || r.from_finalize) return this.closeUtterance();
      const duration = this.endSec - (this.startSec ?? this.endSec);
      if (
        text &&
        (/\?$/.test(text) || (/[.!]$/.test(text) && duration >= CLOSE_SENTENCE_AFTER_SEC) || duration >= FORCE_CLOSE_AFTER_SEC)
      ) {
        return this.closeUtterance();
      }
      if (this.finals.length) this.listeners.partial(this.finals.join(' '), this.toSessionMs(this.startSec ?? start));
      return;
    }
    if (!text && !this.finals.length) return;
    this.listeners.partial([...this.finals, text].filter(Boolean).join(' '), this.toSessionMs(this.startSec ?? start));
  }

  private closeUtterance(): void {
    const text = this.finals.join(' ').trim();
    const start = this.startSec;
    this.finals = [];
    this.startSec = null;
    if (!text || start === null) {
      if (start !== null) this.listeners.partial('', this.toSessionMs(start));
      return;
    }
    const startMs = this.toSessionMs(start);
    const endMs = Math.max(startMs, this.toSessionMs(this.endSec));
    this.listeners.utterance({ text, startMs, endMs });
  }

  private toSessionMs(s: number): number {
    const ms = s * 1000;
    let lo = 0;
    let hi = this.timeMap.length - 1;
    if (hi < 0) return Math.round(ms);
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (this.timeMap[mid]!.streamMs <= ms) lo = mid;
      else hi = mid - 1;
    }
    const p = this.timeMap[lo]!;
    return Math.round(p.sessionMs + Math.max(0, ms - p.streamMs));
  }
}

import type { AudioChannel } from '@ponto/shared';

const PRE_ROLL_FRAMES = 15;
const TAIL_FRAMES = 45;
const FRAMES_PER_MESSAGE = 5;

export class ChannelStream {
  private ws: WebSocket;
  private isOpen = false;
  failed = false;
  private preRoll: Array<{ frame: Float32Array; t: number }> = [];
  private tail = 0;
  private active = false;
  private batch: Float32Array[] = [];
  private queue: ArrayBuffer[] = [];
  private batchT = 0;

  constructor(wsUrl: string, token: string, sessionId: string, channel: AudioChannel) {
    const base = wsUrl.replace(/\/ws$/, '/audio');
    const query = new URLSearchParams({ token, sessionId, channel });
    this.ws = new WebSocket(`${base}?${query}`);
    this.ws.binaryType = 'arraybuffer';
    this.ws.onopen = () => {
      this.isOpen = true;
      for (const buf of this.queue) this.ws.send(buf);
      this.queue = [];
    };
    this.ws.onclose = () => {
      this.isOpen = false;
      this.failed = true;
    };
  }

  process(frame: Float32Array, tMs: number, inSpeech: boolean, canStart: boolean): void {
    if (this.failed) return;
    if (inSpeech && (this.active || canStart)) {
      if (!this.active) {
        this.active = true;
        for (const p of this.preRoll) this.append(p.frame, p.t);
        this.preRoll = [];
      }
      this.tail = TAIL_FRAMES;
    } else if (this.active && this.tail > 0) {
      this.tail--;
      if (this.tail === 0) {
        this.active = false;
        this.flush();
      }
    } else {
      this.preRoll.push({ frame, t: tMs });
      if (this.preRoll.length > PRE_ROLL_FRAMES) this.preRoll.shift();
      return;
    }
    this.append(frame, tMs);
  }

  close(): void {
    this.flush();
    this.failed = true;
    this.ws.close(1000);
  }

  private append(frame: Float32Array, t: number): void {
    if (!this.batch.length) this.batchT = t;
    this.batch.push(frame);
    if (this.batch.length >= FRAMES_PER_MESSAGE) this.flush();
  }

  private flush(): void {
    if (!this.batch.length) return;
    const sampleCount = this.batch.reduce((n, f) => n + f.length, 0);
    const buf = new ArrayBuffer(8 + sampleCount * 2);
    const view = new DataView(buf);
    view.setFloat64(0, this.batchT, true);
    let offset = 8;
    for (const f of this.batch) {
      for (let i = 0; i < f.length; i++) {
        const s = Math.max(-1, Math.min(1, f[i]!));
        view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
        offset += 2;
      }
    }
    this.batch = [];
    if (this.isOpen) this.ws.send(buf);
    else if (this.queue.length < 100) this.queue.push(buf);
  }
}

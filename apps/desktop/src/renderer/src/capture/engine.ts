import {
  INITIAL_CAPTURE_STATE,
  type AudioChannel,
  type CaptureCommand,
  type CaptureState,
  type Session,
  type Settings,
} from '@ponto/shared';
import { api } from '../api/client';
import { ChannelStream } from './live-stream';
import { SpeechDetector, FRAME_MS, type SpeechSegment } from './vad';
import { toWav } from './wav';

const LEVEL_INTERVAL_MS = 100;
const ECHO_THRESHOLD = 0.7;
const ECHO_RETENTION_MS = 60_000;
const WORKLET_URL = new URL('./collector.worklet.js', document.baseURI).href;

interface Channel {
  id: AudioChannel;
  stream: MediaStream;
  source: MediaStreamAudioSourceNode;
  node: AudioWorkletNode;
  detector: SpeechDetector;
  frames: number;
  baseMs: number;
  live: ChannelStream | null;
}

class CaptureEngine {
  private state: CaptureState = INITIAL_CAPTURE_STATE;
  private ctx: AudioContext | null = null;
  private channels: Channel[] = [];
  private session: Session | null = null;
  private levelsTimer: ReturnType<typeof setInterval> | null = null;
  private queue: Promise<void> = Promise.resolve();
  private systemSpeechFrames = new Set<number>();
  private streaming: { ws: string; token: string } | null = null;

  private async resolveStreaming(): Promise<{ ws: string; token: string } | null> {
    try {
      const settings = await api.get<Settings>('/settings');
      if (settings.sttProvider !== 'deepgram' || !settings.sttStreaming) return null;
      const conn = await window.ponto.invoke('api.connection');
      return conn ? { ws: conn.ws, token: conn.token } : null;
    } catch {
      return null;
    }
  }

  command(cmd: CaptureCommand): void {
    this.queue = this.queue.then(() => this.execute(cmd)).catch((err: unknown) => {
      console.error(err);
      this.publish({ error: (err as Error).message });
    });
  }

  private async execute({ action }: CaptureCommand): Promise<void> {
    if (action === 'start') return this.start();
    if (action === 'pause') return this.pause();
    if (action === 'resume') return this.resume();
    return this.stop();
  }

  private async start(): Promise<void> {
    if (this.state.status !== 'stopped') return;
    this.publish({ ...INITIAL_CAPTURE_STATE, status: 'starting' });

    const session = await api.post<Session>('/sessions', {});
    this.session = session;
    this.streaming = await this.resolveStreaming();
    const ctx = createAudioContext();
    this.ctx = ctx;
    await ctx.audioWorklet.addModule(WORKLET_URL);

    const issues: string[] = [];
    const mic = await navigator.mediaDevices
      .getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 } })
      .catch((err: unknown) => {
        issues.push(formatError(err, 'microfone'));
        return null;
      });
    const system = await this.captureSystemAudio().catch((err: unknown) => {
      issues.push(formatError(err, 'áudio do computador'));
      return null;
    });

    if (mic) this.channels.push(this.createChannel(ctx, 'microphone', mic));
    if (system) this.channels.push(this.createChannel(ctx, 'system', system));
    if (!this.channels.length) {
      await this.teardown();
      await api.post(`/sessions/${session.id}/finish`).catch(() => {});
      this.session = null;
      this.publish({ ...INITIAL_CAPTURE_STATE, error: issues.join(' ') || 'Nenhuma fonte de áudio disponível.' });
      return;
    }

    this.levelsTimer = setInterval(() => {
      const level = (id: AudioChannel) => this.channels.find((c) => c.id === id)?.detector.level ?? 0;
      const paused = this.state.status === 'paused';
      window.ponto.send('capture.levels', {
        microphone: paused ? 0 : level('microphone'),
        system: paused ? 0 : level('system'),
      });
    }, LEVEL_INTERVAL_MS);

    this.publish({
      status: 'recording',
      sessionId: session.id,
      startedAt: session.startedAt,
      sources: { microphone: !!mic, system: !!system },
      error: issues.length ? issues.join(' ') : null,
    });
  }

  private async captureSystemAudio(): Promise<MediaStream | null> {
    const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
    stream.getVideoTracks().forEach((t) => t.stop());
    if (!stream.getAudioTracks().length) throw new Error('no-audio');
    return new MediaStream(stream.getAudioTracks());
  }

  private createChannel(ctx: AudioContext, id: AudioChannel, stream: MediaStream): Channel {
    const source = ctx.createMediaStreamSource(stream);
    const node = new AudioWorkletNode(ctx, 'ponto-collector', { numberOfInputs: 1, numberOfOutputs: 0 });
    const baseMs = this.session ? Math.max(0, Date.now() - this.session.startedAt) : 0;
    const live = this.streaming && this.session ? new ChannelStream(this.streaming.ws, this.streaming.token, this.session.id, id) : null;
    const channel: Channel = { id, stream, source, node, detector: new SpeechDetector(), frames: 0, baseMs, live };
    node.port.onmessage = (msg: MessageEvent<Float32Array>) => this.onFrame(channel, msg.data);
    source.connect(node);
    stream.getAudioTracks()[0]?.addEventListener('ended', () => {
      const sources = { ...this.state.sources, [id]: false };
      this.publish({
        sources,
        error: id === 'microphone' ? 'O microfone parou de responder.' : 'O áudio do computador parou de chegar.',
      });
    });
    return channel;
  }

  private onFrame(channel: Channel, frame: Float32Array): void {
    const tMs = channel.baseMs + channel.frames * FRAME_MS;
    channel.frames++;
    if (this.state.status !== 'recording') return;
    const segment = channel.detector.process(frame, tMs);
    if (channel.id === 'system' && channel.detector.inSpeech) this.markSystemSpeech(tMs);
    if (channel.live && !channel.live.failed) {
      const canStart = channel.id === 'system' || !this.systemSpeechFrames.has(Math.floor(tMs / FRAME_MS));
      channel.live.process(frame, tMs, channel.detector.inSpeech, canStart);
      return;
    }
    if (segment) this.sendSegment(channel.id, segment);
  }

  private markSystemSpeech(tMs: number): void {
    const frameIndex = Math.floor(tMs / FRAME_MS);
    this.systemSpeechFrames.add(frameIndex);
    if (frameIndex % 500 === 0) {
      const cutoff = frameIndex - ECHO_RETENTION_MS / FRAME_MS;
      for (const x of this.systemSpeechFrames) if (x < cutoff) this.systemSpeechFrames.delete(x);
    }
  }

  private isLikelyEcho(segment: SpeechSegment): boolean {
    const from = Math.floor(segment.startMs / FRAME_MS);
    const to = Math.floor(segment.endMs / FRAME_MS);
    if (to <= from) return false;
    let overlap = 0;
    for (let f = from; f < to; f++) if (this.systemSpeechFrames.has(f)) overlap++;
    return overlap / (to - from) >= ECHO_THRESHOLD;
  }

  private sendSegment(channel: AudioChannel, segment: SpeechSegment): void {
    const session = this.session;
    if (!session) return;
    if (channel === 'microphone' && this.isLikelyEcho(segment)) return;
    const query = new URLSearchParams({
      sessionId: session.id,
      channel,
      startMs: String(segment.startMs),
      endMs: String(segment.endMs),
    });
    api.sendAudio(`/transcription/chunks?${query}`, toWav(segment.samples)).catch((err: unknown) => {
      console.warn('segment not sent', err);
      this.publish({ error: 'Um trecho de áudio não chegou na API local.' });
    });
  }

  private flushAll(): void {
    for (const c of this.channels) {
      const segment = c.detector.flush(c.baseMs + c.frames * FRAME_MS);
      if (segment && !(c.live && !c.live.failed)) this.sendSegment(c.id, segment);
    }
  }

  private async pause(): Promise<void> {
    if (this.state.status !== 'recording') return;
    this.flushAll();
    this.publish({ status: 'paused' });
  }

  private async resume(): Promise<void> {
    if (this.state.status !== 'paused') return;
    this.channels.forEach((c) => c.detector.reset());
    this.publish({ status: 'recording' });
  }

  private async stop(): Promise<void> {
    if (this.state.status === 'stopped') return;
    if (this.state.status === 'recording') this.flushAll();
    const session = this.session;
    await this.teardown();
    this.session = null;
    this.publish({ ...INITIAL_CAPTURE_STATE });
    if (session) await api.post(`/sessions/${session.id}/finish`).catch(() => {});
  }

  private async teardown(): Promise<void> {
    if (this.levelsTimer) clearInterval(this.levelsTimer);
    this.levelsTimer = null;
    window.ponto.send('capture.levels', { microphone: 0, system: 0 });
    for (const c of this.channels) {
      c.live?.close();
      c.node.port.onmessage = null;
      c.source.disconnect();
      c.stream.getTracks().forEach((t) => t.stop());
    }
    this.channels = [];
    this.systemSpeechFrames.clear();
    await this.ctx?.close().catch(() => {});
    this.ctx = null;
  }

  private publish(partial: Partial<CaptureState>): void {
    this.state = { ...this.state, ...partial };
    window.ponto.send('capture.status', this.state);
  }
}

function createAudioContext(): AudioContext {
  try {
    return new AudioContext({ sampleRate: 16_000, latencyHint: 'playback' });
  } catch {
    return new AudioContext({ latencyHint: 'playback' });
  }
}

function formatError(err: unknown, sourceName: string): string {
  const name = (err as { name?: string })?.name;
  if (name === 'NotAllowedError') return `Sem permissão para o ${sourceName}.`;
  if (name === 'NotFoundError') return `Nenhum ${sourceName} encontrado.`;
  if (name === 'NotReadableError') return `O ${sourceName} está ocupado por outro programa.`;
  if ((err as Error)?.message === 'no-audio') return 'Este sistema não entregou o áudio do computador; seguindo só com o microfone.';
  return `Não consegui abrir o ${sourceName}.`;
}

export function startCaptureEngine(): void {
  const engine = new CaptureEngine();
  window.ponto.on('capture.command', (cmd) => engine.command(cmd));
  window.ponto.send('capture.status', INITIAL_CAPTURE_STATE);
}

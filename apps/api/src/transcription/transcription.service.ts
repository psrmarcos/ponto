import { Injectable, Logger } from '@nestjs/common';
import type { SttProviderId, AudioChunkQuery } from '@ponto/shared';
import { SettingsService } from '../settings/settings.service';
import { EventsService } from '../events/events.service';
import { SessionsService } from '../sessions/sessions.service';
import { UsageService } from '../usage/usage.service';
import { isHallucination } from './hallucinations';
import { DeepgramStt } from './stt/deepgram-stt';
import { OpenRouterStt } from './stt/openrouter-stt';
import { SttError, type SttProvider } from './stt/stt-provider';
import { StreamingService } from './streaming/streaming.service';

const BYTES_PER_SECOND = 32_000;
const CONCURRENCY = 3;
const TIMEOUT_MS = 45_000;
const WARNING_INTERVAL_MS = 15_000;

interface Task {
  chunk: AudioChunkQuery;
  wav: Buffer;
  done: () => void;
}

@Injectable()
export class TranscriptionService {
  private readonly log = new Logger('Transcription');
  private readonly queue: Task[] = [];
  private active = 0;
  private lastWarning = new Map<string, number>();
  private pending = new Map<string, Set<Promise<void>>>();
  private readonly providers: Record<SttProviderId, SttProvider>;

  constructor(
    private readonly settings: SettingsService,
    private readonly sessions: SessionsService,
    private readonly events: EventsService,
    private readonly usage: UsageService,
    openrouter: OpenRouterStt,
    deepgram: DeepgramStt,
    private readonly streaming: StreamingService,
  ) {
    this.providers = { openrouter, deepgram };
  }

  enqueue(chunk: AudioChunkQuery, wav: Buffer): void {
    let done!: () => void;
    const p = new Promise<void>((ok) => (done = ok));
    const forSession = this.pending.get(chunk.sessionId) ?? new Set();
    forSession.add(p);
    this.pending.set(chunk.sessionId, forSession);
    this.queue.push({ chunk, wav, done: () => (forSession.delete(p), done()) });
    this.pump();
  }

  async waitForPending(sessionId: string, maxMs: number): Promise<void> {
    const forSession = this.pending.get(sessionId);
    const batch = forSession?.size
      ? Promise.race([Promise.allSettled([...forSession]), new Promise((ok) => setTimeout(ok, maxMs))])
      : Promise.resolve();
    await Promise.all([batch, this.streaming.waitForPending(sessionId, maxMs)]);
  }

  private pump(): void {
    while (this.active < CONCURRENCY && this.queue.length) {
      const t = this.queue.shift()!;
      this.active++;
      void this.process(t).finally(() => {
        t.done();
        this.active--;
        this.pump();
      });
    }
  }

  private async process({ chunk, wav }: Task): Promise<void> {
    const cfg = await this.settings.get();
    const provider = this.providers[cfg.sttProvider];
    const durationSec = (wav.length - 44) / BYTES_PER_SECOND;
    try {
      const r = await provider.transcribe(
        { wav, model: cfg.sttModel, language: cfg.language, durationSec },
        AbortSignal.timeout(TIMEOUT_MS),
      );
      if (r.costUsd > 0) {
        await this.usage.record({
          provider: provider.id,
          source: 'transcription',
          sessionId: chunk.sessionId,
          usage: { model: cfg.sttModel, inputTokens: 0, outputTokens: 0, cachedTokens: 0, costUsd: r.costUsd },
        });
      }
      const text = r.text.trim();
      if (isHallucination(text, durationSec)) return;
      await this.sessions.addUtterance({ ...chunk, text });
    } catch (e) {
      const cause = (e as { cause?: { code?: string } }).cause?.code;
      this.log.warn(`failed (${chunk.channel}, ${durationSec.toFixed(1)} s): ${(e as Error).message}${cause ? ` (${cause})` : ''}`);
      const message =
        e instanceof SttError
          ? e.message
          : (e as Error).name === 'TimeoutError'
            ? 'A transcrição demorou demais e um trecho ficou de fora.'
            : 'Não consegui falar com o serviço de transcrição. Verifique a internet.';
      this.warn(chunk.sessionId, message);
    }
  }

  private warn(sessionId: string, message: string): void {
    const now = Date.now();
    if (now - (this.lastWarning.get(message) ?? 0) < WARNING_INTERVAL_MS) return;
    this.lastWarning.set(message, now);
    this.events.emit({ type: 'transcription.error', sessionId, message });
  }
}

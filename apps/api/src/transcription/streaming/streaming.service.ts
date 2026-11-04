import { Injectable, Logger } from '@nestjs/common';
import type { AudioChannel } from '@ponto/shared';
import { SettingsService } from '../../settings/settings.service';
import { EventsService } from '../../events/events.service';
import { SecretsService } from '../../secrets/secrets.service';
import { SessionsService } from '../../sessions/sessions.service';
import { UsageService } from '../../usage/usage.service';
import { isHallucination } from '../hallucinations';
import { DeepgramLive, USD_PER_MINUTE_STREAMING, USD_PER_MINUTE_STREAMING_MULTI } from './deepgram-live';

interface Connection {
  sessionId: string;
  channel: AudioChannel;
  dg: DeepgramLive;
  model: string;
}

/**
 * Streaming transcription (currently Deepgram). The capture engine sends speech
 * audio as it happens; interim text is broadcast to windows immediately and
 * finalized utterances are persisted like any other. If streaming is unavailable,
 * capture transparently falls back to batch mode.
 */
@Injectable()
export class StreamingService {
  private readonly log = new Logger('Streaming');
  private readonly connections = new Map<string, Connection>();

  constructor(
    private readonly settings: SettingsService,
    private readonly secrets: SecretsService,
    private readonly sessions: SessionsService,
    private readonly events: EventsService,
    private readonly usage: UsageService,
  ) {}

  /** Opens streaming for a channel. Returns the rejection reason when unavailable (capture falls back to batch). */
  async open(sessionId: string, channel: AudioChannel, onDrop: () => void): Promise<string | null> {
    const cfg = await this.settings.get();
    if (cfg.sttProvider !== 'deepgram') return 'O streaming só existe no Deepgram.';
    if (!cfg.sttStreaming) return 'Streaming desligado nas configurações.';
    const key = this.secrets.get('deepgram');
    if (!key) return 'Sem chave do Deepgram.';
    const id = `${sessionId}:${channel}`;
    this.close(id);
    const dg = new DeepgramLive(key, cfg, channel, {
      partial: (text, startMs) => this.events.emit({ type: 'transcription.partial', sessionId, channel, text, startMs }),
      utterance: (u) => void this.save(id, u),
      error: (message) => {
        this.log.warn(`${id}: ${message}`);
        this.events.emit({ type: 'transcription.error', sessionId, message: `${message} Seguindo sem streaming.` });
        // Closes the capture side so it reverts to sending utterances in batch mode without losing audio.
        this.close(id);
        onDrop();
      },
    });
    this.connections.set(id, { sessionId, channel, dg, model: cfg.sttModel });
    return null;
  }

  audio(id: string, pcm: Buffer, sessionMs: number): void {
    this.connections.get(id)?.dg.audio(pcm, sessionMs);
  }

  close(id: string): void {
    const conn = this.connections.get(id);
    if (!conn) return;
    this.connections.delete(id);
    conn.dg.close();
    // Final utterances may still arrive right after CloseStream; bill once everything has settled.
    setTimeout(() => void this.bill(conn), 3500).unref();
  }

  /**
   * Immediately finalizes open utterances in the session and waits for them to
   * become text (up to `maxMs`). Chat calls this before answering so the full
   * question is included.
   */
  async waitForPending(sessionId: string, maxMs: number): Promise<void> {
    const openConns = [...this.connections.values()].filter((c) => c.sessionId === sessionId && c.dg.hasOpenUtterance());
    if (!openConns.length) return;
    openConns.forEach((c) => c.dg.finalize());
    const deadline = Date.now() + maxMs;
    while (Date.now() < deadline && openConns.some((c) => c.dg.hasOpenUtterance())) {
      await new Promise((ok) => setTimeout(ok, 50));
    }
  }

  private async save(id: string, u: { text: string; startMs: number; endMs: number }): Promise<void> {
    const conn = this.connections.get(id) ?? null;
    const [sessionId, channel] = id.split(':') as [string, AudioChannel];
    this.events.emit({ type: 'transcription.partial', sessionId, channel, text: '', startMs: u.startMs });
    if (isHallucination(u.text, (u.endMs - u.startMs) / 1000)) return;
    try {
      await this.sessions.addUtterance({ sessionId, channel, text: u.text, startMs: u.startMs, endMs: u.endMs });
    } catch (e) {
      this.log.warn(`utterance not saved: ${(e as Error).message}`);
    }
    if (conn) await this.bill(conn);
  }

  private async bill(conn: Connection): Promise<void> {
    const ms = conn.dg.bill();
    if (ms <= 0) return;
    const perMinute = conn.dg.multi ? USD_PER_MINUTE_STREAMING_MULTI : USD_PER_MINUTE_STREAMING;
    await this.usage
      .record({
        provider: 'deepgram',
        source: 'transcription',
        sessionId: conn.sessionId,
        usage: {
          model: `${conn.model} (streaming)`,
          inputTokens: 0,
          outputTokens: 0,
          cachedTokens: 0,
          costUsd: (ms / 60_000) * perMinute,
        },
      })
      .catch(() => undefined);
  }
}

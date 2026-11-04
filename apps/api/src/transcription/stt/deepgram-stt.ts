import { Injectable } from '@nestjs/common';
import { http } from '../../common/http';
import { SecretsService } from '../../secrets/secrets.service';
import { SttError, messageForStatus, type SttRequest, type SttProvider, type SttResult } from './stt-provider';

/** Pre-recorded Nova-3 list price per minute. Deepgram does not return cost in the response. */
const USD_PER_MINUTE = 0.0043;

/**
 * Batch transcription via Deepgram (dedicated key).
 */
@Injectable()
export class DeepgramStt implements SttProvider {
  readonly id = 'deepgram' as const;

  constructor(private readonly secrets: SecretsService) {}

  async transcribe(p: SttRequest, signal: AbortSignal): Promise<SttResult> {
    const key = this.secrets.get('deepgram');
    if (!key) throw new SttError('Cadastre a chave do Deepgram em Perfil para transcrever.');
    const q = new URLSearchParams({ model: p.model, smart_format: 'true', punctuate: 'true' });
    if (p.language === 'auto') q.set('detect_language', 'true');
    else q.set('language', p.language);
    const r = await http(`https://api.deepgram.com/v1/listen?${q}`, {
      method: 'POST',
      headers: { Authorization: `Token ${key}`, 'content-type': 'audio/wav' },
      body: new Uint8Array(p.wav),
      signal,
    });
    if (!r.ok) throw new SttError(messageForStatus('Deepgram', r.status, await r.text().catch(() => '')), r.status);
    const j = (await r.json()) as { results?: { channels?: Array<{ alternatives?: Array<{ transcript?: string }> }> } };
    const text = j.results?.channels?.[0]?.alternatives?.[0]?.transcript ?? '';
    return { text, costUsd: (p.durationSec / 60) * USD_PER_MINUTE };
  }
}

import { Injectable } from '@nestjs/common';
import { http } from '../../common/http';
import { SecretsService } from '../../secrets/secrets.service';
import { SttError, messageForStatus, type SttRequest, type SttProvider, type SttResult } from './stt-provider';

@Injectable()
export class OpenRouterStt implements SttProvider {
  readonly id = 'openrouter' as const;

  constructor(private readonly secrets: SecretsService) {}

  async transcribe(p: SttRequest, signal: AbortSignal): Promise<SttResult> {
    const key = this.secrets.get('openrouter');
    if (!key) throw new SttError('Cadastre a chave do OpenRouter em Perfil para transcrever.');
    const body: Record<string, unknown> = {
      model: p.model,
      input_audio: { data: p.wav.toString('base64'), format: 'wav' },
    };
    if (p.language !== 'auto') body.language = p.language.slice(0, 2);
    const r = await http('https://openrouter.ai/api/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'content-type': 'application/json',
        'HTTP-Referer': 'https://github.com/ponto-app/ponto',
        'X-Title': 'Ponto',
      },
      body: JSON.stringify(body),
      signal,
    });
    if (!r.ok) throw new SttError(messageForStatus('OpenRouter', r.status, await r.text().catch(() => '')), r.status);
    const j = (await r.json()) as { text?: string; usage?: { cost?: number } };
    return { text: j.text ?? '', costUsd: j.usage?.cost ?? 0 };
  }
}

import { Injectable } from '@nestjs/common';
import { http } from '../../comum/http';
import { SegredosService } from '../../segredos/segredos.service';
import { ErroStt, mensagemPorStatus, type PedidoStt, type ProvedorStt, type ResultadoStt } from './provedor-stt';

/**
 * Transcrição pelo OpenRouter (mesma chave do chat). É só em lote: mandamos cada
 * fala inteira depois que a pessoa para de falar. Com whisper-large-v3-turbo leva
 * ~2 s para 8 s de áudio e custa ~US$ 0,0002 por minuto.
 */
@Injectable()
export class OpenRouterStt implements ProvedorStt {
  readonly id = 'openrouter' as const;

  constructor(private readonly segredos: SegredosService) {}

  async transcrever(p: PedidoStt, sinal: AbortSignal): Promise<ResultadoStt> {
    const chave = this.segredos.obter('openrouter');
    if (!chave) throw new ErroStt('Cadastre a chave do OpenRouter em Perfil para transcrever.');
    const corpo: Record<string, unknown> = {
      model: p.modelo,
      input_audio: { data: p.wav.toString('base64'), format: 'wav' },
    };
    if (p.idioma !== 'auto') corpo.language = p.idioma.slice(0, 2);
    const r = await http('https://openrouter.ai/api/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${chave}`,
        'content-type': 'application/json',
        'HTTP-Referer': 'https://github.com/ponto-app/ponto',
        'X-Title': 'Ponto',
      },
      body: JSON.stringify(corpo),
      signal: sinal,
    });
    if (!r.ok) throw new ErroStt(mensagemPorStatus('OpenRouter', r.status, await r.text().catch(() => '')), r.status);
    const j = (await r.json()) as { text?: string; usage?: { cost?: number } };
    return { texto: j.text ?? '', custoUsd: j.usage?.cost ?? 0 };
  }
}

import { Injectable } from '@nestjs/common';
import { http } from '../../comum/http';
import { SegredosService } from '../../segredos/segredos.service';
import { ErroStt, mensagemPorStatus, type PedidoStt, type ProvedorStt, type ResultadoStt } from './provedor-stt';

/** Preço de tabela do Nova-3 pré-gravado, por minuto. O Deepgram não devolve o custo na resposta. */
const USD_POR_MINUTO = 0.0043;

/**
 * Transcrição pelo Deepgram (chave própria). Por enquanto em lote, igual ao
 * OpenRouter; o streaming em tempo real do Deepgram é o próximo passo se a
 * latência de ~2 s depois da fala incomodar.
 */
@Injectable()
export class DeepgramStt implements ProvedorStt {
  readonly id = 'deepgram' as const;

  constructor(private readonly segredos: SegredosService) {}

  async transcrever(p: PedidoStt, sinal: AbortSignal): Promise<ResultadoStt> {
    const chave = this.segredos.obter('deepgram');
    if (!chave) throw new ErroStt('Cadastre a chave do Deepgram em Perfil para transcrever.');
    const q = new URLSearchParams({ model: p.modelo, smart_format: 'true', punctuate: 'true' });
    if (p.idioma === 'auto') q.set('detect_language', 'true');
    else q.set('language', p.idioma);
    const r = await http(`https://api.deepgram.com/v1/listen?${q}`, {
      method: 'POST',
      headers: { Authorization: `Token ${chave}`, 'content-type': 'audio/wav' },
      body: new Uint8Array(p.wav),
      signal: sinal,
    });
    if (!r.ok) throw new ErroStt(mensagemPorStatus('Deepgram', r.status, await r.text().catch(() => '')), r.status);
    const j = (await r.json()) as { results?: { channels?: Array<{ alternatives?: Array<{ transcript?: string }> }> } };
    const texto = j.results?.channels?.[0]?.alternatives?.[0]?.transcript ?? '';
    return { texto, custoUsd: (p.duracaoS / 60) * USD_POR_MINUTO };
  }
}

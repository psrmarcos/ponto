import { Injectable, Logger } from '@nestjs/common';
import { http } from '../comum/http';
import { SegredosService } from '../segredos/segredos.service';
import { UsoService } from '../uso/uso.service';

/** Versão fixa: o alias "latest" muda os limiares sem aviso. */
export const MODELO_JEV = 'typesafe/jev-1.14';
const TEMPO_LIMITE_MS = 2500;

/**
 * Jev, o "System 1": um modelo de decisão (não escreve texto) que responde
 * perguntas tipadas com probabilidades em ~0,3 s e custa ~US$ 0,000014 por
 * chamada. Usamos para decidir se vale gastar uma resposta do modelo grande.
 * Medido no PC do Marcos: pergunta direta 0,95-0,97, aviso geral 0,06.
 */
@Injectable()
export class JevService {
  private readonly log = new Logger('Jev');

  constructor(
    private readonly segredos: SegredosService,
    private readonly uso: UsoService,
  ) {}

  /** Probabilidade de a última fala ser uma pergunta para o usuário. null = Jev indisponível. */
  async perguntaParaMim(estado: string, sessaoId: string): Promise<number | null> {
    const chave = this.segredos.obter('openrouter');
    if (!chave) return null;
    try {
      const r = await http(
        'https://openrouter.ai/api/alpha/decisions',
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${chave}`, 'content-type': 'application/json', 'X-Title': 'Ponto' },
          body: JSON.stringify({
            model: MODELO_JEV,
            state: estado,
            questions: {
              pergunta_para_mim: {
                type: 'noul',
                instructions:
                  'A última fala do Participante é uma pergunta ou um pedido dirigido ao usuário, que ele precisa responder agora?',
              },
            },
          }),
          signal: AbortSignal.timeout(TEMPO_LIMITE_MS),
        },
        1,
      );
      if (!r.ok) {
        this.log.warn(`Jev respondeu ${r.status}`);
        return null;
      }
      const j = (await r.json()) as {
        answers?: { pergunta_para_mim?: { noul?: number } };
        usage?: { input_tokens?: number; output_tokens?: number; cost?: number };
      };
      if (j.usage?.cost) {
        void this.uso.registrar({
          provedor: 'openrouter',
          origem: 'decisao',
          sessaoId,
          uso: {
            modelo: MODELO_JEV,
            tokensEntrada: j.usage.input_tokens ?? 0,
            tokensSaida: j.usage.output_tokens ?? 0,
            tokensCache: 0,
            custoUsd: j.usage.cost,
          },
        });
      }
      const p = j.answers?.pergunta_para_mim?.noul;
      return typeof p === 'number' ? p : null;
    } catch (e) {
      this.log.warn(`Jev falhou: ${(e as Error).message}`);
      return null;
    }
  }
}

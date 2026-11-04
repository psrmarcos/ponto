import { Injectable, Logger } from '@nestjs/common';
import { http } from '../common/http';
import { SecretsService } from '../secrets/secrets.service';
import { UsageService } from '../usage/usage.service';

/** Pinned version: the "latest" alias shifts thresholds without notice. */
export const JEV_MODEL = 'typesafe/jev-1.14';
const TIMEOUT_MS = 2500;

/**
 * Jev, the "System 1": a decision model (does not generate text) that answers
 * typed questions with probabilities in ~0.3s and costs ~US$ 0.000014 per call.
 * Used to decide whether to spend a full LLM response.
 */
@Injectable()
export class JevService {
  private readonly log = new Logger('Jev');

  constructor(
    private readonly secrets: SecretsService,
    private readonly usage: UsageService,
  ) {}

  /** Probability that the latest utterance is a question directed at the user. null = Jev unavailable. */
  async isQuestionForMe(state: string, sessionId: string): Promise<number | null> {
    const key = this.secrets.get('openrouter');
    if (!key) return null;
    try {
      const r = await http(
        'https://openrouter.ai/api/alpha/decisions',
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${key}`, 'content-type': 'application/json', 'X-Title': 'Ponto' },
          body: JSON.stringify({
            model: JEV_MODEL,
            state,
            questions: {
              question_for_me: {
                type: 'noul',
                instructions:
                  'A última fala do Participante é uma pergunta ou um pedido dirigido ao usuário, que ele precisa responder agora?',
              },
            },
          }),
          signal: AbortSignal.timeout(TIMEOUT_MS),
        },
        1,
      );
      if (!r.ok) {
        this.log.warn(`Jev responded ${r.status}`);
        return null;
      }
      const j = (await r.json()) as {
        answers?: { question_for_me?: { noul?: number } };
        usage?: { input_tokens?: number; output_tokens?: number; cost?: number };
      };
      if (j.usage?.cost) {
        void this.usage.record({
          provider: 'openrouter',
          source: 'decision',
          sessionId,
          usage: {
            model: JEV_MODEL,
            inputTokens: j.usage.input_tokens ?? 0,
            outputTokens: j.usage.output_tokens ?? 0,
            cachedTokens: 0,
            costUsd: j.usage.cost,
          },
        });
      }
      const p = j.answers?.question_for_me?.noul;
      return typeof p === 'number' ? p : null;
    } catch (e) {
      this.log.warn(`Jev failed: ${(e as Error).message}`);
      return null;
    }
  }
}

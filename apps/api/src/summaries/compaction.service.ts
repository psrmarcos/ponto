import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import type { Utterance } from '@ponto/shared';
import { SessionsService } from '../sessions/sessions.service';
import { AiTextService } from '../ai/ai-text.service';

/** Once utterances outside the summary exceed this length, the beginning is summarized. */
export const RAW_CHARS_LIMIT = 9000;
/** The recent end of the conversation always stays as raw text (most relevant for answering). */
export const TRAILING_RAW_CHARS = 3000;
const DEBOUNCE_MS = 3000;

/**
 * Rolling summary of the beginning of the call. Runs in the background using the
 * fast model, off the critical response path: when chat needs it, the summary is
 * already ready. That way a one-hour call never sends 60 minutes of transcript on
 * every question.
 */
@Injectable()
export class CompactionService implements OnModuleInit {
  private readonly log = new Logger('Compaction');
  private readonly scheduled = new Map<string, NodeJS.Timeout>();
  private readonly running = new Set<string>();

  constructor(
    private readonly sessions: SessionsService,
    private readonly aiText: AiTextService,
  ) {}

  onModuleInit(): void {
    this.sessions.onNewUtterance((u) => this.schedule(u.sessionId));
  }

  private schedule(sessionId: string): void {
    if (this.scheduled.has(sessionId)) return;
    this.scheduled.set(
      sessionId,
      setTimeout(() => {
        this.scheduled.delete(sessionId);
        void this.compactIfNeeded(sessionId);
      }, DEBOUNCE_MS),
    );
  }

  async compactIfNeeded(sessionId: string): Promise<void> {
    if (this.running.has(sessionId)) return;
    this.running.add(sessionId);
    try {
      const previous = this.sessions.partialSummary(sessionId);
      const version = this.sessions.version(sessionId);
      const utterances = await this.sessions.utterancesAfter(sessionId, previous?.upToMs ?? -1);
      const batch = pickBatch(utterances);
      if (!batch.length) return;
      const transcript = await this.sessions.format(batch);
      const summary = await this.aiText.generate({
        source: 'compaction',
        sessionId,
        maxTokens: 700,
        messages: [
          {
            role: 'system',
            content:
              'Você resume o andamento de uma call para outra IA que vai ajudar o usuário a responder ao vivo. ' +
              'Escreva em português, em tópicos curtos, no máximo 200 palavras: assunto, quem é quem, perguntas feitas e o que o usuário respondeu, ' +
              'números, nomes, decisões e pendências. Só fatos ditos na call. Sem introdução.',
          },
          {
            role: 'user',
            content: `${previous ? `Resumo até agora:\n${previous.text}\n\n` : ''}Falas seguintes:\n${transcript}\n\nDevolva o resumo atualizado de tudo.`,
          },
        ],
      });
      // If utterances were cleared while the summary was being generated, discard it.
      if (!summary || this.sessions.version(sessionId) !== version) return;
      this.sessions.setPartialSummary(sessionId, { text: summary, upToMs: batch[batch.length - 1]!.startMs });
    } catch (e) {
      this.log.warn(`compaction failed: ${(e as Error).message}`);
    } finally {
      this.running.delete(sessionId);
    }
  }
}

/** Utterances to summarize: everything except the recent tail, and only once the total exceeds the limit. */
export function pickBatch<U extends Pick<Utterance, 'text' | 'startMs'>>(utterances: U[]): U[] {
  const total = utterances.reduce((n, u) => n + u.text.length + 16, 0);
  if (total <= RAW_CHARS_LIMIT) return [];
  let tailChars = 0;
  let i = utterances.length;
  while (i > 0 && tailChars < TRAILING_RAW_CHARS) tailChars += utterances[--i]!.text.length + 16;
  return utterances.slice(0, i);
}

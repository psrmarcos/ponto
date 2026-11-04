import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import type { Utterance, Session } from '@ponto/shared';
import { EventsService } from '../events/events.service';
import { SessionsService } from '../sessions/sessions.service';
import { AiTextService } from '../ai/ai-text.service';

const MIN_UTTERANCES = 4;
const MAX_TRANSCRIPT_CHARS = 300_000;

const MINUTES_PROMPT = `Você escreve a ata de uma call a partir da transcrição. Português do Brasil, Markdown, direto ao ponto.
Formato exato:
# <título curto e específico da call, até 8 palavras>

<2 a 3 frases dizendo do que se tratou e como terminou>

## Pontos principais
- ...

## Decisões
- ... (omita a seção se não houve)

## Próximos passos
- [ ] responsável: tarefa (prazo, se dito) (omita a seção se não houve)

## Perguntas em aberto
- ... (omita a seção se não houve)

Regras: só o que foi dito na call, sem inventar. Nomes, números e datas exatos. A transcrição vem de reconhecimento de voz e pode ter erros: corrija termos óbvios, sem mudar o sentido. O usuário aparece pelo nome ou como "Você"; os outros como "Participante".`;

@Injectable()
export class MinutesService implements OnModuleInit {
  private readonly log = new Logger('Minutes');

  constructor(
    private readonly sessions: SessionsService,
    private readonly aiText: AiTextService,
    private readonly events: EventsService,
  ) {}

  onModuleInit(): void {
    this.sessions.onFinish((id) => void this.generate(id).catch(() => undefined));
  }

  async generate(sessionId: string, force = false): Promise<void> {
    if (this.sessions.generatingSummary.has(sessionId)) return;
    const utterances = await this.sessions.utterances(sessionId);
    if (utterances.length < (force ? 1 : MIN_UTTERANCES)) return;
    this.sessions.generatingSummary.add(sessionId);
    this.events.emit({ type: 'session.summary', sessionId, status: 'generating' });
    try {
      let transcript = await this.sessions.format(utterances);
      if (transcript.length > MAX_TRANSCRIPT_CHARS) transcript = `(…)\n${transcript.slice(-MAX_TRANSCRIPT_CHARS)}`;
      const minutes = await this.aiText.generate({
        source: 'summary',
        sessionId,
        maxTokens: 2000,
        timeoutMs: 180_000,
        messages: [
          { role: 'system', content: MINUTES_PROMPT },
          { role: 'user', content: `Transcrição:\n${transcript}` },
        ],
      });
      if (!minutes) throw new Error('O modelo não devolveu a ata.');
      const title = /^#\s+(.+)$/m.exec(minutes)?.[1]?.trim().slice(0, 120);
      await this.sessions.saveSummary(sessionId, minutes, title);
      this.events.emit({ type: 'session.summary', sessionId, status: 'ready' });
    } catch (e) {
      const message = (e as Error).message || 'Falhou ao gerar a ata.';
      this.log.warn(`minutes failed: ${message}`);
      this.events.emit({ type: 'session.summary', sessionId, status: 'error', message });
    } finally {
      this.sessions.generatingSummary.delete(sessionId);
    }
  }
}

export function sessionToMarkdown(session: Session, utterances: Utterance[], userName: string): string {
  const date = new Date(session.startedAt);
  const when = `${date.toLocaleDateString('pt-BR')} às ${date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
  const duration = utterances.length ? formatClock(utterances[utterances.length - 1]!.endMs) : '0:00';
  const parts: string[] = [];
  if (session.summary) {
    parts.push(session.summary.replace(/^(#\s+.+)$/m, `$1\n\n_${when} · ${duration}_`));
  } else {
    parts.push(`# ${session.title}\n\n_${when} · ${duration}_`);
  }
  parts.push('## Transcrição');
  const lines = utterances.map((u) => {
    const who = u.speaker ?? (u.channel === 'microphone' ? userName || 'Você' : 'Participante');
    return `**[${formatClock(u.startMs)}] ${who}:** ${u.text}`;
  });
  parts.push(lines.length ? lines.join('\n\n') : '_Sem falas._');
  return `${parts.join('\n\n')}\n`;
}

function formatClock(ms: number): string {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

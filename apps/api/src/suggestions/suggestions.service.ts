import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import type { Utterance } from '@ponto/shared';
import { newId } from '../common/id';
import { SettingsService } from '../settings/settings.service';
import { EventsService } from '../events/events.service';
import { ChatService } from '../ai/chat/chat.service';
import { SessionsService } from '../sessions/sessions.service';
import { JevService } from './jev.service';

export const QUESTION_THRESHOLD = 0.85;
const MIN_WORDS = 3;
const UTTERANCES_IN_STATE = 6;

@Injectable()
export class SuggestionsService implements OnModuleInit {
  private readonly log = new Logger('Suggestions');

  constructor(
    private readonly settings: SettingsService,
    private readonly sessions: SessionsService,
    private readonly chat: ChatService,
    private readonly events: EventsService,
    private readonly jev: JevService,
  ) {}

  onModuleInit(): void {
    this.sessions.onNewUtterance((u) => void this.evaluate(u));
  }

  private async evaluate(u: Utterance): Promise<void> {
    if (u.channel !== 'system') return;
    if (u.text.trim().split(/\s+/).length < MIN_WORDS) return;
    const cfg = await this.settings.get();
    if (!cfg.autoSuggestions) return;

    const context = await this.sessions.recentContext(u.sessionId, UTTERANCES_IN_STATE);
    const state = `Conversa ao vivo. O usuário é ${cfg.userName || 'a pessoa que usa o app'}. Últimas falas:\n${context ?? ''}`;
    const p = await this.jev.isQuestionForMe(state, u.sessionId);
    const isQuestion = p === null ? /\?\s*$/.test(u.text) : p >= QUESTION_THRESHOLD;
    this.log.log(`"${u.text.slice(0, 60)}" -> ${p === null ? 'no Jev' : p.toFixed(2)}${isQuestion ? ' (suggest)' : ''}`);
    if (!isQuestion) return;

    const responseId = newId();
    this.events.emit({ type: 'suggestion.new', sessionId: u.sessionId, responseId, question: u.text });
    await this.chat.send(
      {
        conversationId: `auto:${u.sessionId}`,
        responseId,
        text: '',
        shortcut: 'whatToSay',
        agentId: cfg.activeAgentId,
        web: false,
        reasoning: false,
        images: [],
        sessionId: u.sessionId,
      },
      { label: `Te perguntaram: ${u.text}` },
    );
  }
}

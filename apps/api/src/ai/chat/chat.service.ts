import { Injectable, Logger } from '@nestjs/common';
import type { ConversationContext, ChatRequest, AiUsage } from '@ponto/shared';
import { SettingsService } from '../../settings/settings.service';
import { AgentsService } from '../../agents/agents.service';
import { EventsService } from '../../events/events.service';
import { UsageService } from '../../usage/usage.service';
import { SessionsService, type PartialSummary } from '../../sessions/sessions.service';
import { TranscriptionService } from '../../transcription/transcription.service';
import { ProvidersService } from '../providers/providers.service';
import { ProviderError, type AiProvider } from '../providers/provider';
import { AiTextService } from '../ai-text.service';
import {
  MAX_OLD_RESPONSE_CHARS,
  userMessage,
  buildMessages,
  COMPRESS_PROMPT,
  instructionsText,
  requestText,
  HISTORY_TURNS,
  type PreviousTurn,
} from './prompt';

const DELTA_INTERVAL_MS = 40;
const MAX_TOKENS = 800;
const MAX_REASONING_TOKENS = 2500;
const TRANSCRIPTION_WAIT_MS = 1200;
const MAX_NEW_UTTERANCES_CHARS = 8000;
const MAX_HISTORY_TRANSCRIPT_CHARS = 9000;

interface ConversationCallState {
  sessionId: string;
  version: number;
  summary: PartialSummary | null;
  cursorMs: number;
}

interface Conversation {
  history: PreviousTurn[];
  spendUsd: number;
  inFlight: AbortController | null;
  call: ConversationCallState | null;
  summary: string | null;
  agentId: string | null;
  lastUsage: AiUsage | null;
  extraUsd: number;
}

class BudgetError extends ProviderError {}

const NEW_CONVERSATION = (): Conversation => ({
  history: [],
  spendUsd: 0,
  inFlight: null,
  call: null,
  summary: null,
  agentId: null,
  lastUsage: null,
  extraUsd: 0,
});

const estimateTokens = (chars: number) => Math.ceil(chars / 3.5);

@Injectable()
export class ChatService {
  private readonly log = new Logger('Chat');
  private readonly conversations = new Map<string, Conversation>();

  constructor(
    private readonly settings: SettingsService,
    private readonly agents: AgentsService,
    private readonly providers: ProvidersService,
    private readonly events: EventsService,
    private readonly usage: UsageService,
    private readonly sessions: SessionsService,
    private readonly transcription: TranscriptionService,
    private readonly aiText: AiTextService,
  ) {}

  async context(conversationId: string, agentId?: string): Promise<ConversationContext> {
    const conv = this.conversations.get(conversationId) ?? NEW_CONVERSATION();
    const cfg = await this.settings.get();
    const id = agentId ?? conv.agentId ?? cfg.activeAgentId;
    const agent = await this.agents.get(id).catch(() => this.agents.get('general'));
    const model = conv.lastUsage?.model ?? agent.model ?? cfg.defaultModel;
    const provider = this.providers.get(cfg.defaultProvider);
    const list = await provider.listModels().catch(() => null);
    const limit = list?.find((m) => m.id === model)?.contextLength ?? null;

    const history = conv.history.slice(-HISTORY_TURNS);
    const transcriptChars = history.reduce((n, t) => n + t.transcriptChars, 0);
    const historyChars = history.reduce(
      (n, t) => n + t.question.length + Math.min(t.answer.length, MAX_OLD_RESPONSE_CHARS),
      0,
    );
    const profileChars = (cfg.userName?.length ?? 0) + (cfg.userContext?.length ?? 0);
    const parts: ConversationContext['parts'] = [
      { part: 'instructions', tokens: estimateTokens(instructionsText(agent).length) },
      { part: 'profile', tokens: estimateTokens(profileChars) },
      { part: 'callSummary', tokens: estimateTokens(conv.call?.summary?.text.length ?? 0) },
      { part: 'conversationSummary', tokens: estimateTokens(conv.summary?.length ?? 0) },
      { part: 'history', tokens: estimateTokens(historyChars - transcriptChars) },
      { part: 'transcription', tokens: estimateTokens(transcriptChars) },
    ];
    const u = conv.lastUsage;
    return {
      model,
      limit,
      parts,
      estimatedTotal: parts.reduce((n, p) => n + p.tokens, 0),
      lastUsage: u ? { inputTokens: u.inputTokens, cachedTokens: u.cachedTokens, outputTokens: u.outputTokens } : null,
      turns: conv.history.length,
      compacted: !!conv.summary,
      spendUsd: conv.spendUsd,
    };
  }

  async compress(conversationId: string, sessionId?: string | null): Promise<ConversationContext> {
    const conv = this.conversations.get(conversationId);
    if (!conv?.history.length) return this.context(conversationId);
    const turns = conv.history
      .map((t) => `Usuário: ${t.pureQuestion}\nAssistente: ${t.answer.slice(0, 2000)}`)
      .join('\n\n');
    const previous = conv.summary ? `Resumo do que veio antes:\n${conv.summary}\n\n` : '';
    const summary = await this.aiText.generate({
      messages: [
        { role: 'system', content: COMPRESS_PROMPT },
        { role: 'user', content: `${previous}Conversa:\n${turns}` },
      ],
      source: 'chat_compression',
      sessionId: sessionId ?? conv.call?.sessionId ?? null,
      maxTokens: 600,
      timeoutMs: 45_000,
    });
    if (!summary) throw new ProviderError('O modelo não devolveu o resumo. Tente de novo.');
    conv.summary = summary;
    conv.history = [];
    conv.call = null;
    return this.context(conversationId);
  }

  async send(request: ChatRequest, options: { label?: string } = {}): Promise<{ responseId: string }> {
    const { responseId } = request;
    const conv = this.getConversation(request.conversationId);
    conv.inFlight?.abort();
    const controller = new AbortController();
    conv.inFlight = controller;
    void this.answer(request, responseId, conv, controller, options.label);
    return { responseId };
  }

  private async supportsVision(provider: AiProvider, model: string): Promise<boolean> {
    const list = await provider.listModels().catch(() => null);
    return list?.find((m) => m.id === model)?.supportsImages ?? true;
  }

  private async newUtterances(conv: Conversation, sessionId: string): Promise<{ text: string | null; cursorMs: number }> {
    const partial = this.sessions.partialSummary(sessionId);
    const version = this.sessions.version(sessionId);
    const inHistory = conv.history.reduce((n, t) => n + t.transcriptChars, 0);
    const current = conv.call;
    const newerSummary = !!partial && partial.upToMs > (current?.summary?.upToMs ?? -1);
    if (
      !current ||
      current.sessionId !== sessionId ||
      current.version !== version ||
      (newerSummary && inHistory > MAX_HISTORY_TRANSCRIPT_CHARS)
    ) {
      conv.history = conv.history.map((t) => ({ ...t, question: t.pureQuestion, transcriptChars: 0 }));
      conv.call = { sessionId, version, summary: partial, cursorMs: partial?.upToMs ?? -1 };
    }
    const call = conv.call!;
    const fresh = await this.sessions.utterancesAfter(sessionId, call.cursorMs);
    if (!fresh.length) return { text: null, cursorMs: call.cursorMs };
    const cursorMs = fresh[fresh.length - 1]!.startMs;
    let text = await this.sessions.format(fresh);
    if (text.length > MAX_NEW_UTTERANCES_CHARS) {
      const cut = text.indexOf('\n', text.length - MAX_NEW_UTTERANCES_CHARS);
      text = `(…)\n${text.slice(cut + 1)}`;
    }
    return { text, cursorMs };
  }

  private async persistExchange(request: ChatRequest, question: string, answer: string, usage: AiUsage | null): Promise<void> {
    const automatic = request.conversationId.startsWith('auto:');
    const base = { sessionId: request.sessionId ?? null, conversationId: request.conversationId, automatic };
    const withImage = request.images.length ? `🖼 ${request.images.length} imagem(ns)\n` : '';
    try {
      await this.sessions.saveMessage({ ...base, role: 'user', text: withImage + question, model: null, costUsd: null });
      await this.sessions.saveMessage({ ...base, role: 'assistant', text: answer, model: usage?.model ?? null, costUsd: usage?.costUsd ?? null });
    } catch (e) {
      this.log.warn(`failed to persist conversation: ${(e as Error).message}`);
    }
  }

  unlock(conversationId: string, usd: number): void {
    this.getConversation(conversationId).extraUsd += usd;
  }

  cancel(conversationId: string): void {
    this.conversations.get(conversationId)?.inFlight?.abort();
  }

  private getConversation(id: string): Conversation {
    let c = this.conversations.get(id);
    if (!c) {
      c = NEW_CONVERSATION();
      this.conversations.set(id, c);
    }
    return c;
  }

  private async answer(
    request: ChatRequest,
    responseId: string,
    conv: Conversation,
    controller: AbortController,
    label?: string,
  ) {
    let accumulated = '';
    let pending = '';
    let timer: NodeJS.Timeout | null = null;
    const flush = () => {
      timer = null;
      if (!pending) return;
      this.events.emit({ type: 'chat.delta', responseId, text: pending });
      pending = '';
    };

    try {
      const cfg = await this.settings.get();
      const budget = cfg.sessionBudgetUsd + conv.extraUsd;
      if (cfg.sessionBudgetUsd > 0 && conv.spendUsd >= budget) {
        throw new BudgetError(`Esta conversa chegou no teto de gasto (US$ ${budget.toFixed(2)}). Libere mais para continuar.`);
      }
      const agent = await this.agents.get(request.agentId).catch(() => this.agents.get('general'));
      const provider = this.providers.get(cfg.defaultProvider);
      let model = agent.model ?? cfg.defaultModel;
      if (request.images.length && !(await this.supportsVision(provider, model))) model = cfg.visionModel;
      if (request.sessionId) await this.transcription.waitForPending(request.sessionId, TRANSCRIPTION_WAIT_MS);
      const call = request.sessionId ? await this.newUtterances(conv, request.sessionId).catch(() => null) : null;
      const messages = buildMessages({
        agent,
        settings: cfg,
        history: conv.history,
        request,
        transcript: call?.text,
        callSummary: conv.call?.summary?.text,
        conversationSummary: conv.summary,
      });
      conv.agentId = agent.id;

      this.events.emit({ type: 'chat.start', conversationId: request.conversationId, responseId, model });

      let usage: AiUsage | null = null;
      for await (const p of provider.generate(
        {
          model,
          messages,
          web: request.web,
          reasoning: request.reasoning,
          maxTokens: request.reasoning ? MAX_REASONING_TOKENS : MAX_TOKENS,
        },
        controller.signal,
      )) {
        if (p.type === 'text') {
          accumulated += p.text;
          pending += p.text;
          timer ??= setTimeout(flush, DELTA_INTERVAL_MS);
        } else {
          usage = p.usage;
        }
      }
      if (timer) clearTimeout(timer);
      flush();

      const pureQuestion = requestText(request);
      conv.history.push({
        question: userMessage(pureQuestion, call?.text),
        pureQuestion,
        answer: accumulated,
        transcriptChars: call?.text?.length ?? 0,
      });
      if (call && conv.call) conv.call.cursorMs = call.cursorMs;
      if (conv.history.length > HISTORY_TURNS * 2) {
        conv.history.splice(0, HISTORY_TURNS);
        conv.call = null;
      }
      if (usage) {
        conv.lastUsage = usage;
        conv.spendUsd += usage.costUsd;
        await this.usage.record({ provider: provider.id, source: 'chat', sessionId: request.sessionId ?? null, usage });
      }
      this.events.emit({ type: 'chat.end', responseId, usage });
      await this.persistExchange(request, label ?? pureQuestion, accumulated, usage);
    } catch (e) {
      if (timer) clearTimeout(timer);
      if (controller.signal.aborted) {
        flush();
        this.events.emit({ type: 'chat.end', responseId, usage: null });
        return;
      }
      const cause = (e as { cause?: { code?: string } } | null)?.cause?.code;
      this.log.warn(`failed: ${(e as Error)?.message}${cause ? ` (${cause})` : ''}`);
      const message =
        e instanceof ProviderError
          ? e.message
          : e instanceof TypeError || cause
            ? 'Não consegui falar com o provedor de IA. Verifique a internet e tente de novo.'
            : e instanceof Error
              ? e.message
              : 'Erro inesperado.';
      this.events.emit({ type: 'chat.error', responseId, message, code: e instanceof BudgetError ? 'budget' : undefined });
    } finally {
      if (conv.inFlight === controller) conv.inFlight = null;
    }
  }
}

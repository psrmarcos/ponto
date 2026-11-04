import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import type {
  LiveAnalysis,
  ConversationMood,
  Utterance,
  Insight,
  VoiceMetrics,
  LiveSection,
  LiveSummary,
  InsightType,
  ConversationTone,
} from '@ponto/shared';
import { newId } from '../common/id';
import { SettingsService } from '../settings/settings.service';
import { EventsService } from '../events/events.service';
import { SessionsService } from '../sessions/sessions.service';
import { AiTextService } from '../ai/ai-text.service';

/** Minimum interval between analysis runs (and only when enough new speech arrived). */
const SUMMARY_INTERVAL_MS = 45_000;
const MIN_SUMMARY_CHARS = 300;
const INSIGHTS_INTERVAL_MS = 40_000;
const MIN_INSIGHTS_CHARS = 250;
const MAX_INSIGHTS = 30;
/** Thresholds for locally computed voice insights (zero AI cost). */
const HIGH_SHARE = 0.7;
const HIGH_PACE = 175;
const LONG_TURN_SEC = 90;
const MIN_VOICE_TIME_MS = 3 * 60_000;

interface AnalysisState {
  version: number;
  summary: LiveSummary | null;
  /** startMs of the last utterance covered by the summary. */
  summaryUpToMs: number;
  lastSummaryAt: number;
  insights: Insight[];
  tone: ConversationTone | null;
  insightsUpToMs: number;
  lastInsightsAt: number;
  /** Voice warnings already emitted (never repeated in the same session). */
  voiceWarnings: Set<string>;
  running: boolean;
  timer: NodeJS.Timeout | null;
  /** Whether the tab was opened in this session: analysis only runs once activated. */
  active: Record<LiveSection, boolean>;
}

const SUMMARY_PROMPT =
  'Você mantém o resumo ao vivo de uma call para o usuário bater o olho enquanto fala. Português do Brasil, Markdown. ' +
  'No máximo 8 tópicos curtos (até 15 palavras cada), do mais importante ao menos: assunto, o que foi perguntado e respondido, ' +
  'números, nomes, decisões, pendências. Só o que foi dito. Sem título e sem introdução. ' +
  'O usuário aparece pelo nome ou como "Você"; os outros como "Participante".';

const INSIGHTS_PROMPT = `Você é um coach discreto que acompanha uma call ao vivo e só fala quando vale a pena.
Leia o trecho recente e devolva SOMENTE um JSON:
{"tom": {"clima": "positivo"|"neutro"|"tenso"|"negativo", "outros": "...", "voce": "..."}, "insights": [0, 1 ou 2 itens {"tipo": "oportunidade"|"risco"|"voz"|"dica", "texto": "..."}]}
- tom: o clima da conversa agora e como cada lado parece estar, em até 5 palavras cada (ex.: "interessado, fazendo perguntas", "hesitante com o preço"). Tire do que foi dito e de como foi dito (palavras, hesitação, objeções, entusiasmo). Sem falas dos outros, "outros" fica "".
- oportunidade: algo que o usuário pode aproveitar agora (interesse, dor, gancho para um exemplo).
- risco: objeção, mal-entendido, resposta fraca ou promessa arriscada.
- voz: como o usuário está falando (enrolando, vago, defensivo, muito técnico, sem exemplo).
- dica: uma pergunta ou frase concreta para usar agora.
Texto com até 20 palavras, direto, em segunda pessoa ("Pergunte...", "Você..."). Português do Brasil.
Na dúvida, "insights": []. Nada óbvio, genérico ou repetido dos insights já dados.`;

const TYPE_MAP: Record<string, InsightType> = {
  oportunidade: 'opportunity',
  opportunity: 'opportunity',
  risco: 'risk',
  risk: 'risk',
  voz: 'voice',
  voice: 'voice',
  dica: 'tip',
  tip: 'tip',
};

const MOOD_MAP: Record<string, ConversationMood> = {
  positivo: 'positive',
  positive: 'positive',
  neutro: 'neutral',
  neutral: 'neutral',
  tenso: 'tense',
  tense: 'tense',
  negativo: 'negative',
  negative: 'negative',
};

/**
 * Live call analysis for the Summary and Insights tabs in Transcription. Runs in
 * the background using the fast model, at intervals, only when new speech arrived.
 * Each analysis only starts once the user opens its tab for the first time in the
 * session (and has its own toggle in settings).
 */
@Injectable()
export class LiveAnalysisService implements OnModuleInit {
  private readonly log = new Logger('LiveAnalysis');
  private readonly states = new Map<string, AnalysisState>();

  constructor(
    private readonly sessions: SessionsService,
    private readonly aiText: AiTextService,
    private readonly settings: SettingsService,
    private readonly events: EventsService,
  ) {}

  onModuleInit(): void {
    this.sessions.onNewUtterance((u) => this.schedule(u.sessionId));
  }

  async get(sessionId: string): Promise<LiveAnalysis> {
    const s = this.getState(sessionId);
    return {
      summary: s.summary,
      insights: s.insights,
      tone: s.tone,
      metrics: computeVoiceMetrics(await this.sessions.utterances(sessionId)),
      active: { ...s.active },
    };
  }

  /**
   * User opened the tab: activates that analysis in this session and generates
   * the first version immediately (from what has been spoken so far).
   */
  async activate(sessionId: string, section: LiveSection): Promise<LiveAnalysis> {
    const s = this.getState(sessionId);
    if (!s.active[section]) {
      s.active[section] = true;
      const cfg = await this.settings.get();
      const utterances = await this.sessions.utterances(sessionId);
      try {
        if (section === 'summary' && cfg.liveSummary) await this.updateSummary(sessionId, s, utterances, 1);
        if (section === 'insights' && cfg.liveInsights) {
          this.checkVoiceWarnings(sessionId, s, utterances);
          await this.fetchInsights(sessionId, s, utterances, 1);
        }
      } catch (err) {
        this.log.warn(`initial analysis failed: ${(err as Error).message}`);
      }
    }
    return this.get(sessionId);
  }

  /** "Regenerate" button: rebuilds the summary from scratch with all utterances so far. */
  async regenerateSummary(sessionId: string): Promise<LiveAnalysis> {
    const s = this.getState(sessionId);
    s.active.summary = true;
    const utterances = await this.sessions.utterances(sessionId);
    const previous = { summary: s.summary, upTo: s.summaryUpToMs };
    s.summary = null;
    s.summaryUpToMs = -1;
    try {
      await this.updateSummary(sessionId, s, utterances, 1);
    } catch (err) {
      this.log.warn(`regenerate summary failed: ${(err as Error).message}`);
    }
    // Failed or no utterances: keep previous summary.
    if (!s.summary) {
      s.summary = previous.summary;
      s.summaryUpToMs = previous.upTo;
    }
    return this.get(sessionId);
  }

  private getState(sessionId: string): AnalysisState {
    const version = this.sessions.version(sessionId);
    let s = this.states.get(sessionId);
    // Transcript cleared: previous analysis is no longer valid.
    if (!s || s.version !== version) {
      if (s?.timer) clearTimeout(s.timer);
      s = {
        version,
        summary: null,
        summaryUpToMs: -1,
        lastSummaryAt: 0,
        insights: [],
        tone: null,
        insightsUpToMs: -1,
        lastInsightsAt: 0,
        voiceWarnings: new Set(),
        running: false,
        timer: null,
        active: { summary: false, insights: false },
      };
      this.states.set(sessionId, s);
    }
    return s;
  }

  private schedule(sessionId: string): void {
    const s = this.getState(sessionId);
    if (s.timer) return;
    s.timer = setTimeout(() => {
      s.timer = null;
      void this.run(sessionId);
    }, 4000);
  }

  private async run(sessionId: string): Promise<void> {
    const s = this.getState(sessionId);
    if (s.running) return;
    s.running = true;
    try {
      const cfg = await this.settings.get();
      const utterances = await this.sessions.utterances(sessionId);
      if (s.active.insights) this.checkVoiceWarnings(sessionId, s, utterances);
      const now = Date.now();
      if (s.active.summary && cfg.liveSummary && now - s.lastSummaryAt >= SUMMARY_INTERVAL_MS) {
        await this.updateSummary(sessionId, s, utterances);
      }
      if (s.active.insights && cfg.liveInsights && now - s.lastInsightsAt >= INSIGHTS_INTERVAL_MS) {
        await this.fetchInsights(sessionId, s, utterances);
      }
    } catch (err) {
      this.log.warn(`live analysis failed: ${(err as Error).message}`);
    } finally {
      s.running = false;
    }
    // If new utterances are waiting for the interval to elapse, check again later.
    if (this.sessions.version(sessionId) === s.version) {
      const remaining = Math.min(SUMMARY_INTERVAL_MS, INSIGHTS_INTERVAL_MS);
      s.timer ??= setTimeout(() => {
        s.timer = null;
        void this.runIfHasNew(sessionId);
      }, remaining);
    }
  }

  private async runIfHasNew(sessionId: string): Promise<void> {
    const s = this.getState(sessionId);
    const fresh = await this.sessions.utterancesAfter(sessionId, Math.min(s.summaryUpToMs, s.insightsUpToMs));
    if (fresh.length) void this.run(sessionId);
  }

  private async updateSummary(sessionId: string, s: AnalysisState, utterances: Utterance[], minChars = MIN_SUMMARY_CHARS): Promise<void> {
    const fresh = utterances.filter((u) => u.startMs > s.summaryUpToMs);
    if (!fresh.length || textLength(fresh) < minChars) return;
    const version = s.version;
    let excerpt = await this.sessions.format(fresh);
    if (excerpt.length > 12_000) excerpt = `(…)\n${excerpt.slice(-12_000)}`;
    s.lastSummaryAt = Date.now();
    const text = await this.aiText.generate({
      source: 'live_summary',
      sessionId,
      maxTokens: 500,
      timeoutMs: 40_000,
      messages: [
        { role: 'system', content: SUMMARY_PROMPT },
        {
          role: 'user',
          content: `${s.summary ? `Resumo até agora:\n${s.summary.text}\n\nFalas novas:\n` : 'Falas:\n'}${excerpt}\n\nDevolva o resumo atualizado.`,
        },
      ],
    });
    if (!text || this.sessions.version(sessionId) !== version) return;
    s.summary = { text, at: Date.now() };
    s.summaryUpToMs = fresh[fresh.length - 1]!.startMs;
    this.events.emit({ type: 'session.live', sessionId, summary: s.summary });
  }

  private async fetchInsights(sessionId: string, s: AnalysisState, utterances: Utterance[], minChars = MIN_INSIGHTS_CHARS): Promise<void> {
    const fresh = utterances.filter((u) => u.startMs > s.insightsUpToMs);
    if (!fresh.length || textLength(fresh) < minChars) return;
    const version = s.version;
    // Context: include a few utterances before the new ones so the insight makes sense.
    const startIdx = Math.max(0, utterances.indexOf(fresh[0]!) - 6);
    let excerpt = await this.sessions.format(utterances.slice(startIdx));
    if (excerpt.length > 5000) excerpt = `(…)\n${excerpt.slice(-5000)}`;
    const existing = s.insights.slice(-8).map((i) => `- ${i.text}`).join('\n');
    s.lastInsightsAt = Date.now();
    const raw = await this.aiText.generate({
      source: 'insights',
      sessionId,
      maxTokens: 350,
      timeoutMs: 30_000,
      messages: [
        { role: 'system', content: INSIGHTS_PROMPT },
        { role: 'user', content: `${existing ? `Insights já dados:\n${existing}\n\n` : ''}Trecho recente da call:\n${excerpt}` },
      ],
    });
    if (this.sessions.version(sessionId) !== version) return;
    s.insightsUpToMs = fresh[fresh.length - 1]!.startMs;
    for (const i of parseInsights(raw)) this.addInsight(sessionId, s, i.type, i.text);
    const tone = parseTone(raw);
    if (tone) {
      s.tone = { ...tone, at: Date.now() };
      this.events.emit({ type: 'session.live', sessionId, tone: s.tone });
    }
  }

  /** Pace and talk share: measured locally at zero AI cost. Each warning fires at most once per session. */
  private checkVoiceWarnings(sessionId: string, s: AnalysisState, utterances: Utterance[]): void {
    const settings = this.settings;
    void settings.get().then((cfg) => {
      if (!cfg.liveInsights || !utterances.length) return;
      const m = computeVoiceMetrics(utterances);
      const duration = utterances[utterances.length - 1]!.endMs;
      if (duration < MIN_VOICE_TIME_MS) return;
      const warn = (key: string, text: string) => {
        if (s.voiceWarnings.has(key)) return;
        s.voiceWarnings.add(key);
        this.addInsight(sessionId, s, 'voice', text);
      };
      if (m.yourShare > HIGH_SHARE) {
        warn('share', `Você está com ${Math.round(m.yourShare * 100)}% da fala. Faça uma pergunta e deixe o outro lado falar.`);
      }
      if (m.yourPace && m.yourPace > HIGH_PACE) {
        warn('pace', `Você está rápido (${Math.round(m.yourPace)} palavras/min). Respire e diminua um pouco.`);
      }
      if (m.yourLongestTurn > LONG_TURN_SEC) {
        warn('longest', `Teve uma fala sua de ${Math.round(m.yourLongestTurn)} s. Respostas mais curtas prendem mais a atenção.`);
      }
    });
  }

  private addInsight(sessionId: string, s: AnalysisState, type: InsightType, text: string): void {
    const insight: Insight = { id: newId(), type, text, at: Date.now() };
    s.insights = [...s.insights, insight].slice(-MAX_INSIGHTS);
    this.events.emit({ type: 'session.live', sessionId, insight });
  }
}

const textLength = (utterances: Pick<Utterance, 'text'>[]) => utterances.reduce((n, u) => n + u.text.length, 0);

export function computeVoiceMetrics(utterances: Pick<Utterance, 'channel' | 'text' | 'startMs' | 'endMs'>[]): VoiceMetrics {
  let yours = 0;
  let others = 0;
  let words = 0;
  let longest = 0;
  for (const u of utterances) {
    const d = Math.max(0, u.endMs - u.startMs);
    if (u.channel === 'microphone') {
      yours += d;
      words += u.text.split(/\s+/).filter(Boolean).length;
      longest = Math.max(longest, d);
    } else {
      others += d;
    }
  }
  return {
    yourShare: yours + others ? yours / (yours + others) : 0,
    yourPace: yours > 20_000 ? words / (yours / 60_000) : null,
    yourLongestTurn: longest / 1000,
  };
}

/** Accepts JSON even with code fences or surrounding text; malformed input returns an empty list. */
export function parseInsights(raw: string): Array<{ type: InsightType; text: string }> {
  const obj = parseObject(raw);
  let v: unknown = obj ? obj.insights : undefined;
  if (v === undefined) {
    const start = raw.indexOf('[');
    const end = raw.lastIndexOf(']');
    if (start < 0 || end <= start) return [];
    try {
      v = JSON.parse(raw.slice(start, end + 1));
    } catch {
      return [];
    }
  }
  try {
    if (!Array.isArray(v)) return [];
    return v
      .map((i: Record<string, unknown>) => {
        if (!i || typeof i !== 'object') return null;
        const rawType = typeof i.tipo === 'string' ? i.tipo : typeof i.type === 'string' ? i.type : '';
        const rawText = typeof i.texto === 'string' ? i.texto : typeof i.text === 'string' ? i.text : '';
        const type = TYPE_MAP[rawType];
        if (!type || rawText.trim().length <= 3) return null;
        return { type, text: rawText.trim().slice(0, 240) };
      })
      .filter((i): i is { type: InsightType; text: string } => i !== null)
      .slice(0, 2);
  } catch {
    return [];
  }
}

function parseObject(raw: string): Record<string, unknown> | null {
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    const v: unknown = JSON.parse(raw.slice(start, end + 1));
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** The "tone" object returned alongside insights; if absent or malformed, returns null. */
export function parseTone(raw: string): Omit<ConversationTone, 'at'> | null {
  const obj = parseObject(raw);
  const t = (obj?.tom ?? obj?.tone) as Record<string, unknown> | undefined;
  if (!t) return null;
  const rawMood = typeof t.clima === 'string' ? t.clima : typeof t.mood === 'string' ? t.mood : '';
  const mood = MOOD_MAP[rawMood];
  if (!mood) return null;
  const short = (x: unknown) => (typeof x === 'string' ? x.trim().slice(0, 60) : '');
  return {
    mood,
    others: short(t.outros ?? t.others),
    you: short(t.voce ?? t.you),
  };
}

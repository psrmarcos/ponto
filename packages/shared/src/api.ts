import { z } from 'zod';
import { AudioChannel, Utterance, SttProviderId, STT_PROVIDERS_INFO } from './transcription';

/** Header that authenticates every call to the local API (random token per execution). */
export const TOKEN_HEADER = 'x-ponto-token';
export const DEFAULT_API_PORT = 3456;

// ---------- Languages ----------

export const Language = z.enum([
  'auto', 'pt-BR', 'pt-PT', 'en', 'es', 'fr', 'de', 'it', 'nl', 'ja', 'ko', 'zh', 'ru', 'hi', 'tr', 'pl', 'sv', 'da', 'no', 'fi', 'uk', 'id', 'vi',
]);
export type Language = z.infer<typeof Language>;

/** Native name of each language (how users look for it in the list). */
export const LANGUAGE_NAMES: Record<Language, string> = {
  auto: 'Detectar idioma',
  'pt-BR': 'Português (Brasil)',
  'pt-PT': 'Português (Portugal)',
  en: 'English',
  es: 'Español',
  fr: 'Français',
  de: 'Deutsch',
  it: 'Italiano',
  nl: 'Nederlands',
  ja: '日本語',
  ko: '한국어',
  zh: '中文',
  ru: 'Русский',
  hi: 'हिन्दी',
  tr: 'Türkçe',
  pl: 'Polski',
  sv: 'Svenska',
  da: 'Dansk',
  no: 'Norsk',
  fi: 'Suomi',
  uk: 'Українська',
  id: 'Bahasa Indonesia',
  vi: 'Tiếng Việt',
};

// ---------- AI ----------

/** AI providers. OpenRouter is implemented; others share the same interface. */
export const AiProviderId = z.enum(['openrouter', 'openai', 'anthropic']);
export type AiProviderId = z.infer<typeof AiProviderId>;

export const ProviderInfo = z.object({
  id: AiProviderId,
  name: z.string(),
  implemented: z.boolean(),
  configured: z.boolean(),
});
export type ProviderInfo = z.infer<typeof ProviderInfo>;

export const KeyTestResult = z.object({
  ok: z.boolean(),
  message: z.string(),
  /** Remaining credit in USD when reported by the provider. */
  remainingCreditUsd: z.number().nullable().optional(),
});
export type KeyTestResult = z.infer<typeof KeyTestResult>;

export const AiModel = z.object({
  id: z.string(),
  name: z.string(),
  contextLength: z.number().nullable(),
  /** USD per 1M tokens. */
  inputPrice: z.number().nullable(),
  outputPrice: z.number().nullable(),
  supportsImages: z.boolean(),
});
export type AiModel = z.infer<typeof AiModel>;

// ---------- Domain settings (stored in SQLite) ----------

export const Settings = z.object({
  userName: z.string().max(80),
  userContext: z.string().max(2000),
  defaultProvider: AiProviderId,
  /** "System 2" model (writes chat responses). */
  defaultModel: z.string().min(1),
  /** Used when an image (screenshot) is sent and the default model lacks vision. */
  visionModel: z.string().min(1),
  /** Cheap model for background tasks (titles, history compaction). */
  fastModel: z.string().min(1),
  autoSuggestions: z.boolean(),
  /** Live call summary updated automatically in the Summary tab of Transcription. */
  liveSummary: z.boolean(),
  /** Live insights in the Insights tab of Transcription. */
  liveInsights: z.boolean(),
  webByDefault: z.boolean(),
  language: Language,
  /** Speech-to-text provider. */
  sttProvider: SttProviderId,
  /** Transcription model in the selected provider. */
  sttModel: z.string().min(1),
  /** Real-time translation of utterances in Transcription. */
  translationEnabled: z.boolean(),
  translationTarget: Language.exclude(['auto']),
  /** Whose utterances to translate: only others, only you, or all. */
  translationSource: z.enum(['others', 'me', 'all']),
  /** Learning mode: besides translating, corrects your sentences in the spoken language. */
  translationLearning: z.boolean(),
  /** Deepgram: transcribe in streaming mode (text appears while the person speaks). */
  sttStreaming: z.boolean(),
  /** Spend cap per conversation in USD. 0 = no cap. */
  sessionBudgetUsd: z.number().min(0).max(100),
  activeAgentId: z.string(),
});
export type Settings = z.infer<typeof Settings>;

export const DEFAULT_SETTINGS: Settings = {
  userName: '',
  userContext: '',
  defaultProvider: 'openrouter',
  defaultModel: 'google/gemini-3.8-flash',
  fastModel: 'google/gemini-3.5-flash-lite',
  visionModel: 'google/gemini-2.5-flash-lite',
  autoSuggestions: true,
  liveSummary: true,
  liveInsights: false,
  webByDefault: false,
  language: 'pt-BR',
  sttProvider: 'openrouter',
  sttModel: STT_PROVIDERS_INFO.openrouter.defaultModel,
  sttStreaming: true,
  translationEnabled: false,
  translationTarget: 'pt-BR',
  translationSource: 'others',
  translationLearning: false,
  sessionBudgetUsd: 1,
  activeAgentId: 'general',
};

// ---------- Live analysis (Summary and Insights tabs in Transcription) ----------

export const LiveSummary = z.object({ text: z.string(), at: z.number() });
export type LiveSummary = z.infer<typeof LiveSummary>;

export const InsightType = z.enum(['opportunity', 'risk', 'voice', 'tip']);
export type InsightType = z.infer<typeof InsightType>;

export const Insight = z.object({ id: z.string(), type: InsightType, text: z.string(), at: z.number() });
export type Insight = z.infer<typeof Insight>;

/** Voice metrics computed locally without AI (speaking pace and talk share). */
export const VoiceMetrics = z.object({
  /** 0 to 1: fraction of total speaking time that is yours. */
  yourShare: z.number(),
  /** Words per minute in your utterances (null when insufficient data). */
  yourPace: z.number().nullable(),
  /** Your longest single utterance in seconds. */
  yourLongestTurn: z.number(),
});
export type VoiceMetrics = z.infer<typeof VoiceMetrics>;

/** Conversation tone inferred from text (word choice), not voice pitch. */
export const ConversationMood = z.enum(['positive', 'neutral', 'tense', 'negative']);
export type ConversationMood = z.infer<typeof ConversationMood>;
export const ConversationTone = z.object({
  mood: ConversationMood,
  /** How the other participants come across (few words). */
  others: z.string(),
  /** How you come across. */
  you: z.string(),
  at: z.number(),
});
export type ConversationTone = z.infer<typeof ConversationTone>;

export const LiveSection = z.enum(['summary', 'insights']);
export type LiveSection = z.infer<typeof LiveSection>;

export const LiveAnalysis = z.object({
  summary: LiveSummary.nullable(),
  insights: z.array(Insight),
  tone: ConversationTone.nullable(),
  metrics: VoiceMetrics,
  /** Each analysis only starts once the user opens its tab for the first time in the session. */
  active: z.object({ summary: z.boolean(), insights: z.boolean() }),
});
export type LiveAnalysis = z.infer<typeof LiveAnalysis>;

// ---------- Agents ----------

export const Agent = z.object({
  id: z.string(),
  name: z.string().min(1).max(60),
  description: z.string().max(200),
  category: z.string().max(40),
  prompt: z.string().max(8000),
  /** null = uses the default model from settings. */
  model: z.string().nullable(),
  builtIn: z.boolean(),
});
export type Agent = z.infer<typeof Agent>;

/** Create or update a custom agent (built-in agents are read-only; they can be duplicated). */
export const AgentInput = Agent.pick({ name: true, description: true, prompt: true, model: true }).extend({
  name: z.string().trim().min(1).max(60),
  prompt: z.string().trim().min(1).max(8000),
  description: z.string().trim().max(200).default(''),
  model: z.string().trim().min(1).nullable().default(null),
});
export type AgentInput = z.infer<typeof AgentInput>;

/** A saved chat message (for reviewing a session's conversation). */
export const SavedMessage = z.object({
  id: z.string(),
  conversationId: z.string(),
  role: z.enum(['user', 'assistant']),
  text: z.string(),
  createdAt: z.number(),
  /** Automatically detected in the call (Jev), not manually asked by the user. */
  automatic: z.boolean(),
  model: z.string().nullable(),
  costUsd: z.number().nullable(),
});
export type SavedMessage = z.infer<typeof SavedMessage>;

/** Session spend broken down by usage source (chat, transcription, decision, summary, compaction). */
export const SpendBySource = z.object({
  source: z.string(),
  costUsd: z.number(),
  calls: z.number().int(),
  tokens: z.number().int(),
});
export type SpendBySource = z.infer<typeof SpendBySource>;

// ---------- Translation ----------

export const UtteranceTranslation = z.object({
  sessionId: z.string(),
  utteranceId: z.string(),
  /** null when the utterance was already in the target language. */
  text: z.string().nullable(),
  /** Learning mode, only on your utterances: how to phrase it better. */
  correction: z.string().nullable(),
});
export type UtteranceTranslation = z.infer<typeof UtteranceTranslation>;

// ---------- Statistics (Home overview) ----------

export const Stats = z.object({
  sessions: z.object({ total: z.number().int(), thisMonth: z.number().int(), thisWeek: z.number().int() }),
  /** Recorded call time (from start to last utterance of each session). */
  recordedHours: z.object({ total: z.number(), thisMonth: z.number() }),
  utterances: z.object({ total: z.number().int(), yourShare: z.number() }),
  words: z.object({ yours: z.number().int(), others: z.number().int() }),
  cost: z.object({
    monthUsd: z.number(),
    totalUsd: z.number(),
    avgPerSessionUsd: z.number(),
    bySourceMonth: z.array(z.object({ source: z.string(), costUsd: z.number() })),
  }),
  chatQuestions: z.object({ total: z.number().int(), detected: z.number().int() }),
  /** Last 14 days, from oldest to today. */
  byDay: z.array(z.object({ day: z.string(), sessions: z.number().int(), minutes: z.number(), costUsd: z.number() })),
  agents: z.array(z.object({ agentId: z.string(), sessions: z.number().int() })),
});
export type Stats = z.infer<typeof Stats>;

// ---------- Chat ----------

export const UnlockSpend = z.object({ usd: z.number().positive().max(50) });
export type UnlockSpend = z.infer<typeof UnlockSpend>;

/** Breakdown of what goes into each chat call, for the context window inspector. */
export const ContextPart = z.enum(['instructions', 'profile', 'callSummary', 'conversationSummary', 'history', 'transcription']);
export type ContextPart = z.infer<typeof ContextPart>;

export const ConversationContext = z.object({
  model: z.string(),
  /** Model context window in tokens when reported by the provider. */
  limit: z.number().nullable(),
  /** Estimate (chars / 3.5) of what will be sent on the next call before the new question. */
  parts: z.array(z.object({ part: ContextPart, tokens: z.number().int() })),
  estimatedTotal: z.number().int(),
  /** Actual token numbers from the last response reported by the provider. */
  lastUsage: z.object({ inputTokens: z.number(), cachedTokens: z.number(), outputTokens: z.number() }).nullable(),
  turns: z.number().int(),
  compacted: z.boolean(),
  spendUsd: z.number(),
});
export type ConversationContext = z.infer<typeof ConversationContext>;

export const ChatRequest = z.object({
  /** Conversation the message belongs to (generated and reused by the renderer). */
  conversationId: z.string().min(1).max(64),
  /** Generated by the window so it already knows which streaming events belong to it. */
  responseId: z.string().uuid(),
  text: z.string().max(8000),
  /** Clicked action shortcut (Assist, What should I say?, Follow-up questions). */
  shortcut: z.enum(['assist', 'whatToSay', 'followUp', 'screen', 'selection']).nullable(),
  agentId: z.string(),
  web: z.boolean(),
  reasoning: z.boolean(),
  images: z.array(z.string().startsWith('data:image/')).max(4),
  /** Active transcription session: recent call utterances are included as context. */
  sessionId: z.string().max(64).nullable().optional(),
});
export type ChatRequest = z.infer<typeof ChatRequest>;

export const ChatResponse = z.object({ responseId: z.string() });
export type ChatResponse = z.infer<typeof ChatResponse>;

export const AiUsage = z.object({
  model: z.string(),
  inputTokens: z.number(),
  outputTokens: z.number(),
  cachedTokens: z.number(),
  costUsd: z.number(),
});
export type AiUsage = z.infer<typeof AiUsage>;

export const UsageSummary = z.object({
  monthCostUsd: z.number(),
  monthTokens: z.number(),
  monthCalls: z.number(),
});
export type UsageSummary = z.infer<typeof UsageSummary>;

// ---------- WebSocket events (api -> windows) ----------

export const WsEvent = z.discriminatedUnion('type', [
  z.object({ type: z.literal('hello'), version: z.string() }),
  z.object({ type: z.literal('chat.start'), conversationId: z.string(), responseId: z.string(), model: z.string() }),
  z.object({ type: z.literal('chat.delta'), responseId: z.string(), text: z.string() }),
  z.object({ type: z.literal('chat.end'), responseId: z.string(), usage: AiUsage.nullable() }),
  /** `code: 'budget'`: conversation reached its spend cap; window offers to unlock more. */
  z.object({ type: z.literal('chat.error'), responseId: z.string(), message: z.string(), code: z.enum(['budget']).optional() }),
  z.object({ type: z.literal('settings'), settings: Settings }),
  z.object({ type: z.literal('usage'), summary: UsageSummary }),
  z.object({ type: z.literal('transcription.utterance'), utterance: Utterance }),
  /** Translation of an utterance (and, in learning mode, correction of your sentence). */
  z.object({ type: z.literal('transcription.translation'), translation: UtteranceTranslation }),
  /** Interim text of an ongoing utterance (streaming). Empty text means finished or discarded. */
  z.object({
    type: z.literal('transcription.partial'),
    sessionId: z.string(),
    channel: AudioChannel,
    text: z.string(),
    startMs: z.number(),
  }),
  /** Utterances cleared (up to `upToMs`, inclusive). */
  z.object({ type: z.literal('transcription.cleared'), sessionId: z.string(), upToMs: z.number() }),
  /** App detected a question for the user and started answering (chat.* with this responseId). */
  z.object({ type: z.literal('suggestion.new'), sessionId: z.string(), responseId: z.string(), question: z.string() }),
  /** Live session analysis: updated summary, new insight, and/or updated tone. */
  z.object({
    type: z.literal('session.live'),
    sessionId: z.string(),
    summary: LiveSummary.optional(),
    insight: Insight.optional(),
    tone: ConversationTone.optional(),
  }),
  /** Agents list changed (created, updated, deleted). */
  z.object({ type: z.literal('agents'), agents: z.array(Agent) }),
  z.object({ type: z.literal('transcription.error'), sessionId: z.string(), message: z.string() }),
  /** Session minutes: started generating, finished, or failed. */
  z.object({
    type: z.literal('session.summary'),
    sessionId: z.string(),
    status: z.enum(['generating', 'ready', 'error']),
    message: z.string().optional(),
  }),
]);
export type WsEvent = z.infer<typeof WsEvent>;

/** Messages main -> api over utilityProcess private channel (never over the network). */
export const MessageToApi = z.discriminatedUnion('type', [
  z.object({ type: z.literal('secrets'), values: z.record(z.string(), z.string()) }),
]);
export type MessageToApi = z.infer<typeof MessageToApi>;

export const MessageFromApi = z.discriminatedUnion('type', [
  z.object({ type: z.literal('ready'), port: z.number() }),
  z.object({ type: z.literal('error'), message: z.string() }),
]);
export type MessageFromApi = z.infer<typeof MessageFromApi>;

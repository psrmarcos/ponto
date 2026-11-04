import { z } from 'zod';
import { AudioChannel, Utterance, SttProviderId, STT_PROVIDERS_INFO } from './transcription';

export const TOKEN_HEADER = 'x-ponto-token';
export const DEFAULT_API_PORT = 3456;

export const Language = z.enum([
  'auto', 'pt-BR', 'pt-PT', 'en', 'es', 'fr', 'de', 'it', 'nl', 'ja', 'ko', 'zh', 'ru', 'hi', 'tr', 'pl', 'sv', 'da', 'no', 'fi', 'uk', 'id', 'vi',
]);
export type Language = z.infer<typeof Language>;

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
  remainingCreditUsd: z.number().nullable().optional(),
});
export type KeyTestResult = z.infer<typeof KeyTestResult>;

export const AiModel = z.object({
  id: z.string(),
  name: z.string(),
  contextLength: z.number().nullable(),
  inputPrice: z.number().nullable(),
  outputPrice: z.number().nullable(),
  supportsImages: z.boolean(),
});
export type AiModel = z.infer<typeof AiModel>;

export const Settings = z.object({
  userName: z.string().max(80),
  userContext: z.string().max(2000),
  defaultProvider: AiProviderId,
  defaultModel: z.string().min(1),
  visionModel: z.string().min(1),
  fastModel: z.string().min(1),
  autoSuggestions: z.boolean(),
  liveSummary: z.boolean(),
  liveInsights: z.boolean(),
  webByDefault: z.boolean(),
  language: Language,
  sttProvider: SttProviderId,
  sttModel: z.string().min(1),
  translationEnabled: z.boolean(),
  translationTarget: Language.exclude(['auto']),
  translationSource: z.enum(['others', 'me', 'all']),
  translationLearning: z.boolean(),
  sttStreaming: z.boolean(),
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

export const LiveSummary = z.object({ text: z.string(), at: z.number() });
export type LiveSummary = z.infer<typeof LiveSummary>;

export const InsightType = z.enum(['opportunity', 'risk', 'voice', 'tip']);
export type InsightType = z.infer<typeof InsightType>;

export const Insight = z.object({ id: z.string(), type: InsightType, text: z.string(), at: z.number() });
export type Insight = z.infer<typeof Insight>;

export const VoiceMetrics = z.object({
  yourShare: z.number(),
  yourPace: z.number().nullable(),
  yourLongestTurn: z.number(),
});
export type VoiceMetrics = z.infer<typeof VoiceMetrics>;

export const ConversationMood = z.enum(['positive', 'neutral', 'tense', 'negative']);
export type ConversationMood = z.infer<typeof ConversationMood>;
export const ConversationTone = z.object({
  mood: ConversationMood,
  others: z.string(),
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
  active: z.object({ summary: z.boolean(), insights: z.boolean() }),
});
export type LiveAnalysis = z.infer<typeof LiveAnalysis>;

export const Agent = z.object({
  id: z.string(),
  name: z.string().min(1).max(60),
  description: z.string().max(200),
  category: z.string().max(40),
  prompt: z.string().max(8000),
  model: z.string().nullable(),
  builtIn: z.boolean(),
});
export type Agent = z.infer<typeof Agent>;

export const AgentInput = Agent.pick({ name: true, description: true, prompt: true, model: true }).extend({
  name: z.string().trim().min(1).max(60),
  prompt: z.string().trim().min(1).max(8000),
  description: z.string().trim().max(200).default(''),
  model: z.string().trim().min(1).nullable().default(null),
});
export type AgentInput = z.infer<typeof AgentInput>;

export const SavedMessage = z.object({
  id: z.string(),
  conversationId: z.string(),
  role: z.enum(['user', 'assistant']),
  text: z.string(),
  createdAt: z.number(),
  automatic: z.boolean(),
  model: z.string().nullable(),
  costUsd: z.number().nullable(),
});
export type SavedMessage = z.infer<typeof SavedMessage>;

export const SpendBySource = z.object({
  source: z.string(),
  costUsd: z.number(),
  calls: z.number().int(),
  tokens: z.number().int(),
});
export type SpendBySource = z.infer<typeof SpendBySource>;

export const UtteranceTranslation = z.object({
  sessionId: z.string(),
  utteranceId: z.string(),
  text: z.string().nullable(),
  correction: z.string().nullable(),
});
export type UtteranceTranslation = z.infer<typeof UtteranceTranslation>;

export const Stats = z.object({
  sessions: z.object({ total: z.number().int(), thisMonth: z.number().int(), thisWeek: z.number().int() }),
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
  byDay: z.array(z.object({ day: z.string(), sessions: z.number().int(), minutes: z.number(), costUsd: z.number() })),
  agents: z.array(z.object({ agentId: z.string(), sessions: z.number().int() })),
});
export type Stats = z.infer<typeof Stats>;

export const UnlockSpend = z.object({ usd: z.number().positive().max(50) });
export type UnlockSpend = z.infer<typeof UnlockSpend>;

export const ContextPart = z.enum(['instructions', 'profile', 'callSummary', 'conversationSummary', 'history', 'transcription']);
export type ContextPart = z.infer<typeof ContextPart>;

export const ConversationContext = z.object({
  model: z.string(),
  limit: z.number().nullable(),
  parts: z.array(z.object({ part: ContextPart, tokens: z.number().int() })),
  estimatedTotal: z.number().int(),
  lastUsage: z.object({ inputTokens: z.number(), cachedTokens: z.number(), outputTokens: z.number() }).nullable(),
  turns: z.number().int(),
  compacted: z.boolean(),
  spendUsd: z.number(),
});
export type ConversationContext = z.infer<typeof ConversationContext>;

export const ChatRequest = z.object({
  conversationId: z.string().min(1).max(64),
  responseId: z.string().uuid(),
  text: z.string().max(8000),
  shortcut: z.enum(['assist', 'whatToSay', 'followUp', 'screen', 'selection']).nullable(),
  agentId: z.string(),
  web: z.boolean(),
  reasoning: z.boolean(),
  images: z.array(z.string().startsWith('data:image/')).max(4),
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

export const WsEvent = z.discriminatedUnion('type', [
  z.object({ type: z.literal('hello'), version: z.string() }),
  z.object({ type: z.literal('chat.start'), conversationId: z.string(), responseId: z.string(), model: z.string() }),
  z.object({ type: z.literal('chat.delta'), responseId: z.string(), text: z.string() }),
  z.object({ type: z.literal('chat.end'), responseId: z.string(), usage: AiUsage.nullable() }),
  z.object({ type: z.literal('chat.error'), responseId: z.string(), message: z.string(), code: z.enum(['budget']).optional() }),
  z.object({ type: z.literal('settings'), settings: Settings }),
  z.object({ type: z.literal('usage'), summary: UsageSummary }),
  z.object({ type: z.literal('transcription.utterance'), utterance: Utterance }),
  z.object({ type: z.literal('transcription.translation'), translation: UtteranceTranslation }),
  z.object({
    type: z.literal('transcription.partial'),
    sessionId: z.string(),
    channel: AudioChannel,
    text: z.string(),
    startMs: z.number(),
  }),
  z.object({ type: z.literal('transcription.cleared'), sessionId: z.string(), upToMs: z.number() }),
  z.object({ type: z.literal('suggestion.new'), sessionId: z.string(), responseId: z.string(), question: z.string() }),
  z.object({
    type: z.literal('session.live'),
    sessionId: z.string(),
    summary: LiveSummary.optional(),
    insight: Insight.optional(),
    tone: ConversationTone.optional(),
  }),
  z.object({ type: z.literal('agents'), agents: z.array(Agent) }),
  z.object({ type: z.literal('transcription.error'), sessionId: z.string(), message: z.string() }),
  z.object({
    type: z.literal('session.summary'),
    sessionId: z.string(),
    status: z.enum(['generating', 'ready', 'error']),
    message: z.string().optional(),
  }),
]);
export type WsEvent = z.infer<typeof WsEvent>;

export const MessageToApi = z.discriminatedUnion('type', [
  z.object({ type: z.literal('secrets'), values: z.record(z.string(), z.string()) }),
]);
export type MessageToApi = z.infer<typeof MessageToApi>;

export const MessageFromApi = z.discriminatedUnion('type', [
  z.object({ type: z.literal('ready'), port: z.number() }),
  z.object({ type: z.literal('error'), message: z.string() }),
]);
export type MessageFromApi = z.infer<typeof MessageFromApi>;

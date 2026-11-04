import type { AiProviderId, AiModel, KeyTestResult, AiUsage } from '@ponto/shared';

export type MessagePart =
  | { type: 'text'; text: string; /** marks the end of the stable prefix for provider caching */ cache?: boolean }
  | { type: 'image'; url: string };

export interface AiMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | MessagePart[];
}

export interface GenerationRequest {
  model: string;
  messages: AiMessage[];
  web: boolean;
  reasoning: boolean;
  maxTokens: number;
  temperature?: number;
}

export type GenerationChunk = { type: 'text'; text: string } | { type: 'usage'; usage: AiUsage };

/**
 * Contract for an AI provider. To add a new provider (direct OpenAI, Anthropic,
 * local Ollama...), implement this interface and register it in ProvidersService.
 * Nothing outside `ai/` knows provider-specific details.
 */
export interface AiProvider {
  readonly id: AiProviderId;
  readonly name: string;
  readonly implemented: boolean;
  isConfigured(): boolean;
  testKey(): Promise<KeyTestResult>;
  listModels(): Promise<AiModel[]>;
  /** Streams generation chunks. Must stop and throw AbortError when `signal` is aborted. */
  generate(request: GenerationRequest, signal: AbortSignal): AsyncIterable<GenerationChunk>;
}

export class ProviderError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
  }
}

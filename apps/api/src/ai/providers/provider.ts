import type { AiProviderId, AiModel, KeyTestResult, AiUsage } from '@ponto/shared';

export type MessagePart =
  | { type: 'text'; text: string;  cache?: boolean }
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

export interface AiProvider {
  readonly id: AiProviderId;
  readonly name: string;
  readonly implemented: boolean;
  isConfigured(): boolean;
  testKey(): Promise<KeyTestResult>;
  listModels(): Promise<AiModel[]>;
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

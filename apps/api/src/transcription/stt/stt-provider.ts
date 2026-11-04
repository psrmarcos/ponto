import type { Settings, SttProviderId } from '@ponto/shared';

export interface SttRequest {
  wav: Buffer;
  model: string;
  language: Settings['language'];
  durationSec: number;
}

export interface SttResult {
  text: string;
  costUsd: number;
}

export interface SttProvider {
  readonly id: SttProviderId;
  transcribe(request: SttRequest, signal: AbortSignal): Promise<SttResult>;
}

export class SttError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
  }
}

export function messageForStatus(provider: string, status: number, body: string): string {
  if (status === 401 || status === 403) return `A chave do ${provider} foi recusada. Confira em Perfil.`;
  if (status === 402) return `Sem crédito no ${provider} para transcrever.`;
  if (status === 429) return `O ${provider} pediu para ir mais devagar (limite de uso).`;
  return `O ${provider} respondeu ${status} ao transcrever.${body ? ` ${body.slice(0, 160)}` : ''}`;
}

import type { Configuracoes, IdProvedorStt } from '@ponto/shared';

export interface PedidoStt {
  /** WAV PCM 16 bits, mono, 16 kHz. */
  wav: Buffer;
  modelo: string;
  idioma: Configuracoes['idioma'];
  duracaoS: number;
}

export interface ResultadoStt {
  texto: string;
  /** Custo informado pelo provedor, ou estimado pela duração quando ele não informa. */
  custoUsd: number;
}

/** Um serviço que transforma um trecho de áudio em texto. */
export interface ProvedorStt {
  readonly id: IdProvedorStt;
  transcrever(pedido: PedidoStt, sinal: AbortSignal): Promise<ResultadoStt>;
}

export class ErroStt extends Error {
  constructor(
    mensagem: string,
    readonly status?: number,
  ) {
    super(mensagem);
  }
}

export function mensagemPorStatus(provedor: string, status: number, corpo: string): string {
  if (status === 401 || status === 403) return `A chave do ${provedor} foi recusada. Confira em Perfil.`;
  if (status === 402) return `Sem crédito no ${provedor} para transcrever.`;
  if (status === 429) return `O ${provedor} pediu para ir mais devagar (limite de uso).`;
  return `O ${provedor} respondeu ${status} ao transcrever.${corpo ? ` ${corpo.slice(0, 160)}` : ''}`;
}

import type { IdProvedorIa, ModeloIa, ResultadoTesteChave, UsoIa } from '@ponto/shared';

export type ParteMensagem =
  | { tipo: 'texto'; texto: string; /** marca o fim do prefixo estável para cache do provedor */ cache?: boolean }
  | { tipo: 'imagem'; url: string };

export interface MensagemIa {
  papel: 'system' | 'user' | 'assistant';
  conteudo: string | ParteMensagem[];
}

export interface PedidoGeracao {
  modelo: string;
  mensagens: MensagemIa[];
  web: boolean;
  raciocinio: boolean;
  maxTokens: number;
  temperatura?: number;
}

export type PedacoGeracao = { tipo: 'texto'; texto: string } | { tipo: 'uso'; uso: UsoIa };

/**
 * Contrato de um provedor de IA. Para adicionar um provedor novo (OpenAI direto,
 * Anthropic, Ollama local...), implemente esta interface e registre em
 * ProvedoresService. Nada fora da pasta ia/ conhece detalhes do provedor.
 */
export interface ProvedorIa {
  readonly id: IdProvedorIa;
  readonly nome: string;
  readonly implementado: boolean;
  configurado(): boolean;
  testarChave(): Promise<ResultadoTesteChave>;
  listarModelos(): Promise<ModeloIa[]>;
  /** Gera em streaming. Deve parar e lançar AbortError quando `sinal` for abortado. */
  gerar(pedido: PedidoGeracao, sinal: AbortSignal): AsyncIterable<PedacoGeracao>;
}

export class ErroProvedor extends Error {
  constructor(
    mensagem: string,
    readonly status?: number,
  ) {
    super(mensagem);
  }
}

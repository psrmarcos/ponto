import { z } from 'zod';
import { Fala, IdProvedorStt, INFO_PROVEDORES_STT } from './transcricao';

/** Cabeçalho que autentica cada chamada à API local (token aleatório gerado pelo main a cada execução). */
export const CABECALHO_TOKEN = 'x-ponto-token';
export const PORTA_API_PADRAO = 3456;

// ---------- IA ----------

/** Provedores de IA. Só o OpenRouter está implementado; os outros entram pela mesma interface. */
export const IdProvedorIa = z.enum(['openrouter', 'openai', 'anthropic']);
export type IdProvedorIa = z.infer<typeof IdProvedorIa>;

export const InfoProvedor = z.object({
  id: IdProvedorIa,
  nome: z.string(),
  implementado: z.boolean(),
  configurado: z.boolean(),
});
export type InfoProvedor = z.infer<typeof InfoProvedor>;

export const ResultadoTesteChave = z.object({
  ok: z.boolean(),
  mensagem: z.string(),
  /** Crédito restante em US$, quando o provedor informa. */
  creditoRestanteUsd: z.number().nullable().optional(),
});
export type ResultadoTesteChave = z.infer<typeof ResultadoTesteChave>;

export const ModeloIa = z.object({
  id: z.string(),
  nome: z.string(),
  contexto: z.number().nullable(),
  /** US$ por 1M tokens. */
  precoEntrada: z.number().nullable(),
  precoSaida: z.number().nullable(),
  aceitaImagem: z.boolean(),
});
export type ModeloIa = z.infer<typeof ModeloIa>;

// ---------- Configurações do domínio (ficam no SQLite) ----------

export const Configuracoes = z.object({
  nomeUsuario: z.string().max(80),
  contextoUsuario: z.string().max(2000),
  provedorPadrao: IdProvedorIa,
  /** Modelo do "System 2" (quem escreve as respostas). */
  modeloPadrao: z.string().min(1),
  /** Modelo barato para tarefas internas (títulos, compactação de histórico). */
  modeloRapido: z.string().min(1),
  sugestoesAutomaticas: z.boolean(),
  webPorPadrao: z.boolean(),
  idioma: z.enum(['auto', 'pt-BR', 'en', 'es']),
  /** Quem transcreve o áudio. */
  provedorStt: IdProvedorStt,
  /** Modelo de transcrição no provedor escolhido. */
  modeloStt: z.string().min(1),
  /** Teto de gasto por sessão em US$. 0 = sem teto. */
  tetoSessaoUsd: z.number().min(0).max(100),
  agenteAtivo: z.string(),
});
export type Configuracoes = z.infer<typeof Configuracoes>;

export const CONFIGURACOES_PADRAO: Configuracoes = {
  nomeUsuario: '',
  contextoUsuario: '',
  provedorPadrao: 'openrouter',
  modeloPadrao: 'google/gemini-3.8-flash',
  modeloRapido: 'google/gemini-3.5-flash-lite',
  sugestoesAutomaticas: true,
  webPorPadrao: false,
  idioma: 'auto',
  provedorStt: 'openrouter',
  modeloStt: INFO_PROVEDORES_STT.openrouter.modeloPadrao,
  tetoSessaoUsd: 1,
  agenteAtivo: 'geral',
};

// ---------- Agentes ----------

export const Agente = z.object({
  id: z.string(),
  nome: z.string().min(1).max(60),
  descricao: z.string().max(200),
  categoria: z.string().max(40),
  prompt: z.string().max(8000),
  /** null = usa o modelo padrão das configurações. */
  modelo: z.string().nullable(),
  embutido: z.boolean(),
});
export type Agente = z.infer<typeof Agente>;

// ---------- Chat ----------

export const PedidoChat = z.object({
  /** Conversa à qual a mensagem pertence (o renderer gera e reusa). */
  conversaId: z.string().min(1).max(64),
  /** Gerado pela janela, para ela já saber de quem são os eventos de streaming que chegarem. */
  respostaId: z.string().uuid(),
  texto: z.string().max(8000),
  /** Atalho clicado (Assist, O que devo dizer?, Perguntas de follow-up). */
  atalho: z.enum(['assist', 'oQueDizer', 'followUp']).nullable(),
  agenteId: z.string(),
  web: z.boolean(),
  raciocinio: z.boolean(),
  imagens: z.array(z.string().startsWith('data:image/')).max(4),
  /** Sessão de transcrição em andamento: o trecho recente da conversa entra como contexto. */
  sessaoId: z.string().max(64).nullable().optional(),
});
export type PedidoChat = z.infer<typeof PedidoChat>;

export const RespostaPedidoChat = z.object({ respostaId: z.string() });
export type RespostaPedidoChat = z.infer<typeof RespostaPedidoChat>;

export const UsoIa = z.object({
  modelo: z.string(),
  tokensEntrada: z.number(),
  tokensSaida: z.number(),
  tokensCache: z.number(),
  custoUsd: z.number(),
});
export type UsoIa = z.infer<typeof UsoIa>;

export const ResumoUso = z.object({
  custoMesUsd: z.number(),
  tokensMes: z.number(),
  chamadasMes: z.number(),
});
export type ResumoUso = z.infer<typeof ResumoUso>;

// ---------- Eventos do WebSocket (api -> janelas) ----------

export const EventoWs = z.discriminatedUnion('tipo', [
  z.object({ tipo: z.literal('ola'), versao: z.string() }),
  z.object({ tipo: z.literal('chat.inicio'), conversaId: z.string(), respostaId: z.string(), modelo: z.string() }),
  z.object({ tipo: z.literal('chat.delta'), respostaId: z.string(), texto: z.string() }),
  z.object({ tipo: z.literal('chat.fim'), respostaId: z.string(), uso: UsoIa.nullable() }),
  z.object({ tipo: z.literal('chat.erro'), respostaId: z.string(), mensagem: z.string() }),
  z.object({ tipo: z.literal('configuracoes'), configuracoes: Configuracoes }),
  z.object({ tipo: z.literal('uso'), resumo: ResumoUso }),
  z.object({ tipo: z.literal('transcricao.fala'), fala: Fala }),
  z.object({ tipo: z.literal('transcricao.erro'), sessaoId: z.string(), mensagem: z.string() }),
]);
export type EventoWs = z.infer<typeof EventoWs>;

/** Mensagens main -> api pelo canal do utilityProcess (nunca passam pela rede). */
export const MensagemParaApi = z.discriminatedUnion('tipo', [
  z.object({ tipo: z.literal('segredos'), valores: z.record(z.string(), z.string()) }),
]);
export type MensagemParaApi = z.infer<typeof MensagemParaApi>;

export const MensagemDaApi = z.discriminatedUnion('tipo', [
  z.object({ tipo: z.literal('pronta'), porta: z.number() }),
  z.object({ tipo: z.literal('erro'), mensagem: z.string() }),
]);
export type MensagemDaApi = z.infer<typeof MensagemDaApi>;

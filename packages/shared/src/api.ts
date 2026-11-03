import { z } from 'zod';
import { CanalAudio, Fala, IdProvedorStt, INFO_PROVEDORES_STT } from './transcricao';

/** Cabeçalho que autentica cada chamada à API local (token aleatório gerado pelo main a cada execução). */
export const CABECALHO_TOKEN = 'x-ponto-token';
export const PORTA_API_PADRAO = 3456;

// ---------- Idiomas ----------

export const Idioma = z.enum([
  'auto', 'pt-BR', 'pt-PT', 'en', 'es', 'fr', 'de', 'it', 'nl', 'ja', 'ko', 'zh', 'ru', 'hi', 'tr', 'pl', 'sv', 'da', 'no', 'fi', 'uk', 'id', 'vi',
]);
export type Idioma = z.infer<typeof Idioma>;

/** Nome de cada idioma no próprio idioma (como a pessoa procura na lista). */
export const NOMES_IDIOMA: Record<Idioma, string> = {
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
  /** Usado quando vai imagem (print da tela) e o modelo das respostas não enxerga. */
  modeloVisao: z.string().min(1),
  /** Modelo barato para tarefas internas (títulos, compactação de histórico). */
  modeloRapido: z.string().min(1),
  sugestoesAutomaticas: z.boolean(),
  /** Resumo da call que se atualiza sozinho na aba Resumo da Transcrição. */
  resumoAoVivo: z.boolean(),
  /** Insights na aba Insights da Transcrição (só os que valem a pena). */
  insightsAoVivo: z.boolean(),
  webPorPadrao: z.boolean(),
  idioma: Idioma,
  /** Quem transcreve o áudio. */
  provedorStt: IdProvedorStt,
  /** Modelo de transcrição no provedor escolhido. */
  modeloStt: z.string().min(1),
  /** Tradução em tempo real das falas na Transcrição. */
  traducaoLigada: z.boolean(),
  traducaoDestino: Idioma.exclude(['auto']),
  /** De quem traduzir: só os outros, só você ou todos. */
  traducaoDe: z.enum(['outros', 'eu', 'todos']),
  /** Modo aprendizado: além de traduzir, corrige as suas frases no idioma da conversa. */
  traducaoAprendizado: z.boolean(),
  /** Deepgram: transcreve em streaming (o texto aparece enquanto a pessoa fala). */
  sttStreaming: z.boolean(),
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
  // Medido no PC do Marcos: ~1,4 s de ponta a ponta e US$ 0,0002 por resposta.
  modeloVisao: 'google/gemini-2.5-flash-lite',
  sugestoesAutomaticas: true,
  resumoAoVivo: true,
  insightsAoVivo: false,
  webPorPadrao: false,
  // Fixar o idioma evita que ruído vire frase em outra língua.
  idioma: 'pt-BR',
  provedorStt: 'openrouter',
  modeloStt: INFO_PROVEDORES_STT.openrouter.modeloPadrao,
  sttStreaming: true,
  traducaoLigada: false,
  traducaoDestino: 'pt-BR',
  traducaoDe: 'outros',
  traducaoAprendizado: false,
  tetoSessaoUsd: 1,
  agenteAtivo: 'geral',
};

// ---------- Análise ao vivo (abas Resumo e Insights da Transcrição) ----------

export const ResumoAoVivo = z.object({ texto: z.string(), em: z.number() });
export type ResumoAoVivo = z.infer<typeof ResumoAoVivo>;

export const TipoInsight = z.enum(['oportunidade', 'risco', 'voz', 'dica']);
export type TipoInsight = z.infer<typeof TipoInsight>;

export const Insight = z.object({ id: z.string(), tipo: TipoInsight, texto: z.string(), em: z.number() });
export type Insight = z.infer<typeof Insight>;

/** Medidas da voz calculadas no PC, sem IA (ritmo e quanto cada lado fala). */
export const MetricasVoz = z.object({
  /** 0 a 1: parte do tempo de fala que é sua. */
  suaParte: z.number(),
  /** Palavras por minuto nas suas falas (null sem dados). */
  seuRitmo: z.number().nullable(),
  /** Sua fala mais longa, em segundos. */
  suaMaiorFala: z.number(),
});
export type MetricasVoz = z.infer<typeof MetricasVoz>;

export const ParteAoVivo = z.enum(['resumo', 'insights']);
export type ParteAoVivo = z.infer<typeof ParteAoVivo>;

export const AoVivo = z.object({
  resumo: ResumoAoVivo.nullable(),
  insights: z.array(Insight),
  metricas: MetricasVoz,
  /** Cada análise só começa quando a pessoa abre a aba pela primeira vez na sessão. */
  ativo: z.object({ resumo: z.boolean(), insights: z.boolean() }),
});
export type AoVivo = z.infer<typeof AoVivo>;

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

/** Criar ou editar um agente seu (os embutidos não mudam; dá para duplicar). */
export const EdicaoAgente = Agente.pick({ nome: true, descricao: true, prompt: true, modelo: true }).extend({
  nome: z.string().trim().min(1).max(60),
  prompt: z.string().trim().min(1).max(8000),
  descricao: z.string().trim().max(200).default(''),
  modelo: z.string().trim().min(1).nullable().default(null),
});
export type EdicaoAgente = z.infer<typeof EdicaoAgente>;

/** Uma troca do chat guardada (para rever a conversa de uma sessão). */
export const MensagemSalva = z.object({
  id: z.string(),
  conversaId: z.string(),
  papel: z.enum(['eu', 'ia']),
  texto: z.string(),
  criadoEm: z.number(),
  /** Detectada sozinha na call (Jev), não foi você que perguntou. */
  automatica: z.boolean(),
  modelo: z.string().nullable(),
  custoUsd: z.number().nullable(),
});
export type MensagemSalva = z.infer<typeof MensagemSalva>;

/** Gasto de uma sessão por tipo de uso (chat, transcricao, decisao, resumo, compactacao). */
export const GastoPorOrigem = z.object({
  origem: z.string(),
  custoUsd: z.number(),
  chamadas: z.number().int(),
  tokens: z.number().int(),
});
export type GastoPorOrigem = z.infer<typeof GastoPorOrigem>;

// ---------- Tradução ----------

export const TraducaoFala = z.object({
  sessaoId: z.string(),
  falaId: z.string(),
  /** null quando a fala já estava no idioma de destino. */
  texto: z.string().nullable(),
  /** Modo aprendizado, só nas suas falas: como dizer melhor. */
  correcao: z.string().nullable(),
});
export type TraducaoFala = z.infer<typeof TraducaoFala>;

// ---------- Estatísticas (Início da Home) ----------

export const Estatisticas = z.object({
  sessoes: z.object({ total: z.number().int(), noMes: z.number().int(), naSemana: z.number().int() }),
  /** Tempo de call gravado (do início à última fala de cada sessão). */
  horasGravadas: z.object({ total: z.number(), noMes: z.number() }),
  falas: z.object({ total: z.number().int(), suaParte: z.number() }),
  palavras: z.object({ suas: z.number().int(), outros: z.number().int() }),
  custo: z.object({
    mesUsd: z.number(),
    totalUsd: z.number(),
    mediaPorSessaoUsd: z.number(),
    porOrigemMes: z.array(z.object({ origem: z.string(), custoUsd: z.number() })),
  }),
  perguntasAoChat: z.object({ total: z.number().int(), detectadas: z.number().int() }),
  /** Últimos 14 dias, do mais antigo ao de hoje. */
  porDia: z.array(z.object({ dia: z.string(), sessoes: z.number().int(), minutos: z.number(), custoUsd: z.number() })),
  agentes: z.array(z.object({ agenteId: z.string(), sessoes: z.number().int() })),
});
export type Estatisticas = z.infer<typeof Estatisticas>;

// ---------- Chat ----------

export const LiberarGasto = z.object({ usd: z.number().positive().max(50) });
export type LiberarGasto = z.infer<typeof LiberarGasto>;

/** O que vai em cada chamada do chat, por parte, para a janela de contexto. */
export const ParteContexto = z.enum(['instrucoes', 'perfil', 'resumoCall', 'resumoConversa', 'historico', 'transcricao']);
export type ParteContexto = z.infer<typeof ParteContexto>;

export const ContextoConversa = z.object({
  modelo: z.string(),
  /** Janela de contexto do modelo em tokens, quando o provedor informa. */
  limite: z.number().nullable(),
  /** Estimativa (caracteres / 3,5) do que vai na próxima chamada, antes da pergunta nova. */
  partes: z.array(z.object({ parte: ParteContexto, tokens: z.number().int() })),
  totalEstimado: z.number().int(),
  /** Números reais da última resposta, vindos do provedor. */
  ultima: z.object({ tokensEntrada: z.number(), tokensCache: z.number(), tokensSaida: z.number() }).nullable(),
  trocas: z.number().int(),
  compactada: z.boolean(),
  gastoUsd: z.number(),
});
export type ContextoConversa = z.infer<typeof ContextoConversa>;

export const PedidoChat = z.object({
  /** Conversa à qual a mensagem pertence (o renderer gera e reusa). */
  conversaId: z.string().min(1).max(64),
  /** Gerado pela janela, para ela já saber de quem são os eventos de streaming que chegarem. */
  respostaId: z.string().uuid(),
  texto: z.string().max(8000),
  /** Atalho clicado (Assist, O que devo dizer?, Perguntas de follow-up). */
  atalho: z.enum(['assist', 'oQueDizer', 'followUp', 'tela', 'selecao']).nullable(),
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
  /** `codigo: 'teto'`: a conversa bateu no teto de gasto; a janela oferece liberar mais. */
  z.object({ tipo: z.literal('chat.erro'), respostaId: z.string(), mensagem: z.string(), codigo: z.enum(['teto']).optional() }),
  z.object({ tipo: z.literal('configuracoes'), configuracoes: Configuracoes }),
  z.object({ tipo: z.literal('uso'), resumo: ResumoUso }),
  z.object({ tipo: z.literal('transcricao.fala'), fala: Fala }),
  /** Tradução de uma fala (e, no modo aprendizado, a correção da sua frase). */
  z.object({ tipo: z.literal('transcricao.traducao'), traducao: TraducaoFala }),
  /** Texto provisório da fala em andamento (streaming). Texto vazio: a fala terminou ou foi descartada. */
  z.object({
    tipo: z.literal('transcricao.parcial'),
    sessaoId: z.string(),
    canal: CanalAudio,
    texto: z.string(),
    inicioMs: z.number(),
  }),
  /** Falas apagadas (até `ateMs`, inclusive). */
  z.object({ tipo: z.literal('transcricao.limpa'), sessaoId: z.string(), ateMs: z.number() }),
  /** O app detectou uma pergunta para o usuário e já começou a responder (chat.* com este respostaId). */
  z.object({ tipo: z.literal('sugestao.nova'), sessaoId: z.string(), respostaId: z.string(), pergunta: z.string() }),
  /** Análise ao vivo da sessão: resumo novo e/ou insight novo. */
  z.object({ tipo: z.literal('sessao.aoVivo'), sessaoId: z.string(), resumo: ResumoAoVivo.optional(), insight: Insight.optional() }),
  /** A lista de agentes mudou (criado, editado, apagado). */
  z.object({ tipo: z.literal('agentes'), agentes: z.array(Agente) }),
  z.object({ tipo: z.literal('transcricao.erro'), sessaoId: z.string(), mensagem: z.string() }),
  /** Ata da sessão: começou a ser gerada, ficou pronta ou falhou. */
  z.object({
    tipo: z.literal('sessao.resumo'),
    sessaoId: z.string(),
    status: z.enum(['gerando', 'pronto', 'erro']),
    mensagem: z.string().optional(),
  }),
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

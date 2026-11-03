import { z } from 'zod';

/**
 * Captura de áudio e transcrição (M1).
 *
 * São dois canais separados, e é isso que faz a "diarização" básica: o que vem
 * do microfone é você, o que vem do áudio do computador são os outros
 * participantes. Não precisa entrar na reunião nem de bot.
 */

export const CanalAudio = z.enum(['microfone', 'sistema']);
export type CanalAudio = z.infer<typeof CanalAudio>;

export const Fala = z.object({
  id: z.string(),
  sessaoId: z.string(),
  canal: CanalAudio,
  /** Nome de quem falou, quando conhecido. null = "Você" no microfone e "Participante" no sistema. */
  falante: z.string().nullable(),
  texto: z.string(),
  /** Milissegundos desde o início da sessão. */
  inicioMs: z.number().int(),
  fimMs: z.number().int(),
});
export type Fala = z.infer<typeof Fala>;

export const Sessao = z.object({
  id: z.string(),
  titulo: z.string(),
  agenteId: z.string(),
  iniciadaEm: z.number(),
  encerradaEm: z.number().nullable(),
  /** Ata da reunião em Markdown, gerada ao encerrar. */
  resumo: z.string().nullable(),
});
export type Sessao = z.infer<typeof Sessao>;

/** Linha da lista de sessões na Home. */
export const SessaoNaLista = Sessao.omit({ resumo: true }).extend({
  totalFalas: z.number().int(),
  /** Fim da última fala, para mostrar a duração. */
  duracaoMs: z.number().int(),
  temResumo: z.boolean(),
  gerandoResumo: z.boolean(),
});
export type SessaoNaLista = z.infer<typeof SessaoNaLista>;

export const EdicaoSessao = z.object({ titulo: z.string().trim().min(1).max(120) });
export type EdicaoSessao = z.infer<typeof EdicaoSessao>;

export const NovaSessao = z.object({ agenteId: z.string().optional() });
export type NovaSessao = z.infer<typeof NovaSessao>;

/** Quem transforma áudio em texto. Fica plugável: dá para somar outros depois. */
export const IdProvedorStt = z.enum(['openrouter', 'deepgram']);
export type IdProvedorStt = z.infer<typeof IdProvedorStt>;

export const INFO_PROVEDORES_STT: Record<IdProvedorStt, { nome: string; modeloPadrao: string; chave: 'openrouter' | 'deepgram' }> = {
  openrouter: { nome: 'OpenRouter', modeloPadrao: 'openai/whisper-large-v3-turbo', chave: 'openrouter' },
  deepgram: { nome: 'Deepgram', modeloPadrao: 'nova-3', chave: 'deepgram' },
};

/** Query string do POST /transcricao/trechos (o corpo é o WAV cru). */
export const TrechoAudio = z.object({
  sessaoId: z.string().min(1).max(64),
  canal: CanalAudio,
  inicioMs: z.coerce.number().int().min(0),
  fimMs: z.coerce.number().int().min(0),
});
export type TrechoAudio = z.infer<typeof TrechoAudio>;

// ---------- Estado da captura (dono: processo principal) ----------

export const StatusCaptura = z.enum(['parada', 'iniciando', 'gravando', 'pausada']);
export type StatusCaptura = z.infer<typeof StatusCaptura>;

export const EstadoCaptura = z.object({
  status: StatusCaptura,
  sessaoId: z.string().nullable(),
  /** Epoch ms do início da sessão, para o cronômetro. */
  iniciadaEm: z.number().nullable(),
  /** Qual fonte está chegando de fato (o áudio do sistema pode não ser suportado). */
  fontes: z.object({ microfone: z.boolean(), sistema: z.boolean() }),
  /** Último problema, em linguagem de gente. Some quando a captura volta a funcionar. */
  erro: z.string().nullable(),
});
export type EstadoCaptura = z.infer<typeof EstadoCaptura>;

export const ESTADO_CAPTURA_INICIAL: EstadoCaptura = {
  status: 'parada',
  sessaoId: null,
  iniciadaEm: null,
  fontes: { microfone: false, sistema: false },
  erro: null,
};

export const ComandoCaptura = z.object({ acao: z.enum(['iniciar', 'pausar', 'retomar', 'parar']) });
export type ComandoCaptura = z.infer<typeof ComandoCaptura>;

/** Volume atual de cada canal, de 0 a 1 (para os medidores). */
export const NiveisAudio = z.object({ microfone: z.number().min(0).max(1), sistema: z.number().min(0).max(1) });
export type NiveisAudio = z.infer<typeof NiveisAudio>;

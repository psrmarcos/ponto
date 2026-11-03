import { z } from 'zod';
import { IdJanela } from './janelas';
import { IdSegredo } from './segredos';

/** Atalhos globais configuráveis. Valor no formato Accelerator do Electron (ex.: "CommandOrControl+Shift+I"). */
export const AcaoAtalho = z.enum([
  'alternarStealth',
  'alternarChat',
  'alternarTranscricao',
  'alternarTela',
  'alternarHome',
  'lerTela',
]);
export type AcaoAtalho = z.infer<typeof AcaoAtalho>;

export const ATALHOS_PADRAO: Record<AcaoAtalho, string> = {
  alternarStealth: 'CommandOrControl+Shift+I',
  alternarChat: 'CommandOrControl+Shift+H',
  alternarTranscricao: 'CommandOrControl+Shift+T',
  alternarTela: 'CommandOrControl+Shift+E',
  alternarHome: 'CommandOrControl+Shift+O',
  lerTela: 'CommandOrControl+Shift+S',
};

export const StatusApi = z.enum(['iniciando', 'pronta', 'caiu']);
export type StatusApi = z.infer<typeof StatusApi>;

/**
 * Estado do app que o processo principal é dono e espelha em todas as janelas.
 * O main sempre manda o objeto inteiro (é pequeno), então nenhuma janela fica
 * com uma visão parcial ou atrasada.
 */
export const EstadoApp = z.object({
  stealth: z.object({
    /** Interruptor global: quando ligado, TODAS as janelas somem de gravações e prints. */
    ligado: z.boolean(),
    /** false no Linux, onde o SO não oferece proteção de captura. */
    suportado: z.boolean(),
  }),
  janelas: z.record(IdJanela, z.object({ visivel: z.boolean() })),
  atalhos: z.record(AcaoAtalho, z.string()),
  /** Atalhos que o SO recusou registrar (outro app já usa). */
  atalhosComErro: z.array(AcaoAtalho),
  api: z.object({ status: StatusApi }),
  /** Quais chaves de API estão cadastradas (nunca o valor). */
  chavesConfiguradas: z.array(IdSegredo),
  plataforma: z.enum(['win32', 'darwin', 'linux']),
  versao: z.string(),
});
export type EstadoApp = z.infer<typeof EstadoApp>;

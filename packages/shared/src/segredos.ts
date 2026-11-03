import { z } from 'zod';

/**
 * Chaves que o usuário cadastra. Ficam só no processo principal, cifradas com o
 * cofre do SO (safeStorage). O renderer nunca recebe o valor, só se está configurada.
 */
export const IdSegredo = z.enum(['openrouter', 'openai', 'anthropic', 'deepgram']);
export type IdSegredo = z.infer<typeof IdSegredo>;

export const StatusSegredo = z.object({
  configurado: z.boolean(),
  /** Últimos 4 caracteres, para o usuário reconhecer qual chave está salva. */
  final: z.string().nullable(),
});
export type StatusSegredo = z.infer<typeof StatusSegredo>;


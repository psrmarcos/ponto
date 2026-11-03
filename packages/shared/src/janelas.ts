import { z } from 'zod';

/**
 * Janelas do app. Cada uma é uma BrowserWindow independente que carrega o mesmo
 * renderer com `?janela=<id>`. Para criar uma janela nova:
 *   1. adicione o id aqui;
 *   2. descreva tamanho/posição em apps/desktop/src/main/janelas/definicoes.ts;
 *   3. crie o componente em apps/desktop/src/renderer/janelas/ e registre em App.tsx.
 */
export const IdJanela = z.enum(['agregador', 'transcricao', 'tela', 'home']);
export type IdJanela = z.infer<typeof IdJanela>;

export const Retangulo = z.object({
  x: z.number().int(),
  y: z.number().int(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
});
export type Retangulo = z.infer<typeof Retangulo>;

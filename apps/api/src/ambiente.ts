import { randomBytes } from 'node:crypto';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { PORTA_API_PADRAO } from '@ponto/shared';

/**
 * Configuração vinda do processo principal do Electron (variáveis de ambiente do
 * utilityProcess). Rodando a API sozinha (`pnpm --filter @ponto/api start`) os
 * padrões abaixo valem e o token é impresso no console.
 */
const tokenDoPai = process.env.PONTO_TOKEN;

export const ambiente = {
  porta: Number(process.env.PONTO_PORTA ?? PORTA_API_PADRAO),
  token: tokenDoPai ?? randomBytes(24).toString('hex'),
  arquivoBanco: process.env.PONTO_BANCO ?? join(tmpdir(), 'ponto-dev', 'ponto.db'),
  versao: process.env.PONTO_VERSAO ?? '0.0.0-dev',
  /** true quando a API roda dentro do Electron (utilityProcess). */
  dentroDoElectron: typeof process.parentPort !== 'undefined',
  tokenGerado: !tokenDoPai,
};

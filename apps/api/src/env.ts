import { randomBytes } from 'node:crypto';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { DEFAULT_API_PORT } from '@ponto/shared';

const parentToken = process.env.PONTO_TOKEN;

export const env = {
  port: Number(process.env.PONTO_PORT ?? DEFAULT_API_PORT),
  token: parentToken ?? randomBytes(24).toString('hex'),
  dbPath: process.env.PONTO_DB ?? join(tmpdir(), 'ponto-dev', 'ponto.db'),
  version: process.env.PONTO_VERSION ?? '0.0.0-dev',
  insideElectron: typeof process.parentPort !== 'undefined',
  tokenGenerated: !parentToken,
};

import { DatabaseSync, type StatementSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { drizzle, type SqliteRemoteDatabase } from 'drizzle-orm/sqlite-proxy';
import { migrate } from 'drizzle-orm/sqlite-proxy/migrator';
import * as schema from './schema';

export type Banco = SqliteRemoteDatabase<typeof schema>;

/**
 * Liga o Drizzle ao `node:sqlite` (embutido no Node/Electron, sem módulo nativo
 * para recompilar). O Drizzle não tem driver oficial para ele, então usamos o
 * driver "proxy": o Drizzle monta o SQL e nós executamos aqui.
 */
export function abrirBanco(arquivo: string): { banco: Banco; sqlite: DatabaseSync } {
  if (arquivo !== ':memory:') mkdirSync(dirname(arquivo), { recursive: true });
  const sqlite = new DatabaseSync(arquivo);
  sqlite.exec('PRAGMA journal_mode = WAL;');
  sqlite.exec('PRAGMA synchronous = NORMAL;');
  sqlite.exec('PRAGMA foreign_keys = ON;');
  sqlite.exec('PRAGMA busy_timeout = 3000;');

  const cache = new Map<string, StatementSync>();
  const preparar = (sql: string): StatementSync => {
    let st = cache.get(sql);
    if (!st) {
      st = sqlite.prepare(sql);
      cache.set(sql, st);
    }
    return st;
  };

  // O proxy espera linhas como arrays na ordem das colunas selecionadas.
  const comoArray = (linha: unknown): unknown[] => Object.values(linha as Record<string, unknown>);

  const banco = drizzle(
    async (sql, params, metodo) => {
      const st = preparar(sql);
      const p = params as never[];
      if (metodo === 'run') {
        st.run(...p);
        return { rows: [] };
      }
      if (metodo === 'get') {
        const linha = st.get(...p);
        return { rows: linha ? comoArray(linha) : (undefined as never) };
      }
      return { rows: st.all(...p).map(comoArray) };
    },
    { schema },
  );

  return { banco, sqlite };
}

export async function migrarBanco(banco: Banco, sqlite: DatabaseSync): Promise<void> {
  await migrate(
    banco,
    async (queries) => {
      sqlite.exec('BEGIN');
      try {
        for (const q of queries) sqlite.exec(q);
        sqlite.exec('COMMIT');
      } catch (e) {
        sqlite.exec('ROLLBACK');
        throw e;
      }
    },
    { migrationsFolder: join(__dirname, 'migracoes') },
  );
}

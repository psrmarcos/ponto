import { DatabaseSync, type StatementSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { drizzle, type SqliteRemoteDatabase } from 'drizzle-orm/sqlite-proxy';
import { migrate } from 'drizzle-orm/sqlite-proxy/migrator';
import * as schema from './schema';

export type Database = SqliteRemoteDatabase<typeof schema>;

/**
 * Connects Drizzle to `node:sqlite` (built into Node/Electron, no native module
 * to rebuild). Drizzle has no official driver for it, so we use `sqlite-proxy`:
 * Drizzle builds the SQL and we execute it here.
 */
export function openDatabase(file: string): { db: Database; sqlite: DatabaseSync } {
  if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true });
  const sqlite = new DatabaseSync(file);
  sqlite.exec('PRAGMA journal_mode = WAL;');
  sqlite.exec('PRAGMA synchronous = NORMAL;');
  sqlite.exec('PRAGMA foreign_keys = ON;');
  sqlite.exec('PRAGMA busy_timeout = 3000;');

  const cache = new Map<string, StatementSync>();
  const prepare = (sql: string): StatementSync => {
    let st = cache.get(sql);
    if (!st) {
      st = sqlite.prepare(sql);
      cache.set(sql, st);
    }
    return st;
  };

  // The proxy expects rows as arrays in the order of selected columns.
  const asArray = (row: unknown): unknown[] => Object.values(row as Record<string, unknown>);

  const db = drizzle(
    async (sql, params, method) => {
      const st = prepare(sql);
      const p = params as never[];
      if (method === 'run') {
        st.run(...p);
        return { rows: [] };
      }
      if (method === 'get') {
        const row = st.get(...p);
        return { rows: row ? asArray(row) : (undefined as never) };
      }
      return { rows: st.all(...p).map(asArray) };
    },
    { schema },
  );

  return { db, sqlite };
}

export async function migrateDatabase(db: Database, sqlite: DatabaseSync): Promise<void> {
  await migrate(
    db,
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
    { migrationsFolder: join(__dirname, 'migrations') },
  );
}

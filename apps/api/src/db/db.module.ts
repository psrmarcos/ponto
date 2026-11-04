import { Global, Module } from '@nestjs/common';
import type { DatabaseSync } from 'node:sqlite';
import { env } from '../env';
import { openDatabase, migrateDatabase, type Database } from './connection';

export const DB = Symbol('DB');
export const SQLITE = Symbol('SQLITE');

@Global()
@Module({
  providers: [
    {
      provide: 'CONNECTION',
      useFactory: async (): Promise<{ db: Database; sqlite: DatabaseSync }> => {
        const connection = openDatabase(env.dbPath);
        await migrateDatabase(connection.db, connection.sqlite);
        return connection;
      },
    },
    { provide: DB, useFactory: (c: { db: Database }) => c.db, inject: ['CONNECTION'] },
    { provide: SQLITE, useFactory: (c: { sqlite: DatabaseSync }) => c.sqlite, inject: ['CONNECTION'] },
  ],
  exports: [DB, SQLITE],
})
export class DbModule {}

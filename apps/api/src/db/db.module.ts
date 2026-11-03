import { Global, Module } from '@nestjs/common';
import type { DatabaseSync } from 'node:sqlite';
import { ambiente } from '../ambiente';
import { abrirBanco, migrarBanco, type Banco } from './conexao';

/** Token de injeção do banco: `@Inject(BANCO) private readonly banco: Banco`. */
export const BANCO = Symbol('BANCO');
export const SQLITE = Symbol('SQLITE');

@Global()
@Module({
  providers: [
    {
      provide: 'CONEXAO',
      useFactory: async (): Promise<{ banco: Banco; sqlite: DatabaseSync }> => {
        const conexao = abrirBanco(ambiente.arquivoBanco);
        await migrarBanco(conexao.banco, conexao.sqlite);
        return conexao;
      },
    },
    { provide: BANCO, useFactory: (c: { banco: Banco }) => c.banco, inject: ['CONEXAO'] },
    { provide: SQLITE, useFactory: (c: { sqlite: DatabaseSync }) => c.sqlite, inject: ['CONEXAO'] },
  ],
  exports: [BANCO, SQLITE],
})
export class DbModule {}

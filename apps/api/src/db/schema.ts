import { sqliteTable, text, integer, real, index } from 'drizzle-orm/sqlite-core';

/**
 * Esquema do banco local (SQLite em modo WAL, arquivo no userData do app).
 * Depois de mudar este arquivo rode `pnpm db:gerar` para criar a migração.
 */

/** Configurações do domínio, uma linha por chave, valor em JSON. */
export const configuracoes = sqliteTable('configuracoes', {
  chave: text('chave').primaryKey(),
  valor: text('valor', { mode: 'json' }).notNull(),
  atualizadoEm: integer('atualizado_em', { mode: 'timestamp_ms' }).notNull(),
});

export const agentes = sqliteTable('agentes', {
  id: text('id').primaryKey(),
  nome: text('nome').notNull(),
  descricao: text('descricao').notNull().default(''),
  categoria: text('categoria').notNull().default(''),
  prompt: text('prompt').notNull(),
  modelo: text('modelo'),
  embutido: integer('embutido', { mode: 'boolean' }).notNull().default(false),
  ordem: integer('ordem').notNull().default(0),
  criadoEm: integer('criado_em', { mode: 'timestamp_ms' }).notNull(),
});

/** Uma call/reunião. */
export const sessoes = sqliteTable('sessoes', {
  id: text('id').primaryKey(),
  titulo: text('titulo').notNull().default('Sessão sem título'),
  agenteId: text('agente_id').notNull(),
  iniciadaEm: integer('iniciada_em', { mode: 'timestamp_ms' }).notNull(),
  encerradaEm: integer('encerrada_em', { mode: 'timestamp_ms' }),
  resumo: text('resumo'),
});

/** Trechos da transcrição. `canal` separa o microfone (você) do áudio do sistema (os outros). */
export const falas = sqliteTable(
  'falas',
  {
    id: text('id').primaryKey(),
    sessaoId: text('sessao_id').notNull().references(() => sessoes.id, { onDelete: 'cascade' }),
    canal: text('canal', { enum: ['microfone', 'sistema'] }).notNull(),
    falante: text('falante'),
    texto: text('texto').notNull(),
    inicioMs: integer('inicio_ms').notNull(),
    fimMs: integer('fim_ms').notNull(),
  },
  (t) => [index('falas_sessao_idx').on(t.sessaoId, t.inicioMs)],
);

/** Toda chamada de IA paga fica registrada aqui: é a base do controle de gasto. */
export const usoIa = sqliteTable(
  'uso_ia',
  {
    id: text('id').primaryKey(),
    criadoEm: integer('criado_em', { mode: 'timestamp_ms' }).notNull(),
    sessaoId: text('sessao_id'),
    provedor: text('provedor').notNull(),
    modelo: text('modelo').notNull(),
    /** chat, decisao (System 1), visao, resumo, compactacao... */
    origem: text('origem').notNull(),
    tokensEntrada: integer('tokens_entrada').notNull().default(0),
    tokensSaida: integer('tokens_saida').notNull().default(0),
    tokensCache: integer('tokens_cache').notNull().default(0),
    custoUsd: real('custo_usd').notNull().default(0),
  },
  (t) => [index('uso_criado_idx').on(t.criadoEm)],
);

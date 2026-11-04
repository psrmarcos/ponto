import { sqliteTable, text, integer, real, index } from 'drizzle-orm/sqlite-core';

export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value', { mode: 'json' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
});

export const agents = sqliteTable('agents', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description').notNull().default(''),
  category: text('category').notNull().default(''),
  prompt: text('prompt').notNull(),
  model: text('model'),
  builtIn: integer('built_in', { mode: 'boolean' }).notNull().default(false),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
});

export const sessions = sqliteTable('sessions', {
  id: text('id').primaryKey(),
  title: text('title').notNull().default('Sessão sem título'),
  agentId: text('agent_id').notNull(),
  startedAt: integer('started_at', { mode: 'timestamp_ms' }).notNull(),
  endedAt: integer('ended_at', { mode: 'timestamp_ms' }),
  summary: text('summary'),
});

export const utterances = sqliteTable(
  'utterances',
  {
    id: text('id').primaryKey(),
    sessionId: text('session_id')
      .notNull()
      .references(() => sessions.id, { onDelete: 'cascade' }),
    channel: text('channel', { enum: ['microphone', 'system'] }).notNull(),
    speaker: text('speaker'),
    text: text('text').notNull(),
    startMs: integer('start_ms').notNull(),
    endMs: integer('end_ms').notNull(),
  },
  (t) => [index('utterances_session_idx').on(t.sessionId, t.startMs)],
);

export const aiUsage = sqliteTable(
  'ai_usage',
  {
    id: text('id').primaryKey(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    sessionId: text('session_id'),
    provider: text('provider').notNull(),
    model: text('model').notNull(),
    source: text('source').notNull(),
    inputTokens: integer('input_tokens').notNull().default(0),
    outputTokens: integer('output_tokens').notNull().default(0),
    cachedTokens: integer('cached_tokens').notNull().default(0),
    costUsd: real('cost_usd').notNull().default(0),
  },
  (t) => [index('usage_created_idx').on(t.createdAt)],
);

export const chatMessages = sqliteTable(
  'chat_messages',
  {
    id: text('id').primaryKey(),
    sessionId: text('session_id').references(() => sessions.id, { onDelete: 'cascade' }),
    conversationId: text('conversation_id').notNull(),
    role: text('role', { enum: ['user', 'assistant'] }).notNull(),
    text: text('text').notNull(),
    automatic: integer('automatic', { mode: 'boolean' }).notNull().default(false),
    model: text('model'),
    costUsd: real('cost_usd'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (t) => [index('messages_session_idx').on(t.sessionId, t.createdAt)],
);

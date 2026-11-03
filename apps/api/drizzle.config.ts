import { defineConfig } from 'drizzle-kit';

// Gera as migrações SQL a partir de src/db/schema.ts: `pnpm db:gerar`.
export default defineConfig({
  dialect: 'sqlite',
  schema: './src/db/schema.ts',
  out: './src/db/migracoes',
});

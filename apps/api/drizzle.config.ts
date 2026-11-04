import { defineConfig } from 'drizzle-kit';

// Generates SQL migrations from src/db/schema.ts: `pnpm db:generate`.
export default defineConfig({
  dialect: 'sqlite',
  schema: './src/db/schema.ts',
  out: './src/db/migrations',
});

// O tsc não copia arquivos .sql: levamos as migrações para dist/ junto do código.
import { cpSync } from 'node:fs';
cpSync(new URL('../src/db/migracoes', import.meta.url), new URL('../dist/db/migracoes', import.meta.url), { recursive: true });

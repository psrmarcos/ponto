// Copies SQL migration files into dist/ after `tsc` builds.
// Drizzle reads these files at startup (`migrateDatabase`).
import { cpSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const source = join(root, '..', 'src', 'db', 'migrations');
const target = join(root, '..', 'dist', 'db', 'migrations');

if (existsSync(source)) {
  cpSync(source, target, { recursive: true });
}

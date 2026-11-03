import { defineConfig } from 'vitest/config';

// O JSX do renderer usa o runtime automático (igual ao Vite do app).
export default defineConfig({ esbuild: { jsx: 'automatic' } });

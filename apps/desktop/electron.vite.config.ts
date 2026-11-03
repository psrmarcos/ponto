import { resolve } from 'node:path';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import type { Plugin } from 'vite';

/**
 * Content-Security-Policy das janelas. No build é estrita (só scripts do próprio
 * app; rede só para a API local). Em dev o Vite precisa de script inline e do
 * servidor de HMR.
 */
function csp(): Plugin {
  const comum = [
    "default-src 'self'",
    "img-src 'self' data: blob:",
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self' data:",
    "object-src 'none'",
    "base-uri 'none'",
  ];
  return {
    name: 'ponto-csp',
    transformIndexHtml(html, ctx) {
      const dev = !!ctx.server;
      const politica = [
        ...comum,
        dev ? "script-src 'self' 'unsafe-inline'" : "script-src 'self'",
        dev ? "connect-src 'self' http://127.0.0.1:* ws://127.0.0.1:* ws://localhost:*" : "connect-src http://127.0.0.1:* ws://127.0.0.1:*",
      ].join('; ');
      return html.replace('<!--CSP-->', `<meta http-equiv="Content-Security-Policy" content="${politica}" />`);
    },
  };
}

export default defineConfig({
  main: {
    // Dependências ficam fora do bundle (node_modules), menos o contrato compartilhado.
    plugins: [externalizeDepsPlugin({ exclude: ['@ponto/shared'] })],
  },
  preload: {
    // Preload com sandbox: precisa ser um arquivo só, sem require de pacotes.
    plugins: [externalizeDepsPlugin({ exclude: ['@ponto/shared', 'zod'] })],
    build: { rollupOptions: { output: { format: 'cjs' } } },
  },
  renderer: {
    root: resolve(__dirname, 'src/renderer'),
    plugins: [react(), tailwindcss(), csp()],
    build: { rollupOptions: { input: resolve(__dirname, 'src/renderer/index.html') } },
  },
});

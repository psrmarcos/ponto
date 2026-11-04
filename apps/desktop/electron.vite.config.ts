import { resolve } from 'node:path';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import type { Plugin } from 'vite';

/**
 * Window Content-Security-Policy. Strict in production builds (only scripts from
 * the app itself; network restricted to the local API). In dev, Vite requires
 * inline scripts and the HMR server.
 */
function csp(): Plugin {
  const base = [
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
      const isDev = !!ctx.server;
      const policy = [
        ...base,
        isDev ? "script-src 'self' 'unsafe-inline'" : "script-src 'self'",
        isDev ? "connect-src 'self' http://127.0.0.1:* ws://127.0.0.1:* ws://localhost:*" : "connect-src http://127.0.0.1:* ws://127.0.0.1:*",
      ].join('; ');
      return html.replace('<!--CSP-->', `<meta http-equiv="Content-Security-Policy" content="${policy}" />`);
    },
  };
}

export default defineConfig({
  main: {
    // Keep dependencies external (node_modules), except the shared contract.
    plugins: [externalizeDepsPlugin({ exclude: ['@ponto/shared'] })],
  },
  preload: {
    // Sandboxed preload: must be a single bundled file without external package requires.
    plugins: [externalizeDepsPlugin({ exclude: ['@ponto/shared', 'zod'] })],
    build: { rollupOptions: { output: { format: 'cjs' } } },
  },
  renderer: {
    root: resolve(__dirname, 'src/renderer'),
    plugins: [react(), tailwindcss(), csp()],
    build: { rollupOptions: { input: resolve(__dirname, 'src/renderer/index.html') } },
  },
});
